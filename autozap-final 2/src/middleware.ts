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
    return withNoIndex(NextResponse.redirect(new URL("/admin", request.url)));
  }

  if (pathname.startsWith("/admin") && !isLoginPage && !hasValidCookie) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return withNoIndex(NextResponse.redirect(loginUrl));
  }

  return withNoIndex(NextResponse.next());
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"]
};

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

function withNoIndex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
