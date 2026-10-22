import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PRIVACY_COOKIE, PRIVACY_PROOF_PREFIX, twelveMonthsAfter } from "./domain";

let developmentSecret: string | undefined;
function secret(): string {
  const configured = process.env.PRIVACY_CONSENT_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("Privacy receipt secret is not configured");
  // Process-local development secret; never a production fallback or an admin-session secret.
  return developmentSecret ??= randomBytes(32).toString("hex");
}
function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}
export function createPrivacyReceipt(now = Date.now()) {
  const expiresAt = twelveMonthsAfter(now);
  const payload = `v1.${randomBytes(32).toString("base64url")}.${expiresAt}`;
  const value = `${payload}.${signature(payload)}`;
  return { value, expiresAt, receiptId: hashReceipt(value) };
}
function hashReceipt(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function readPrivacyReceipt(value: string | undefined, now = Date.now(), allowExpired = false) {
  if (!value || value.length > 256) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^[\w-]{43}$/.test(parts[1])) return null;
  const expiresAt = Number(parts[2]);
  if (!Number.isSafeInteger(expiresAt) || (!allowExpired && expiresAt <= now) || expiresAt > twelveMonthsAfter(now)) return null;
  const expected = Buffer.from(signature(parts.slice(0, 3).join(".")));
  const supplied = Buffer.from(parts[3]);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return { receiptId: hashReceipt(value), expiresAt };
}

type Cookies = { get: (name: string) => { value: string } | undefined; getAll: () => { name: string; value: string }[] };
export const proofCookieName = (receiptId: string) => `${PRIVACY_PROOF_PREFIX}${receiptId}`;

/** A hash supplied by the client is only a selector, never a credential. */
export function findPrivacyReceipt(cookies: Cookies, receiptId: string) {
  for (const value of [cookies.get(proofCookieName(receiptId))?.value, cookies.get(PRIVACY_COOKIE)?.value]) {
    const receipt = readPrivacyReceipt(value);
    if (receipt?.receiptId === receiptId) return { ...receipt, value: value! };
  }
  return null;
}

export function privacyReceiptFailure(cookies: Cookies, receiptId: string) {
  const values = [cookies.get(proofCookieName(receiptId))?.value, cookies.get(PRIVACY_COOKIE)?.value].filter(Boolean);
  if (!values.length) return "receipt_missing";
  for (const value of values) {
    const receipt = readPrivacyReceipt(value, Date.now(), true);
    if (receipt?.receiptId === receiptId && receipt.expiresAt <= Date.now()) return "receipt_expired";
  }
  return values.some((value) => readPrivacyReceipt(value)) ? "receipt_mismatch" : "receipt_invalid";
}

export function privacyReceipts(cookies: Cookies) {
  const result = new Map<string, NonNullable<ReturnType<typeof findPrivacyReceipt>>>();
  for (const cookie of cookies.getAll()) {
    if (cookie.name !== PRIVACY_COOKIE && !cookie.name.startsWith(PRIVACY_PROOF_PREFIX)) continue;
    const receipt = readPrivacyReceipt(cookie.value);
    if (receipt && (cookie.name === PRIVACY_COOKIE || cookie.name === proofCookieName(receipt.receiptId))) {
      result.set(receipt.receiptId, { ...receipt, value: cookie.value });
    }
  }
  return [...result.values()];
}
