import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { adminSessions, adminUsers, auditLogs } from "@/db/schema";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  buildAdminSessionCookiePayload,
  buildAdminSessionCookieValue,
  getAdminSessionSecret,
  parseAdminSessionCookie
} from "./session-cookie";

const PASSWORD_HASH_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 3,
  parallelism: 1
};

export type AdminSessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: "owner" | "manager";
};

export type CurrentAdminSession = {
  id: string;
  expiresAt: Date;
  user: AdminSessionUser;
};

type LoginAdminInput = {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function hashPassword(password: string) {
  return hash(password, PASSWORD_HASH_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}

export async function loginAdmin(input: LoginAdminInput) {
  const email = input.email.trim().toLowerCase();

  const [user] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      role: adminUsers.role,
      passwordHash: adminUsers.passwordHash,
      isActive: adminUsers.isActive
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  if (!user || !user.isActive) {
    return { ok: false as const };
  }

  const isValidPassword = await verifyPassword(user.passwordHash, input.password);
  if (!isValidPassword) {
    return { ok: false as const };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000);
  const [session] = await db
    .insert(adminSessions)
    .values({
      adminUserId: user.id,
      tokenHash: hashSessionToken(token),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt
    })
    .returning({ id: adminSessions.id, expiresAt: adminSessions.expiresAt });

  await db
    .update(adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsers.id, user.id));

  await db.insert(auditLogs).values({
    adminUserId: user.id,
    action: "admin.login",
    entityType: "admin_session",
    entityId: session.id,
    ipAddress: input.ipAddress ?? null,
    metadata: {
      userAgent: input.userAgent ?? null
    }
  });

  await setAdminSessionCookie(session.id, token, session.expiresAt);

  return {
    ok: true as const,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    }
  };
}

export async function getCurrentAdminSession(): Promise<CurrentAdminSession | null> {
  const cookieStore = await cookies();
  const parsed = parseAdminSessionCookie(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  if (!parsed || parsed.expiresAt <= Date.now()) {
    return null;
  }

  const expectedSignature = signAdminSessionCookiePayload(parsed.payload);
  if (!safeCompare(expectedSignature, parsed.signature)) {
    return null;
  }

  const [session] = await db
    .select({
      id: adminSessions.id,
      expiresAt: adminSessions.expiresAt,
      tokenHash: adminSessions.tokenHash,
      userId: adminUsers.id,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      role: adminUsers.role
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(
      and(
        eq(adminSessions.id, parsed.sessionId),
        eq(adminSessions.tokenHash, hashSessionToken(parsed.token)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date()),
        eq(adminUsers.isActive, true)
      )
    )
    .limit(1);

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    expiresAt: session.expiresAt,
    user: {
      id: session.userId,
      email: session.email,
      fullName: session.fullName,
      role: session.role
    }
  };
}

export async function requireAdminSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}

export async function logoutAdminSession() {
  const cookieStore = await cookies();
  const parsed = parseAdminSessionCookie(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  const session = await getCurrentAdminSession();

  if (parsed && session) {
    await db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.id, parsed.sessionId));

    await db.insert(auditLogs).values({
      adminUserId: session.user.id,
      action: "admin.logout",
      entityType: "admin_session",
      entityId: parsed.sessionId
    });
  }

  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function changeAdminPassword({
  adminUserId,
  currentSessionId,
  currentPassword,
  newPassword
}: {
  adminUserId: string;
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
}) {
  if (newPassword.length < 10) {
    throw new Error("Новый пароль должен быть не короче 10 символов.");
  }

  const [user] = await db
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminUserId))
    .limit(1);

  if (!user) {
    throw new Error("Администратор не найден.");
  }

  const isValidPassword = await verifyPassword(user.passwordHash, currentPassword);
  if (!isValidPassword) {
    throw new Error("Текущий пароль указан неверно.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(adminUsers)
      .set({
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(adminUsers.id, adminUserId));

    await tx
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(adminSessions.adminUserId, adminUserId), isNull(adminSessions.revokedAt)));

    await tx
      .update(adminSessions)
      .set({ revokedAt: null })
      .where(eq(adminSessions.id, currentSessionId));

    await tx.insert(auditLogs).values({
      adminUserId,
      action: "admin.password.change",
      entityType: "admin_user",
      entityId: adminUserId
    });
  });
}

async function setAdminSessionCookie(sessionId: string, token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  const expiresAtMs = expiresAt.getTime();
  const payload = buildAdminSessionCookiePayload(sessionId, token, expiresAtMs);
  const signature = signAdminSessionCookiePayload(payload);

  cookieStore.set(ADMIN_SESSION_COOKIE, buildAdminSessionCookieValue(payload, signature), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

function signAdminSessionCookiePayload(payload: string) {
  return createHmac("sha256", getAdminSessionSecret()).update(payload).digest("base64url");
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
