import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reviewSource = readFileSync("src/features/admin/review.ts", "utf8");
const actionsSource = readFileSync("src/app/admin/(panel)/review/actions.ts", "utf8");
const controlsSource = readFileSync("src/app/admin/(panel)/review/review-client-controls.tsx", "utf8");
const groupPerfSource = readFileSync("src/lib/server/group-apply-perf.ts", "utf8");
const workspaceMigrationSource = readFileSync("db/migrations/0005_review_workspaces.sql", "utf8");

run("group apply stays in one database transaction and does not publish or index", () => {
  const body = between(reviewSource, "async function applyReviewRuleToWorkspace", "async function getReviewVersionContext");
  assert.match(body, /db\.transaction/);
  assert.match(body, /\.insert\(reviewWorkspaceActions\)/);
  assert.match(body, /\.insert\(reviewWorkspaceItems\)/);
  assert.match(body, /\.insert\(auditLogs\)/);
  assert.doesNotMatch(body, /activatePreparedCatalogSearchIndex|prepareSearchIndexForCatalogVersion/);
  assert.doesNotMatch(body, /\.update\(products\)/);
  assert.doesNotMatch(body, /\.update\(reviewQueue\)/);
});

run("server-side duplicate submissions use signed preview token plus a unique constraint", () => {
  assert.match(reviewSource, /getWorkspaceActionByPreviewToken/);
  assert.match(reviewSource, /\.onConflictDoNothing\(\)/);
  assert.match(workspaceMigrationSource, /review_workspace_actions_preview_token_idx/);
  assert.match(workspaceMigrationSource, /WHERE preview_token IS NOT NULL/);
});

run("group apply emits stage and completed/failed diagnostics", () => {
  assert.match(actionsSource, /createGroupApplyPerfLogger/);
  assert.match(actionsSource, /groupApplyPerf: perf/);
  assert.match(groupPerfSource, /group_apply_stage/);
  assert.match(groupPerfSource, /group_apply_completed/);
  assert.match(groupPerfSource, /group_apply_failed/);
  assert.match(groupPerfSource, /sqlOperations/);
  assert.match(reviewSource, /classify_and_filter_group_items/);
});

run("pending UI blocks a double submit and restores scroll after server navigation", () => {
  assert.match(controlsSource, /submittingRef\.current/);
  assert.match(controlsSource, /setIsSubmitting\(true\)/);
  assert.match(controlsSource, /Применяется…/);
  assert.match(controlsSource, /aria-busy=\{isSubmitting\}/);
  assert.match(controlsSource, /GROUP_APPLY_NAVIGATION_KEY/);
  assert.match(controlsSource, /window\.scrollTo/);
  assert.match(controlsSource, /group_apply_client_refresh/);
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
