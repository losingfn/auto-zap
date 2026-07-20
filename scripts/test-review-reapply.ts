import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyReviewReapplyDecision,
  isReviewReapplyRunStale
} from "../src/features/admin/review-reapply";

const serviceSource = readFileSync("src/features/admin/review-reapply.ts", "utf8");
const reviewSource = readFileSync("src/features/admin/review.ts", "utf8");
const pageSource = readFileSync("src/app/admin/(panel)/review/page.tsx", "utf8");
const actionsSource = readFileSync("src/app/admin/(panel)/review/actions.ts", "utf8");
const schemaSource = readFileSync("src/db/schema.ts", "utf8");
const workspaceMigrationSource = readFileSync("db/migrations/0005_review_workspaces.sql", "utf8");
const migrationSource = readFileSync("db/migrations/0008_review_reapply_runs.sql", "utf8");

run("AUTO_READY is the only automatic prepared decision", () => {
  assert.equal(
    classifyReviewReapplyDecision({
      decisionStatus: "AUTO_READY",
      categoryId: "cat",
      subcategoryId: "sub"
    }),
    "prepared"
  );
  assert.equal(
    classifyReviewReapplyDecision({
      decisionStatus: "GROUP_REVIEW",
      categoryId: "cat",
      subcategoryId: "sub"
    }),
    "skipped"
  );
  assert.equal(
    classifyReviewReapplyDecision({
      decisionStatus: "MANUAL_REVIEW",
      categoryId: "cat",
      subcategoryId: "sub"
    }),
    "skipped"
  );
  assert.equal(
    classifyReviewReapplyDecision({
      decisionStatus: "BLOCKED_CONFLICT",
      categoryId: "cat",
      subcategoryId: "sub"
    }),
    "skipped"
  );
  assert.equal(
    classifyReviewReapplyDecision({
      decisionStatus: "DO_NOT_PUBLISH",
      categoryId: null,
      subcategoryId: null
    }),
    "skipped"
  );
});

run("existing pending workspace item is reused instead of duplicated", () => {
  assert.equal(
    classifyReviewReapplyDecision({
      decisionStatus: "AUTO_READY",
      categoryId: "cat",
      subcategoryId: "sub",
      workspaceItemStatus: "pending"
    }),
    "already_pending"
  );
});

run("stale heartbeat is detected", () => {
  assert.equal(
    isReviewReapplyRunStale({
      status: "running",
      lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000)
    }),
    true
  );
  assert.equal(
    isReviewReapplyRunStale({
      status: "paused",
      lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000)
    }),
    false
  );
});

run("dry-run batch does not mutate products, review_queue, catalog versions, or workspace items", () => {
  const dryRunBody = between(serviceSource, "async function processDryRunBatch", "async function processApplyBatch");
  assert.doesNotMatch(dryRunBody, /\.insert\(reviewWorkspaceItems\)/);
  assert.doesNotMatch(dryRunBody, /\.update\(products\)/);
  assert.doesNotMatch(dryRunBody, /\.update\(reviewQueue\)/);
  assert.doesNotMatch(dryRunBody, /\.insert\(catalogVersions\)/);
});

run("apply batch does not publish or mutate products, review_queue, or catalog versions", () => {
  const applyBody = between(serviceSource, "async function processApplyBatch", "function evaluateReviewReapplyRow");
  assert.doesNotMatch(applyBody, /\.update\(products\)/);
  assert.doesNotMatch(applyBody, /\.update\(reviewQueue\)/);
  assert.doesNotMatch(applyBody, /\.insert\(catalogVersions\)/);
  assert.doesNotMatch(applyBody, /publishReviewWorkspace\(/);
});

run("apply creates pending workspace items with idempotent conflict handling", () => {
  const applyBody = between(serviceSource, "async function processApplyBatch", "function evaluateReviewReapplyRow");
  assert.match(applyBody, /\.insert\(reviewWorkspaceItems\)/);
  assert.match(applyBody, /\.onConflictDoNothing\(\)/);
  assert.match(workspaceMigrationSource, /review_workspace_items_workspace_product_unique/);
});

run("cursor uses created_at plus review_queue id", () => {
  assert.match(serviceSource, /currentCursorCreatedAt/);
  assert.match(serviceSource, /currentCursorReviewId/);
  assert.match(serviceSource, /gt\(reviewQueue\.createdAt/);
  assert.match(serviceSource, /gt\(reviewQueue\.id/);
  assert.match(serviceSource, /not exists \(\s+select 1\s+from review_reapply_run_items existing/);
});

run("one row error is caught inside dry-run processing", () => {
  const dryRunBody = between(serviceSource, "async function processDryRunBatch", "async function processApplyBatch");
  assert.match(dryRunBody, /for \(const row of rows\)/);
  assert.match(dryRunBody, /catch \(error\)/);
  assert.match(dryRunBody, /row_processing_error/);
});

run("parallel active run is blocked by a workspace-level unique index", () => {
  assert.match(schemaSource, /review_reapply_runs_one_active_workspace_idx/);
  assert.match(migrationSource, /WHERE status IN \('pending', 'running', 'paused'\)/);
});

run("cancel and pause are checked between batches", () => {
  assert.match(serviceSource, /run\.status === "cancelled" \|\| run\.status === "paused"/);
});

run("publish guard blocks unfinished apply runs", () => {
  assert.match(reviewSource, /assertNoUnfinishedReviewReapplyApplyRun/);
  assert.match(reviewSource, /eq\(reviewReapplyRuns\.mode, "apply"\)/);
  assert.match(reviewSource, /inArray\(reviewReapplyRuns\.status, \["pending", "running", "paused"\]\)/);
});

run("rollback only targets workspace artifacts from the selected apply run", () => {
  const rollbackBody = between(serviceSource, "export async function rollbackReviewReapplyApplyRun", "export async function getReviewReapplyRun");
  assert.match(rollbackBody, /reviewReapplyRunId/);
  assert.match(rollbackBody, /\.update\(reviewWorkspaceItems\)/);
  assert.match(rollbackBody, /\.update\(reviewWorkspaceActions\)/);
  assert.doesNotMatch(rollbackBody, /\.update\(products\)/);
  assert.doesNotMatch(rollbackBody, /\.update\(reviewQueue\)/);
  assert.doesNotMatch(rollbackBody, /\.insert\(catalogVersions\)/);
});

run("/admin/review does not run the batch processor during page render or server actions", () => {
  assert.doesNotMatch(pageSource, /processReviewReapplyRun/);
  assert.doesNotMatch(actionsSource, /processReviewReapplyRun/);
});

function run(name: string, fn: () => void) {
  fn();
  console.log(`ok - ${name}`);
}

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}
