import type postgres from "postgres";

export const RETENTION_INTERVAL_MS = 15 * 60_000;
// Two intervals of headroom for the next run and bounded batch processing.
// A stalled/failed worker still needs intervention; it never extends the policy.
const sessionAge = "23 hours 30 minutes";
const logAge = "13 days 23 hours 30 minutes";
const BATCH = 500;
const stages = ["sessions", "security-audit", "business-ip", "consents", "evidence"] as const;
type Stage = typeof stages[number];
type Tx = postgres.TransactionSql;
type Subject = { row: string; subject: string | null };
export type RetentionResult = { stage: Stage; status: "ok" | "failed" | "busy"; affected: number };

async function evidence(tx: Tx, stage: Stage, rows: Subject[], reason: string, categories: string, method = "DELETE working rows") {
  if (!rows.length) return;
  await tx`INSERT INTO privacy_destruction_evidence(stage, reason, categories, method, affected_count, subjects)
    VALUES(${stage},${reason},${categories},${method},${rows.length},${tx.json(rows)})`;
}

async function batch(tx: Tx, stage: Stage, apply: boolean): Promise<number> {
  const mode = apply ? "FOR UPDATE OF s SKIP LOCKED" : "";
  if (stage === "sessions") {
    const rows = await tx<Subject[]>`SELECT s.id::text AS row, s.admin_user_id::text AS subject FROM admin_sessions s
      WHERE LEAST(s.expires_at, COALESCE(s.revoked_at,s.expires_at)) <= CURRENT_TIMESTAMP - ${sessionAge}::interval
        AND NOT EXISTS (SELECT 1 FROM privacy_retention_holds h WHERE h.resource='admin_session' AND h.record_key=s.id::text)
      ORDER BY s.id LIMIT ${BATCH} ${tx.unsafe(mode)}`;
    if (apply && rows.length) {
      await tx`DELETE FROM admin_sessions WHERE id::text IN ${tx(rows.map(row => row.row))}`;
      await evidence(tx, stage, rows, "Ended session retention completed", "Session token hash, IP, User-Agent, session identifiers and timestamps");
    }
    return rows.length;
  }
  if (stage === "security-audit" || stage === "business-ip") {
    // Explicit security allowlist. Business/unknown actions and their metadata stay intact.
    const predicate = stage === "security-audit"
      ? "s.action IN ('admin.login','admin.logout','admin.password.change')"
      : "s.action NOT IN ('admin.login','admin.logout','admin.password.change') AND s.ip_address IS NOT NULL";
    const rows = await tx<Subject[]>`SELECT s.id::text AS row,s.admin_user_id::text AS subject FROM audit_logs s
      WHERE ${tx.unsafe(predicate)} AND s.created_at <= CURRENT_TIMESTAMP - ${logAge}::interval
        AND NOT EXISTS (SELECT 1 FROM privacy_retention_holds h WHERE h.resource='audit_event' AND h.record_key=s.id::text)
      ORDER BY s.id LIMIT ${BATCH} ${tx.unsafe(mode)}`;
    if (apply && rows.length) {
      if (stage === "security-audit") await tx`DELETE FROM audit_logs WHERE id::text IN ${tx(rows.map(row => row.row))}`;
      else await tx`UPDATE audit_logs SET ip_address=NULL WHERE id::text IN ${tx(rows.map(row => row.row))}`;
      await evidence(tx, stage, rows, "Ordinary 14-day retention completed",
        stage === "security-audit" ? "Administrative security events, identifiers, IP and metadata" : "Excess network address in business audit",
        stage === "security-audit" ? "DELETE working rows" : "SET ip_address = NULL; business record preserved");
    }
    return rows.length;
  }
  if (stage === "consents") {
    const groups = await tx<{ receipt_hash: string }[]>`SELECT DISTINCT c.receipt_hash FROM privacy_consent_completion c
      JOIN privacy_consent_events e ON e.receipt_hash=c.receipt_hash
      WHERE c.completed_at <= CURRENT_TIMESTAMP
        AND NOT EXISTS (SELECT 1 FROM privacy_retention_holds h WHERE h.resource='consent_receipt' AND h.record_key=c.receipt_hash)
        AND (NOT EXISTS (SELECT 1 FROM privacy_consent_events g WHERE g.receipt_hash=c.receipt_hash AND g.kind='grant'
                         AND g.expires_at>CURRENT_TIMESTAMP)
             OR EXISTS (SELECT 1 FROM privacy_consent_events n WHERE n.receipt_hash=c.receipt_hash AND n.kind IN ('revoke','decline')))
        AND (e.kind='grant' OR e.expires_at <= CURRENT_TIMESTAMP)
      ORDER BY c.receipt_hash LIMIT ${BATCH}`;
    let count = 0;
    for (const group of groups) {
      if (apply) await tx`SELECT pg_advisory_xact_lock(hashtextextended(${group.receipt_hash},0))`;
      // SAME group lock as grant/revoke registration; never remove a live negative guard.
      const rows = await tx<Subject[]>`SELECT e.id::text AS row,e.receipt_hash AS subject FROM privacy_consent_events e
        WHERE e.receipt_hash=${group.receipt_hash} AND (e.kind='grant' OR e.expires_at <= CURRENT_TIMESTAMP)
          AND (NOT EXISTS (SELECT 1 FROM privacy_consent_events g WHERE g.receipt_hash=e.receipt_hash AND g.kind='grant' AND g.expires_at>CURRENT_TIMESTAMP)
               OR EXISTS (SELECT 1 FROM privacy_consent_events n WHERE n.receipt_hash=e.receipt_hash AND n.kind IN ('revoke','decline')))`;
      count += rows.length;
      if (!apply || !rows.length) continue;
      await tx`DELETE FROM privacy_consent_events WHERE id::text IN ${tx(rows.map(row => row.row))}`;
      await evidence(tx, stage, rows, "Operator-confirmed completion of consent proof and prior-data duties",
        "Consent event identifiers, document version and timestamps; live negative guards excluded");
      await tx`DELETE FROM privacy_consent_completion c WHERE c.receipt_hash=${group.receipt_hash}
        AND NOT EXISTS (SELECT 1 FROM privacy_consent_events e WHERE e.receipt_hash=c.receipt_hash)`;
    }
    return count;
  }
  const rows = await tx<{ id: string }[]>`SELECT id FROM privacy_destruction_evidence
    WHERE retain_until <= CURRENT_TIMESTAMP ORDER BY id LIMIT ${BATCH} ${apply ? tx`FOR UPDATE SKIP LOCKED` : tx``}`;
  if (apply && rows.length) await tx`DELETE FROM privacy_destruction_evidence WHERE id IN ${tx(rows.map(row => row.id))}`;
  // Do not create another 3-year personal extract of an extract's expiry.
  return rows.length;
}

/** Default read-only. Each destructive batch and its evidence commit or roll back together. */
export async function runPrivacyRetention(connection: postgres.Sql, apply = false): Promise<RetentionResult[]> {
  const results: RetentionResult[] = [];
  for (const stage of stages) {
    let affected = 0;
    let status: RetentionResult["status"] = "ok";
    try {
      // Bounded run, bounded transactions. A backlog is visible in health/preview and must be resolved before release.
      for (let i = 0; i < (apply ? 20 : 1); i++) {
        const count = await connection.begin(async tx => {
          if (apply) {
            await tx`SET LOCAL statement_timeout='15s'`;
            await tx`SET LOCAL lock_timeout='2s'`;
            const [lock] = await tx`SELECT pg_try_advisory_xact_lock(hashtextextended('privacy-retention',0)) AS acquired`;
            if (!lock.acquired) return -1;
          }
          return batch(tx, stage, apply);
        });
        if (count === -1) { status = "busy"; break; }
        affected += Number(count);
        if (Number(count) < BATCH) break;
        if (apply && i === 19) status = "failed"; // Backlog limit reached; never report a complete sweep.
      }
    } catch { status = "failed"; }
    if (apply) {
      try {
        await connection`INSERT INTO privacy_retention_health(stage,attempted_at,succeeded_at,status,affected_count)
          VALUES(${stage},CURRENT_TIMESTAMP,${status === "ok" ? new Date() : null},${status},${affected})
          ON CONFLICT(stage) DO UPDATE SET attempted_at=EXCLUDED.attempted_at,status=EXCLUDED.status,
            affected_count=EXCLUDED.affected_count,
            succeeded_at=COALESCE(EXCLUDED.succeeded_at,privacy_retention_health.succeeded_at)`;
      } catch { status = "failed"; }
    }
    results.push({ stage, status, affected });
  }
  return results;
}

export async function privacyRetentionStatus(connection: postgres.Sql) {
  const [counts] = await connection`SELECT
    (SELECT count(*)::int FROM privacy_retention_holds WHERE review_at<=CURRENT_TIMESTAMP) AS overdue_holds,
    (SELECT count(DISTINCT e.receipt_hash)::int FROM privacy_consent_events e
       WHERE (e.kind<>'grant' OR e.expires_at<=CURRENT_TIMESTAMP)
         AND NOT EXISTS (SELECT 1 FROM privacy_consent_completion c WHERE c.receipt_hash=e.receipt_hash)) AS receipts_needing_review`;
  const health = await connection`SELECT stage,attempted_at,succeeded_at,status,affected_count,
    succeeded_at IS NULL OR succeeded_at<CURRENT_TIMESTAMP-INTERVAL '30 minutes' AS stale
    FROM privacy_retention_health ORDER BY stage`;
  return { counts, health };
}
