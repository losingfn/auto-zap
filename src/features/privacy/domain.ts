export const PRIVACY_STORAGE_KEY = "autozap.privacy-choice.v1";
export const PRIVACY_COOKIE = "autozap_privacy_receipt";
export const PRIVACY_API_PATH = "/api/privacy-consent";
export const PRIVACY_PROOF_PREFIX = "autozap_privacy_proof_";
export const MAX_PRIVACY_PROOFS = 8;

export type ConsentEventKind = "grant" | "decline" | "revoke";
export type PrivacyChoice = {
  version: 1;
  decision: "granted" | "declined";
  expiresAt: number;
  receiptId: string | null;
  documentVersion: string | null;
  pending?: "decline" | "revoke";
  operationId?: string;
  intentId?: string;
};

export type RegisteredConsent = {
  state: "unknown" | "granted" | "declined" | "revoked" | "expired";
  receiptId: string | null;
  documentVersion: string | null;
  expiresAt: number | null;
};

export type ConsentAcknowledgement = RegisteredConsent & {
  operationId: string;
  eventKind: ConsentEventKind;
};

export type ConsentStatus = RegisteredConsent & { receipts?: RegisteredConsent[] };

export class PrivacyOperationConflict extends Error {
  constructor() { super("Conflicting privacy operation"); this.name = "PrivacyOperationConflict"; }
}

export const unknownConsent: RegisteredConsent = {
  state: "unknown", receiptId: null, documentVersion: null, expiresAt: null
};

/** Twelve calendar months in UTC, clamping February 29 to February 28. */
export function twelveMonthsAfter(value: number): number {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

export function parsePrivacyChoice(raw: string | null, now = Date.now()): PrivacyChoice | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<PrivacyChoice>;
    if (record.version !== 1 || !["granted", "declined"].includes(record.decision ?? "") ||
      typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt) || record.expiresAt <= now ||
      !(typeof record.receiptId === "string" && /^[a-f0-9]{64}$/.test(record.receiptId) ||
        record.decision === "declined" && record.receiptId === null) ||
      !(record.documentVersion === null || typeof record.documentVersion === "string") ||
      (record.pending !== undefined && !["decline", "revoke"].includes(record.pending)) ||
      (record.pending !== undefined && (record.decision !== "declined" ||
        typeof record.operationId !== "string" || !/^[a-f0-9-]{36}$/i.test(record.operationId)))) return null;
    return record as PrivacyChoice;
  } catch { return null; }
}

export function hasRegisteredGrant(
  local: PrivacyChoice | null, server: RegisteredConsent, documentVersion: string | null, now = Date.now()
) {
  return Boolean(documentVersion && local?.decision === "granted" && !local.pending &&
    local.expiresAt > now && server.state === "granted" && server.expiresAt !== null &&
    server.expiresAt > now && local.receiptId === server.receiptId &&
    local.documentVersion === documentVersion && server.documentVersion === documentVersion);
}

const HOME_SECTION_HASHES = new Set(["", "#catalog", "#about", "#reviews", "#vacancies", "#contacts", "#footer"]);
/** Only actual public surfaces, no query/user fragment; retain the approved home's fixed anchor navigation. */
export function isAnalyticsLocationAllowed(url: URL): boolean {
  return !url.search && (url.pathname === "/" ? HOME_SECTION_HASHES.has(url.hash) :
    !url.hash && /^\/catalog(?:\/[^/]+){0,2}\/?$/.test(url.pathname));
}

export function isSafeAnalyticsReferrer(raw: string, origin: string): boolean {
  if (!raw) return true;
  try {
    const url = new URL(raw);
    return !url.search && (url.origin === origin ? isAnalyticsLocationAllowed(url) : !url.hash);
  } catch { return false; }
}
