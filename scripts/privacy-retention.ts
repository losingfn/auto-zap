/** Explicit maintenance process; never imported by the web app or existing workers. */
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { z } from "zod";
import { privacyRetentionStatus, RETENTION_INTERVAL_MS, runPrivacyRetention } from "../src/features/privacy/retention";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const watch = args.includes("--watch");
const value = (name: string) => args[args.indexOf(name) + 1];
const ref = z.string().regex(/^[a-zA-Z0-9._/-]{1,120}$/);
const resource = z.enum(["admin_session", "audit_event", "consent_receipt"]);
const selector = { resource, recordKey: z.string().regex(/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/i) };
const decision = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hold"), ...selector, caseRef: ref,
    basis: z.enum(["incident", "legal_duty", "rights_request"]), reviewAt: z.string().datetime() }).strict(),
  z.object({ action: z.literal("release-hold"), ...selector }).strict(),
  z.object({ action: z.literal("complete-receipt"), receiptHash: z.string().regex(/^[a-f0-9]{64}$/), decisionRef: ref,
    priorProcessingEnded: z.literal(true), vendorDutiesCompleted: z.literal(true), proofPurposeEnded: z.literal(true) }).strict()
]);

async function main() {
  if (apply && !args.includes("--policy-approved")) throw new Error("--apply requires --policy-approved");
  if (watch && !apply) throw new Error("--watch requires --apply --policy-approved");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; it is never printed");
  const connection = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3,
    connection: { statement_timeout: 15000, lock_timeout: 2000 }, onnotice: () => {} });
  let stopping = false;
  const controller = new AbortController();
  const stop = () => { stopping = true; controller.abort(); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    if (args.includes("--decision-file")) {
      const input = decision.parse(JSON.parse(await readFile(value("--decision-file"), "utf8")));
      if (input.action !== "complete-receipt" && !(input.resource === "consent_receipt"
        ? /^[a-f0-9]{64}$/.test(input.recordKey) : z.string().uuid().safeParse(input.recordKey).success)) {
        throw new Error("Resource selector does not match its type");
      }
      if (!apply) { console.log(JSON.stringify({ mode: "preview", decision: input.action, applied: false })); return; }
      await connection.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended('privacy-retention',0))`;
        if (input.action === "complete-receipt") {
          await tx`SELECT pg_advisory_xact_lock(hashtextextended(${input.receiptHash},0))`;
          const rows = await tx`SELECT kind,expires_at FROM privacy_consent_events WHERE receipt_hash=${input.receiptHash}`;
          if (!rows.length || rows.some(row => row.kind === "grant" && row.expires_at > new Date()) &&
            !rows.some(row => row.kind !== "grant")) throw new Error("Active or unknown receipt cannot be completed");
          await tx`INSERT INTO privacy_consent_completion(receipt_hash,decision_ref) VALUES(${input.receiptHash},${input.decisionRef})
            ON CONFLICT(receipt_hash) DO NOTHING`;
        } else if (input.action === "hold") {
          const reviewAt = new Date(input.reviewAt);
          if (reviewAt.getTime() <= Date.now() || reviewAt.getTime() > Date.now() + 7 * 86400000) throw new Error("Review must be within seven days");
          await tx`INSERT INTO privacy_retention_holds(resource,record_key,case_ref,basis,review_at)
            VALUES(${input.resource},${input.recordKey},${input.caseRef},${input.basis},${reviewAt})
            ON CONFLICT(resource,record_key) DO UPDATE SET case_ref=EXCLUDED.case_ref,basis=EXCLUDED.basis,review_at=EXCLUDED.review_at`;
        } else await tx`DELETE FROM privacy_retention_holds WHERE resource=${input.resource} AND record_key=${input.recordKey}`;
      });
      console.log(JSON.stringify({ decision: input.action, applied: true })); return;
    }
    if (args.includes("--export-evidence")) {
      // Existing restricted destination directory; do not overwrite or expose identifiers to stdout.
      const rows = await connection`SELECT * FROM privacy_destruction_evidence ORDER BY destroyed_at,id`;
      await writeFile(value("--export-evidence"), JSON.stringify(rows, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      console.log(JSON.stringify({ exported: rows.length, signedActStillRequired: true })); return;
    }
    do {
      const startedAt = Date.now();
      const results = args.includes("--status") ? [] : await runPrivacyRetention(connection, apply);
      const status = await privacyRetentionStatus(connection);
      console.log(JSON.stringify({ mode: apply ? "apply" : "preview", previewBatchLimit: apply ? null : 500, results, ...status }));
      const failed = results.some(result => result.status !== "ok") || args.includes("--status") &&
        (status.health.length !== 5 || status.health.some(row => row.status !== "ok" || row.stale) || status.counts.overdue_holds > 0);
      if (failed) process.exitCode = 1;
      if (!watch || stopping) break;
      await delay(Math.max(1, RETENTION_INTERVAL_MS - (Date.now() - startedAt)), undefined, { signal: controller.signal }).catch(() => {});
    } while (!stopping);
  } finally {
    process.off("SIGTERM", stop); process.off("SIGINT", stop); await connection.end({ timeout: 3 });
  }
}
main().catch(() => {
  // Driver errors may embed credentials, SQL values or identifiers. Keep them out of maintenance logs.
  console.error("Privacy maintenance failed. Check arguments, schema, access and health using the restricted runbook.");
  process.exitCode = 1;
});
