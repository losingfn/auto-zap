export const ADMIN_SESSION_COOKIE = "autozap_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const LOCAL_SESSION_SECRET = "local-autozap-admin-session-secret-for-development";
const COOKIE_VERSION = "v1";

export type ParsedAdminSessionCookie = {
  version: typeof COOKIE_VERSION;
  sessionId: string;
  expiresAt: number;
  token: string;
  signature: string;
  payload: string;
};

export function getAdminSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
  }

  return LOCAL_SESSION_SECRET;
}

export function buildAdminSessionCookiePayload(
  sessionId: string,
  token: string,
  expiresAt: number
) {
  return `${COOKIE_VERSION}.${sessionId}.${expiresAt}.${token}`;
}

export function buildAdminSessionCookieValue(payload: string, signature: string) {
  return `${payload}.${signature}`;
}

export function parseAdminSessionCookie(value?: string | null): ParsedAdminSessionCookie | null {
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 5) {
    return null;
  }

  const [version, sessionId, rawExpiresAt, token, signature] = parts;
  const expiresAt = Number(rawExpiresAt);

  if (
    version !== COOKIE_VERSION ||
    !sessionId ||
    !token ||
    !signature ||
    !Number.isFinite(expiresAt)
  ) {
    return null;
  }

  return {
    version,
    sessionId,
    expiresAt,
    token,
    signature,
    payload: buildAdminSessionCookiePayload(sessionId, token, expiresAt)
  };
}
