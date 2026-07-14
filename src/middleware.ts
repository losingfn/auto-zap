import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionSecret,
  parseAdminSessionCookie
} from "@/features/admin/session-cookie";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdminApi = pathname.startsWith("/api/admin");
  const isLoginPage = pathname === "/admin/login";
  const hasValidCookie = await hasValidAdminCookie(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  );

  if (isAdminApi && !hasValidCookie) {
    return withNoIndex(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  if (isLoginPage && hasValidCookie) {
    return withNoIndex(NextResponse.redirect(createAdminRedirectUrl(request, "/admin")));
  }

  if (pathname.startsWith("/admin") && !isLoginPage && !hasValidCookie) {
    const loginUrl = createAdminRedirectUrl(request, "/admin/login");
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return withNoIndex(NextResponse.redirect(loginUrl));
  }

  return withNoIndex(NextResponse.next());
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"]
};

export function createAdminRedirectUrl(request: NextRequest, pathname: string) {
  return createAdminRedirectUrlFromParts({
    pathname,
    requestUrl: request.url,
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto")
  });
}

export function createAdminRedirectUrlFromParts({
  forwardedHost,
  forwardedProto,
  pathname,
  requestUrl
}: {
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  pathname: string;
  requestUrl: string;
}) {
  const url = new URL(pathname, requestUrl);
  const host = firstForwardedValue(forwardedHost);

  if (host && isLocalhostHost(url.host)) {
    if (!applyForwardedHost(url, host)) {
      return url;
    }
    url.protocol = `${normalizeForwardedProto(forwardedProto) ?? "https"}:`;
  }

  return url;
}

async function hasValidAdminCookie(value?: string | null) {
  const parsed = parseAdminSessionCookie(value);

  if (!parsed || parsed.expiresAt <= Date.now()) {
    return false;
  }

  let expectedSignature: string;
  try {
    expectedSignature = await signPayload(parsed.payload);
  } catch {
    return false;
  }

  return constantTimeEqual(expectedSignature, parsed.signature);
}

async function signPayload(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAdminSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));

  return toBase64Url(new Uint8Array(signature));
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function constantTimeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function firstForwardedValue(value?: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeForwardedProto(value?: string | null) {
  const proto = firstForwardedValue(value)?.replace(/:$/, "").toLowerCase();
  return proto === "http" || proto === "https" ? proto : null;
}

function applyForwardedHost(url: URL, host: string) {
  try {
    const forwardedUrl = new URL(`http://${host}`);
    url.hostname = forwardedUrl.hostname;
    url.port = forwardedUrl.port;
    return true;
  } catch {
    return false;
  }
}

function isLocalhostHost(host: string) {
  const normalizedHost = host.toLowerCase();
  return (
    normalizedHost === "localhost" ||
    normalizedHost.startsWith("localhost:") ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost.startsWith("127.0.0.1:") ||
    normalizedHost === "[::1]" ||
    normalizedHost.startsWith("[::1]:")
  );
}

function withNoIndex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
