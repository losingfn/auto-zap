import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBackgroundJobPayload } from "../src/features/background-jobs/handlers";
import {
  isBackgroundJobsInfrastructureEnabled,
  isImportWorkerModeAvailable
} from "../src/lib/feature-flags";
import { getPublishReconciliationAction } from "../src/features/import/worker-service";

const importsSource = readFileSync("src/features/admin/imports.ts", "utf8");
const actionsSource = readFileSync("src/app/admin/(panel)/import/actions.ts", "utf8");
const workerSource = readFileSync("src/features/import/worker-service.ts", "utf8");
const publishSource = readFileSync("src/features/import/publish-service.ts", "utf8");
const statusSource = readFileSync("src/app/api/admin/imports/[batchId]/status/route.ts", "utf8");
const pageSource = readFileSync("src/app/admin/(panel)/import/page.tsx", "utf8");
const uploadSource = readFileSync("src/app/admin/(panel)/import/import-upload-form.tsx", "utf8");
const navSource = readFileSync("src/app/admin/(panel)/admin-nav.tsx", "utf8");
const migrationSource = readFileSync("db/migrations/0011_import_worker.sql", "utf8");
const nextConfigSource = readFileSync("next.config.mjs", "utf8");

function main() {
  run("only durable batch identifiers are accepted in import job payloads", () => {
    validateBackgroundJobPayload("analyze_import", { batchId: "123e4567-e89b-42d3-a456-426614174000" });
    validateBackgroundJobPayload("publish_import", { batchId: "123e4567-e89b-42d3-a456-426614174000" });
    assert.throws(() => validateBackgroundJobPayload("analyze_import", { batchId: "not-a-uuid" }));
    assert.throws(() => validateBackgroundJobPayload("publish_import", { batchId: "123e4567-e89b-42d3-a456-426614174000", fileBuffer: "forbidden" }));
  });

  run("worker migration creates additive durable linkage and checkpoints", () => {
    for (const field of ["analyze_job_id", "publish_job_id", "publish_checkpoint", "last_error_code", "processing_updated_at"]) {
      assert.match(migrationSource, new RegExp(field));
    }
    assert.match(migrationSource, /import_batches_one_active_worker_analyze/);
  });

  run("HTTP acceptance reserves batch and analyze job atomically without analysis", () => {
    const start = importsSource.indexOf("export async function enqueueAdminImportFromUpload");
    const end = importsSource.indexOf("export async function enqueueAdminImportPublish");
    const source = importsSource.slice(start, end);
    assert.match(source, /db\.transaction/);
    assert.match(source, /type: "analyze_import"/);
    assert.match(source, /analyzeJobId/);
    assert.match(source, /removeRejectedUploadFileSafely/);
    assert.match(source, /assertWorkerImportAvailable/);
    assert.doesNotMatch(source, /createDraftImport/);
  });

  run("worker flag keeps the legacy sync path available and removes automatic publish", () => {
    assert.match(actionsSource, /getFeatureFlags\(\)\.importViaWorker/);
    const upload = actionsSource.slice(actionsSource.indexOf("export async function uploadImportAction"), actionsSource.indexOf("export async function publishImportAction"));
    assert.match(upload, /enqueueAdminImportFromUpload/);
    assert.doesNotMatch(upload, /publishAdminImportBatch/);
  });

  run("analyze and publish workers are idempotent and emit progress checkpoints", () => {
    assert.match(workerSource, /\["analyzed", "published", "cancelled"\]/);
    assert.match(workerSource, /importBatchId: batch\.id/);
    assert.match(workerSource, /onProgress/);
    assert.match(workerSource, /reconcilePublishState/);
    assert.match(workerSource, /sync_search_to_database/);
    assert.match(workerSource, /publish_retrying/);
    assert.match(workerSource, /exists\(/);
    assert.match(workerSource, /PUBLISH_BLOCKED/);
    assert.match(workerSource, /SEARCH_TEMPORARY_ERROR/);
  });

  run("publish records crash-recoverable Meilisearch and catalog checkpoints", () => {
    assert.match(publishSource, /search_swap_started/);
    assert.match(publishSource, /search_swapped/);
    assert.match(publishSource, /activateCatalogVersionInDatabase/);
    assert.match(workerSource, /getLiveSearchCatalogVersionId/);
    assert.match(publishSource, /PostgreSQL is now the source of truth/);
    assert.match(publishSource, /CatalogActivationGuardError/);
  });

  run("publish reconciliation always converges search to the active database catalog", () => {
    assert.equal(
      getPublishReconciliationAction({
        activeCatalogVersionId: "new",
        liveCatalogVersionId: "new",
        targetCatalogVersionId: "new",
        batchStatus: "published"
      }),
      "already_converged"
    );
    assert.equal(
      getPublishReconciliationAction({
        activeCatalogVersionId: "new",
        liveCatalogVersionId: "old",
        targetCatalogVersionId: "new",
        batchStatus: "published"
      }),
      "sync_search_to_database"
    );
    assert.equal(
      getPublishReconciliationAction({
        activeCatalogVersionId: "old",
        liveCatalogVersionId: "new",
        targetCatalogVersionId: "new",
        batchStatus: "analyzed"
      }),
      "activate_database"
    );
    assert.equal(
      getPublishReconciliationAction({
        activeCatalogVersionId: "old",
        liveCatalogVersionId: "old",
        targetCatalogVersionId: "new",
        batchStatus: "analyzed"
      }),
      "continue_publish"
    );
  });

  run("status API is authenticated and returns only user-safe status fields", () => {
    assert.match(statusSource, /getCurrentAdminSession/);
    assert.match(statusSource, /canPublish/);
    assert.doesNotMatch(statusSource, /stack/);
    assert.doesNotMatch(statusSource, /DATABASE_URL/);
  });

  run("accountant UI polls server state and omits technical blocks and fake stages", () => {
    assert.match(pageSource, /Актуальный прайс/);
    assert.match(pageSource, /Проверка перед публикацией/);
    assert.match(pageSource, /Импорт проанализирован/);
    assert.doesNotMatch(pageSource, /Автоматическая категоризация/);
    assert.doesNotMatch(pageSource, /Показать технические/);
    assert.doesNotMatch(uploadSource, /setInterval/);
    assert.match(readFileSync("src/app/admin/(panel)/import/import-progress-card.tsx", "utf8"), /setTimeout\(poll, 2500\)/);
  });

  run("admin navigation determines its active state from the current pathname", () => {
    assert.match(navSource, /usePathname/);
    assert.match(navSource, /aria-current/);
  });

  run("local images stay static for iPhone-compatible standalone delivery", () => {
    const imagesConfig = nextConfigSource.slice(
      nextConfigSource.indexOf("images:"),
      nextConfigSource.indexOf("async headers")
    );
    assert.match(imagesConfig, /unoptimized:\s*true/);
  });

  run("background worker infrastructure remains fail-closed", () => {
    const before = process.env.BACKGROUND_JOBS_ENABLED;
    try {
      delete process.env.BACKGROUND_JOBS_ENABLED;
      assert.equal(isBackgroundJobsInfrastructureEnabled(), false);
    } finally {
      if (before === undefined) delete process.env.BACKGROUND_JOBS_ENABLED;
      else process.env.BACKGROUND_JOBS_ENABLED = before;
    }
  });

  run("worker import mode requires both configuration flags", () => {
    assert.equal(isImportWorkerModeAvailable({ backgroundJobsInfrastructure: false, importViaWorker: false, reviewReapplyViaWorker: false, groupApplyViaWorker: false }), false);
    assert.equal(isImportWorkerModeAvailable({ backgroundJobsInfrastructure: true, importViaWorker: false, reviewReapplyViaWorker: false, groupApplyViaWorker: false }), false);
    assert.equal(isImportWorkerModeAvailable({ backgroundJobsInfrastructure: false, importViaWorker: true, reviewReapplyViaWorker: false, groupApplyViaWorker: false }), false);
    assert.equal(isImportWorkerModeAvailable({ backgroundJobsInfrastructure: true, importViaWorker: true, reviewReapplyViaWorker: false, groupApplyViaWorker: false }), true);
  });
}

function run(name: string, fn: () => void) {
  fn();
  console.log(`ok - ${name}`);
}

main();
