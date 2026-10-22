import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privacyDisposableDb } from "./helpers/privacy-disposable-db";
import { privacyRetentionStatus, runPrivacyRetention } from "../src/features/privacy/retention";
import { analyticsConsentVersion } from "../src/features/privacy/consent-content";
import { archivedConsent } from "../src/features/privacy/consent-archive";
import { PrivacyOperationConflict } from "../src/features/privacy/domain";

async function main() {
  const fixture = await privacyDisposableDb(), db = fixture.connection;
  const results: string[] = [];
  const check = async (name: string, work: () => Promise<void>) => { await work(); results.push(name); console.log(`PASS ${name}`); };
  try {
    const [admin] = await db`INSERT INTO admin_users(email,password_hash,full_name) VALUES('fixture@example.invalid','synthetic-hash','Synthetic admin') RETURNING id`;
    const sessions = new Map<string, string>();
    for (const [name, expiry, revoked] of [
      ["active", "8 hours", null], ["ended", "-25 hours", null], ["revoked", "8 hours", "-25 hours"],
      ["held", "-25 hours", null], ["recent", "-1 hour", null], ["deadline", "-23 hours -50 minutes", null]
    ] as const) {
      const [row] = await db`INSERT INTO admin_sessions(admin_user_id,token_hash,ip_address,user_agent,expires_at,revoked_at)
        VALUES(${admin.id},${randomUUID()},'192.0.2.2','Synthetic-UA',CURRENT_TIMESTAMP+${expiry}::interval,
          ${revoked ? db`CURRENT_TIMESTAMP+${revoked}::interval` : db`NULL`}) RETURNING id`;
      sessions.set(name, row.id);
    }
    await db`INSERT INTO privacy_retention_holds VALUES('admin_session',${sessions.get("held")!},'incident-test','incident',CURRENT_TIMESTAMP-INTERVAL '1 hour')`;
    const businessMetadata = { version: "synthetic-version", recovery: { preserve: true } };
    const [business] = await db`INSERT INTO audit_logs(admin_user_id,action,entity_type,metadata,ip_address,created_at)
      VALUES(${admin.id},'catalog.rollback','catalog_version',${db.json(businessMetadata)},'192.0.2.4',CURRENT_TIMESTAMP-INTERVAL '15 days') RETURNING id`;
    const [security] = await db`INSERT INTO audit_logs(admin_user_id,action,metadata,created_at)
      VALUES(${admin.id},'admin.login','{"userAgent":"Synthetic-UA"}',CURRENT_TIMESTAMP-INTERVAL '15 days') RETURNING id`;
    const [heldAudit] = await db`INSERT INTO audit_logs(admin_user_id,action,created_at)
      VALUES(${admin.id},'admin.logout',CURRENT_TIMESTAMP-INTERVAL '15 days') RETURNING id`;
    await db`INSERT INTO privacy_retention_holds VALUES('audit_event',${heldAudit.id},'incident-test','incident',CURRENT_TIMESTAMP+INTERVAL '1 day')`;
    const receipt = (letter: string) => letter.repeat(64);
    for (const [key, negative, expired, complete, held] of [
      ['a',false,false,true,false], ['b',false,true,false,false], ['c',true,false,true,false],
      ['d',true,true,true,false], ['e',true,true,true,true]
    ] as const) {
      const id = receipt(key);
      const expiry = expired ? "-1 hour" : "1 day";
      await db`INSERT INTO privacy_consent_events(receipt_hash,operation_id,kind,document_version,expires_at)
        VALUES(${id},${randomUUID()},'grant','original-unchanged-version',CURRENT_TIMESTAMP+${expiry}::interval)`;
      if (negative) await db`INSERT INTO privacy_consent_events(receipt_hash,operation_id,kind,expires_at)
        VALUES(${id},${randomUUID()},'revoke',CURRENT_TIMESTAMP+${expiry}::interval)`;
      if (complete) await db`INSERT INTO privacy_consent_completion(receipt_hash,decision_ref) VALUES(${id},'closed-test')`;
      if (held) await db`INSERT INTO privacy_retention_holds VALUES('consent_receipt',${id},'case-test','legal_duty',CURRENT_TIMESTAMP+INTERVAL '1 day')`;
    }
    const snapshot = async () => JSON.stringify(await db`SELECT * FROM (SELECT 'sessions' AS t,to_jsonb(s) AS r FROM admin_sessions s
      UNION ALL SELECT 'audit',to_jsonb(a) FROM audit_logs a UNION ALL SELECT 'consent',to_jsonb(c) FROM privacy_consent_events c) snapshot ORDER BY t,r::text`);
    await check("preview is read-only; actual PostgreSQL selection, no health/evidence side effects", async () => {
      const before = await snapshot(); const preview = await runPrivacyRetention(db);
      assert.ok(preview.every(row => row.status === "ok")); assert.equal(preview.find(row => row.stage === "sessions")!.affected, 3);
      assert.equal(await snapshot(), before);
      assert.equal((await db`SELECT count(*)::int AS n FROM privacy_retention_health`)[0].n, 0);
    });
    await check("24h sessions / 14d security; active, recent and held records survive", async () => {
      const run = await runPrivacyRetention(db, true); assert.ok(run.every(row => row.status === "ok"), JSON.stringify(run));
      const live = new Set((await db`SELECT id FROM admin_sessions`).map(row => row.id));
      assert.deepEqual(live, new Set([sessions.get('active'),sessions.get('held'),sessions.get('recent')]));
      assert.equal((await db`SELECT id FROM audit_logs WHERE id=${security.id}`).length, 0);
      assert.equal((await db`SELECT id FROM audit_logs WHERE id=${heldAudit.id}`).length, 1);
    });
    await check("business action, actor, recovery metadata and identity preserved; only old IP removed", async () => {
      const [row] = await db`SELECT * FROM audit_logs WHERE id=${business.id}`;
      assert.equal(row.action,'catalog.rollback'); assert.equal(row.admin_user_id,admin.id);
      assert.deepEqual(row.metadata,businessMetadata); assert.equal(row.ip_address,null);
    });
    await check("no arbitrary consent age; completion required; no live negative guard or active grant deleted", async () => {
      const count = async (key: string) => (await db`SELECT count(*)::int AS n FROM privacy_consent_events WHERE receipt_hash=${receipt(key)}`)[0].n;
      assert.equal(await count('a'),1); assert.equal(await count('b'),1); assert.equal(await count('c'),1);
      assert.equal((await db`SELECT kind FROM privacy_consent_events WHERE receipt_hash=${receipt('c')}`)[0].kind,'revoke');
      assert.equal(await count('d'),0); assert.equal(await count('e'),2);
      assert.equal((await db`SELECT * FROM privacy_consent_completion WHERE receipt_hash=${receipt('d')}`).length,0);
      await db`UPDATE privacy_consent_events SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE receipt_hash=${receipt('c')}`;
      assert.ok((await runPrivacyRetention(db,true)).every(row=>row.status==='ok'));
      assert.equal(await count('c'),0);
    });
    await check("transactional destruction extract, no raw IP/UA/token; 3-year evidence, bounded health", async () => {
      const rows = await db`SELECT * FROM privacy_destruction_evidence`;
      assert.ok(rows.length>=4); assert.doesNotMatch(JSON.stringify(rows),/192\.0\.2|Synthetic-UA|synthetic-hash/);
      assert.ok(rows.every(row=>row.subjects.length===row.affected_count && row.retain_until>row.destroyed_at));
      const status = await privacyRetentionStatus(db); assert.equal(status.health.length,5); assert.equal(status.counts.overdue_holds,1);
      assert.ok(status.counts.receipts_needing_review>0);
    });
    await check("evidence failure rolls back that stage's deletion; other stages safely complete", async () => {
      const [session] = await db`INSERT INTO admin_sessions(admin_user_id,token_hash,expires_at) VALUES(${admin.id},${randomUUID()},CURRENT_TIMESTAMP-INTERVAL '2 days') RETURNING id`;
      const [event] = await db`INSERT INTO audit_logs(action,created_at) VALUES('admin.login',CURRENT_TIMESTAMP-INTERVAL '15 days') RETURNING id`;
      await db.unsafe(`CREATE FUNCTION fail_test_evidence() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.stage='sessions' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END$$;
        CREATE TRIGGER fail_test_evidence BEFORE INSERT ON privacy_destruction_evidence FOR EACH ROW EXECUTE FUNCTION fail_test_evidence()`);
      const run = await runPrivacyRetention(db,true); assert.equal(run.find(row=>row.stage==='sessions')!.status,'failed');
      assert.equal((await db`SELECT id FROM admin_sessions WHERE id=${session.id}`).length,1);
      assert.equal((await db`SELECT id FROM audit_logs WHERE id=${event.id}`).length,0);
      await db.unsafe('DROP TRIGGER fail_test_evidence ON privacy_destruction_evidence; DROP FUNCTION fail_test_evidence()');
      assert.ok((await runPrivacyRetention(db,true)).every(row=>row.status==='ok'));
    });
    await check("safe repeat and evidence expiry do not produce an endless extract history", async () => {
      const before = (await db`SELECT count(*)::int AS n FROM privacy_destruction_evidence`)[0].n;
      const run = await runPrivacyRetention(db,true); assert.ok(run.every(row=>row.affected===0));
      assert.equal((await db`SELECT count(*)::int AS n FROM privacy_destruction_evidence`)[0].n,before);
      await db`UPDATE privacy_destruction_evidence SET retain_until=CURRENT_TIMESTAMP-INTERVAL '1 second'`;
      assert.ok((await runPrivacyRetention(db,true)).every(row=>row.status==='ok'));
      assert.equal((await db`SELECT count(*)::int AS n FROM privacy_destruction_evidence`)[0].n,0);
    });
    await check("real grant/archive association; cleanup cannot resurrect delayed revoked/expired grants", async () => {
      process.env.DATABASE_URL=fixture.url;
      const { registerConsentEvent } = await import('../src/features/privacy/repository');
      const receiptId='6'.repeat(64), operationId=randomUUID();
      const input={ receiptId,operationId,kind:'grant' as const,documentVersion:analyticsConsentVersion,receiptExpiresAt:Date.now()+3600000 };
      const ack=await registerConsentEvent(input); assert.equal(ack.state,'granted');
      const [grant]=await db`SELECT document_version FROM privacy_consent_events WHERE receipt_hash=${receiptId}`;
      assert.equal(archivedConsent(grant.document_version).version,analyticsConsentVersion);
      await registerConsentEvent({ ...input,kind:'revoke',operationId:randomUUID(),documentVersion:null });
      await db`INSERT INTO privacy_consent_completion(receipt_hash,decision_ref) VALUES(${receiptId},'complete-test')`;
      await runPrivacyRetention(db,true);
      await assert.rejects(registerConsentEvent(input),PrivacyOperationConflict);
      await db`UPDATE privacy_consent_events SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE receipt_hash=${receiptId}`;
      await runPrivacyRetention(db,true);
      await assert.rejects(registerConsentEvent({ ...input,receiptExpiresAt:Date.now()-1 }),PrivacyOperationConflict);
      assert.equal((await db`SELECT * FROM privacy_consent_events WHERE receipt_hash=${receiptId}`).length,0);

      const waitingId='7'.repeat(64); let waiting!: Promise<unknown>;
      await db.begin(async tx=>{
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${waitingId},0))`;
        waiting=registerConsentEvent({ ...input,receiptId:waitingId,operationId:randomUUID(),receiptExpiresAt:Date.now()+100 });
        // The actual PostgreSQL lock delays a once-valid request beyond its signed deadline.
        await new Promise(resolve=>setTimeout(resolve,200));
      });
      await assert.rejects(waiting,PrivacyOperationConflict);
      assert.equal((await db`SELECT * FROM privacy_consent_events WHERE receipt_hash=${waitingId}`).length,0);
    });
    await check("maintenance CLI defaults to preview; explicit completion/apply; safe status and restricted export",async()=>{
      const cli=(...args:string[])=>execFileSync(process.execPath,['--import','tsx','scripts/privacy-retention.ts',...args],
        {env:{...process.env,DATABASE_URL:fixture.url},encoding:'utf8',stdio:['ignore','pipe','pipe']});
      const before=await snapshot();const preview=JSON.parse(cli());assert.equal(preview.mode,'preview');assert.equal(await snapshot(),before);
      assert.doesNotMatch(JSON.stringify(preview),/192\.0\.2|Synthetic-UA|receipt_hash|token_hash/);
      assert.throws(()=>cli('--apply')); // No acknowledgement => no write.
      assert.throws(()=>cli('--status')); // The overdue incident hold is visible, never silently auto-released.
      const temporary=await mkdtemp(join(tmpdir(),'privacy-retention-cli-'));
      try{
        const receiptHash='0'.repeat(64),file=join(temporary,'decision.json');
        await db`INSERT INTO privacy_consent_events(receipt_hash,operation_id,kind,expires_at)
          VALUES(${receiptHash},${randomUUID()},'decline',CURRENT_TIMESTAMP-INTERVAL '1 day')`;
        await writeFile(file,JSON.stringify({action:'complete-receipt',receiptHash,decisionRef:'completed-test',priorProcessingEnded:true,vendorDutiesCompleted:true,proofPurposeEnded:true}));
        cli('--decision-file',file);assert.equal((await db`SELECT * FROM privacy_consent_completion WHERE receipt_hash=${receiptHash}`).length,0);
        cli('--decision-file',file,'--apply','--policy-approved');
        assert.equal((await db`SELECT * FROM privacy_consent_completion WHERE receipt_hash=${receiptHash}`).length,1);
        cli('--apply','--policy-approved');assert.equal((await db`SELECT * FROM privacy_consent_events WHERE receipt_hash=${receiptHash}`).length,0);
        const exported=join(temporary,'extract.json');const summary=JSON.parse(cli('--export-evidence',exported));
        assert.ok(summary.exported>0);assert.equal(summary.signedActStillRequired,true);
        assert.equal((await stat(exported)).mode&0o777,0o600);assert.ok(JSON.parse(await readFile(exported,'utf8')).length>0);
        assert.throws(()=>cli('--export-evidence',exported));
      }finally{await rm(temporary,{recursive:true,force:true});}
    });
  } finally {
    await fixture.cleanup();
    await mkdir('artifacts/privacy-legal-final/implementation/evidence',{recursive:true});
    await writeFile('artifacts/privacy-legal-final/implementation/evidence/retention-postgres.json',JSON.stringify({ isolation:fixture.isolation,results,containerRemoved:true },null,2)+'\n');
  }
}
main().then(()=>process.exit(0)).catch(error=>{
  console.error('Disposable PostgreSQL retention test failed; no production connection was used.');
  console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[connection redacted]').replace(/[a-f0-9]{64}/g,'[identifier redacted]') : 'Unknown test failure');
  process.exitCode=1;
});
