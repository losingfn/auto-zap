import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { privacyConsentEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { archivedConsent } from "./consent-archive";
import { PrivacyOperationConflict, unknownConsent, type ConsentAcknowledgement, type ConsentEventKind, type RegisteredConsent } from "./domain";

// Separate, bounded pool: analytics registration cannot occupy the catalog's ten connections.
const connection = postgres(env.DATABASE_URL, {
  max: 2, connect_timeout: 2, idle_timeout: 20,
  connection: { statement_timeout: 2000, lock_timeout: 500 }
});
const consentDb = drizzle(connection);
let inFlight = 0;
async function bounded<T>(work: () => Promise<T>): Promise<T> {
  if (inFlight >= 2) throw new Error("Privacy registration is busy");
  inFlight++;
  // A reconnect/transaction reservation can wait outside PostgreSQL's statement_timeout.
  // Keep its slot occupied until it really settles, even if the HTTP caller has timed out.
  const pending = Promise.resolve().then(work).finally(() => { inFlight--; });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Privacy registration timed out")), 3000);
    })]);
  } finally { clearTimeout(timeout); }
}

type Event = typeof privacyConsentEvents.$inferSelect;
export function stateFromConsentEvents(events: Event[], receiptId: string, now = Date.now()): RegisteredConsent {
  const revoked = events.find((event) => event.kind === "revoke");
  const declined = events.find((event) => event.kind === "decline");
  const grant = events.find((event) => event.kind === "grant");
  if (revoked || declined) return {
    state: revoked ? "revoked" : "declined", receiptId,
    documentVersion: grant?.documentVersion ?? null, expiresAt: (revoked ?? declined)?.expiresAt?.getTime() ?? null
  };
  if (!grant) return { ...unknownConsent, receiptId };
  return {
    state: grant.expiresAt && grant.expiresAt.getTime() > now ? "granted" : "expired",
    receiptId, documentVersion: grant.documentVersion, expiresAt: grant.expiresAt?.getTime() ?? null
  };
}
export function getRegisteredConsent(receiptId: string) {
  return bounded(async () => stateFromConsentEvents(
    await consentDb.select().from(privacyConsentEvents).where(eq(privacyConsentEvents.receiptHash, receiptId)), receiptId
  ));
}

export function registerConsentEvent(input: {
  receiptId: string; operationId: string; kind: ConsentEventKind; documentVersion: string | null; receiptExpiresAt: number;
}): Promise<ConsentAcknowledgement> {
  if (input.kind === "grant") archivedConsent(input.documentVersion ?? "");
  return bounded(() => consentDb.transaction(async (tx) => {
    // Locks even the first event. A withdrawal can tombstone an in-flight grant before it is inserted.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.receiptId}, 0))`);
    // Recheck after obtaining the lock: cleanup may have removed an expired receipt
    // while an already authenticated HTTP request was waiting for this transaction.
    if (input.receiptExpiresAt <= Date.now()) throw new PrivacyOperationConflict();
    const events = await tx.select().from(privacyConsentEvents)
      .where(eq(privacyConsentEvents.receiptHash, input.receiptId));
    const kind = input.kind === "decline" && events.some((event) => event.kind === "grant") ? "revoke" : input.kind;
    const previous = events.find((event) => event.operationId === input.operationId);
    if (previous && previous.kind !== kind) throw new PrivacyOperationConflict();
    const sameKind = events.find((event) => event.kind === kind);
    if (sameKind && sameKind.operationId !== input.operationId) throw new PrivacyOperationConflict();
    if (!previous && !sameKind) {
      if (input.kind === "grant" && events.some((event) => event.kind !== "grant")) {
        throw new PrivacyOperationConflict();
      }
      const [event] = await tx.insert(privacyConsentEvents).values({
        receiptHash: input.receiptId, operationId: input.operationId, kind,
        documentVersion: input.kind === "grant" ? input.documentVersion : null,
        expiresAt: sql`LEAST(CURRENT_TIMESTAMP + INTERVAL '12 months', ${new Date(input.receiptExpiresAt).toISOString()}::timestamptz)`
      }).returning();
      events.push(event);
    }
    return { ...stateFromConsentEvents(events, input.receiptId), operationId: input.operationId, eventKind: kind };
  })).catch((error: unknown) => {
    // Drizzle wraps PostgreSQL failures in an Error with the driver error as its cause.
    let cause = error;
    while (cause instanceof Error) {
      if ("code" in cause && cause.code === "23505") throw new PrivacyOperationConflict();
      cause = cause.cause;
    }
    throw error;
  });
}
