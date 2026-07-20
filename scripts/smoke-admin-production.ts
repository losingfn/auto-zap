import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminSessions, adminUsers } from "@/db/schema";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  buildAdminSessionCookiePayload,
  buildAdminSessionCookieValue,
  getAdminSessionSecret
} from "@/features/admin/session-cookie";

const ADMIN_ROUTES = [
  "/admin",
  "/admin/import",
  "/admin/review",
  "/admin/content",
  "/admin/contacts",
  "/admin/hours",
  "/admin/photos",
  "/admin/vacancies",
  "/admin/brand",
  "/admin/category-icons",
  "/admin/catalog",
  "/admin/categories",
  "/admin/subcategories",
  "/admin/rules",
  "/admin/synonyms",
  "/admin/backups",
  "/admin/security"
];

const REQUEST_TIMEOUT_MS = 8_000;
const READY_TIMEOUT_MS = 30_000;

async function main() {
  await run("pnpm", ["build"]);

  const port = String(3100 + randomInt(0, 700));
  const server = startServer(port);

  try {
    await waitForServer(port);
    const session = await createSmokeAdminSession();
    const results = [];

    for (const route of ADMIN_ROUTES) {
      const result = await checkRoute(port, route, session.cookie);
      results.push(result);
      console.log(`${route} ${result.status} ${result.ms}ms`);
    }

    await db.delete(adminSessions).where(eq(adminSessions.id, session.sessionId));

    const failures = results.filter((result) => result.status >= 500 || result.error);
    const slow = results.filter((result) => result.ms > REQUEST_TIMEOUT_MS);

    if (failures.length > 0 || slow.length > 0) {
      for (const failure of failures) {
        console.error(
          `[smoke-admin-production] failed ${failure.route}: ${failure.status} ${failure.error ?? ""}`.trim()
        );
      }
      for (const item of slow) {
        console.error(`[smoke-admin-production] slow ${item.route}: ${item.ms}ms`);
      }
      process.exitCode = 1;
      return;
    }
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function startServer(port: string) {
  const server = spawn(process.execPath, [".next/standalone/server.js"], {
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      PORT: port
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return server;
}

async function waitForServer(port: string) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1_000)
      });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Production server did not become ready in ${READY_TIMEOUT_MS}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function createSmokeAdminSession() {
  const [user] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.isActive, true))
    .limit(1);

  if (!user) {
    throw new Error("No active admin user found for production smoke test.");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000);
  const [session] = await db
    .insert(adminSessions)
    .values({
      adminUserId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      ipAddress: "127.0.0.1",
      userAgent: "autozap-admin-production-smoke",
      expiresAt
    })
    .returning({ id: adminSessions.id });

  const payload = buildAdminSessionCookiePayload(session.id, token, expiresAt.getTime());
  const signature = createHmac("sha256", getAdminSessionSecret())
    .update(payload)
    .digest("base64url");
  const cookieValue = buildAdminSessionCookieValue(payload, signature);

  return {
    sessionId: session.id,
    cookie: `${ADMIN_SESSION_COOKIE}=${cookieValue}`
  };
}

async function checkRoute(port: string, route: string, cookie: string) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      headers: { cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    await response.arrayBuffer();
    return {
      route,
      status: response.status,
      ms: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      route,
      status: 599,
      ms: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function run(command: string, args: string[]) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit"
  });
  const [code] = await once(child, "exit");

  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${code}`);
  }
}

async function waitForExit(child: ChildProcess) {
  if (child.exitCode !== null) {
    return;
  }

  const timeout = setTimeout(() => child.kill("SIGKILL"), 2_000);
  await once(child, "exit").catch(() => undefined);
  clearTimeout(timeout);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 50);
  });
