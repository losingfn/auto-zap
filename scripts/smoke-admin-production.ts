import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
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

const HTML_ASSET_ROUTES = ["/admin", "/admin/review", "/admin/import"];
const PUBLIC_ASSETS = [
  "/assets/brand/logo.svg",
  "/assets/brand/logo-mark.png",
  "/assets/brand/favicon.svg",
  "/assets/categories/ves-assortiment.png",
  "/favicon-32x32.png"
];

const REQUEST_TIMEOUT_MS = 8_000;
const READY_TIMEOUT_MS = 30_000;

type SmokeSession = {
  sessionId: string;
  cookieHeader: string;
  cookieValue: string;
  expiresAt: Date;
};

type RouteResult = {
  body?: string;
  error?: string;
  ms: number;
  route: string;
  status: number;
};

async function main() {
  let server: ChildProcess | null = null;
  let session: SmokeSession | null = null;

  try {
    await run("pnpm", ["build"]);
    await assertStandaloneRelease();

    const port = String(3100 + randomInt(0, 700));
    server = startServer(port);
    await waitForServer(port);

    session = await createSmokeAdminSession();
    const routeResults = [];

    for (const route of ADMIN_ROUTES) {
      const result = await checkRoute(port, route, session.cookieHeader);
      routeResults.push(result);
      console.log(`${route} ${result.status} ${result.ms}ms`);
    }
    assertRoutesHealthy(routeResults);

    const assetResults = await checkStaticAndPublicAssets(port, routeResults, session.cookieHeader);
    for (const result of assetResults) {
      console.log(`${result.kind} ${result.url} ${result.status} ${result.bytes}b ${result.ms}ms`);
    }

    const browserResult = await runBrowserNavigationSmoke(port, session);
    for (const step of browserResult.steps) {
      console.log(`browser ${step.name} ${step.url} ${step.ms}ms`);
    }
    console.log(
      `browser consoleErrors=${browserResult.consoleErrors.length} failedRequests=${browserResult.failedRequests.length} documentNavigations=${browserResult.documentNavigations.length}`
    );
  } finally {
    if (session) {
      await db.delete(adminSessions).where(eq(adminSessions.id, session.sessionId));
    }
    if (server) {
      server.kill();
      await waitForExit(server);
    }
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

async function assertStandaloneRelease() {
  const checks = [
    [".next/standalone/server.js", "standalone server.js"],
    [".next/standalone/.next/static", "standalone static directory"],
    [".next/standalone/public", "standalone public directory"],
    [".next/standalone/public/assets/brand/logo.svg", "standalone logo.svg"]
  ] as const;

  for (const [filePath, label] of checks) {
    const fileStat = await stat(path.join(process.cwd(), filePath)).catch(() => null);
    if (!fileStat) {
      throw new Error(`${label} is missing at ${filePath}`);
    }
    console.log(
      `standalone ${filePath} ${fileStat.isDirectory() ? "dir" : "file"} ${fileStat.size}b`
    );
  }
}

async function createSmokeAdminSession(): Promise<SmokeSession> {
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
    cookieHeader: `${ADMIN_SESSION_COOKIE}=${cookieValue}`,
    cookieValue,
    expiresAt
  };
}

async function checkRoute(port: string, route: string, cookie: string): Promise<RouteResult> {
  const startedAt = performance.now();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      headers: { cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const body = await response.text();
    return {
      route,
      status: response.status,
      ms: Math.round(performance.now() - startedAt),
      body: HTML_ASSET_ROUTES.includes(route) ? body : undefined
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

function assertRoutesHealthy(results: RouteResult[]) {
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
    throw new Error("Admin route smoke failed.");
  }
}

async function checkStaticAndPublicAssets(port: string, results: RouteResult[], cookie: string) {
  const html = results
    .filter((result) => HTML_ASSET_ROUTES.includes(result.route))
    .map((result) => result.body ?? "")
    .join("\n");
  const staticUrls = extractStaticAssetUrls(html);
  const jsUrls = staticUrls.filter((url) => url.endsWith(".js")).slice(0, 8);
  const cssUrls = staticUrls.filter((url) => url.endsWith(".css")).slice(0, 4);

  if (jsUrls.length === 0) {
    throw new Error("No /_next/static JavaScript assets found in admin HTML.");
  }
  if (cssUrls.length === 0) {
    throw new Error("No /_next/static CSS assets found in admin HTML.");
  }

  const checks = [
    ...jsUrls.map((url) => ({ kind: "static-js", url })),
    ...cssUrls.map((url) => ({ kind: "static-css", url })),
    ...PUBLIC_ASSETS.map((url) => ({ kind: "public", url }))
  ];
  const assetResults = [];

  for (const check of checks) {
    const startedAt = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}${check.url}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const bytes = (await response.arrayBuffer()).byteLength;
    const result = {
      ...check,
      status: response.status,
      bytes,
      ms: Math.round(performance.now() - startedAt)
    };
    assetResults.push(result);

    if (response.status !== 200 || bytes === 0) {
      throw new Error(`${check.kind} ${check.url} returned ${response.status} with ${bytes} bytes.`);
    }
  }

  return assetResults;
}

function extractStaticAssetUrls(html: string) {
  const urls = new Set<string>();
  const attributePattern = /\s(?:src|href)="([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(html))) {
    const url = match[1] ?? "";
    const pathname = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0] ?? url;
    if (pathname.startsWith("/_next/static/")) {
      urls.add(pathname);
    }
  }

  return [...urls].sort();
}

async function runBrowserNavigationSmoke(port: string, session: SmokeSession) {
  const browser = await launchBrowser();
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({ baseURL: `http://127.0.0.1:${port}` });
    await context.addCookies([
      {
        name: ADMIN_SESSION_COOKIE,
        value: session.cookieValue,
        url: `http://127.0.0.1:${port}/admin`,
        httpOnly: true,
        sameSite: "Lax",
        expires: Math.floor(session.expiresAt.getTime() / 1000)
      }
    ]);

    const page = await context.newPage();
    const monitor = monitorBrowser(page);
    const steps = [];

    steps.push(await gotoAndAssert(page, "/admin", "Dashboard", "Сводка по каталогу"));
    monitor.resetDocumentNavigations();

    steps.push(
      await clickAndAssert(
        page,
        "Проверка товаров",
        /\/admin\/review(?:\?.*)?$/,
        "review",
        "Рабочая сессия проверки"
      )
    );
    steps.push(
      await clickAndAssert(
        page,
        "Импорт Excel",
        /\/admin\/import(?:\?.*)?$/,
        "import",
        "Загрузка каталога"
      )
    );
    steps.push(
      await clickAndAssert(page, "Dashboard", /\/admin(?:\?.*)?$/, "dashboard", "Сводка по каталогу")
    );

    if (monitor.consoleErrors.length > 0) {
      throw new Error(`Browser console errors: ${monitor.consoleErrors.join(" | ")}`);
    }
    if (monitor.failedRequests.length > 0) {
      throw new Error(`Browser failed requests: ${monitor.failedRequests.join(" | ")}`);
    }
    if (monitor.documentNavigations.length > 0) {
      throw new Error(
        `Expected hydrated client navigation, got document requests: ${monitor.documentNavigations.join(" | ")}`
      );
    }

    return {
      steps,
      consoleErrors: monitor.consoleErrors,
      failedRequests: monitor.failedRequests,
      documentNavigations: monitor.documentNavigations
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = await findChromiumExecutable();

  return chromium.launch({
    executablePath,
    headless: true
  });
}

async function findChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const fileStat = await stat(candidate).catch(() => null);
    if (fileStat?.isFile()) {
      return candidate;
    }
  }

  throw new Error(
    "No Chromium executable found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to run browser smoke."
  );
}

function monitorBrowser(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  let documentNavigations: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("request", (request) => {
    if (request.resourceType() === "document") {
      documentNavigations.push(request.url());
    }
  });
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "document" || request.url().includes("/_next/static/")) {
      failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    if (
      response.status() >= 400 &&
      (request.resourceType() === "document" || response.url().includes("/_next/static/"))
    ) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  return {
    consoleErrors,
    failedRequests,
    get documentNavigations() {
      return documentNavigations;
    },
    resetDocumentNavigations() {
      documentNavigations = [];
    }
  };
}

async function gotoAndAssert(page: Page, route: string, name: string, heading: string) {
  const startedAt = performance.now();
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  if (!response || response.status() >= 500) {
    throw new Error(`${route} document returned ${response?.status() ?? "no response"}.`);
  }
  await page.getByRole("heading", { name: heading }).waitFor({ timeout: REQUEST_TIMEOUT_MS });

  return {
    name,
    url: page.url(),
    ms: Math.round(performance.now() - startedAt)
  };
}

async function clickAndAssert(
  page: Page,
  linkName: string,
  urlPattern: RegExp,
  stepName: string,
  heading: string
) {
  const startedAt = performance.now();
  await page.getByRole("link", { name: linkName }).click();
  await page.waitForURL(urlPattern, { timeout: REQUEST_TIMEOUT_MS });
  await page.getByRole("heading", { name: heading }).waitFor({ timeout: REQUEST_TIMEOUT_MS });

  return {
    name: stepName,
    url: page.url(),
    ms: Math.round(performance.now() - startedAt)
  };
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
