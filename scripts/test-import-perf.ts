import assert from "node:assert/strict";
import { createImportPerfLogger } from "../src/lib/server/import-perf";

async function main() {
  const originalFlag = process.env.ADMIN_IMPORT_PERF_LOGS;
  const originalInfo = console.info;
  const logs: string[] = [];

  try {
    delete process.env.ADMIN_IMPORT_PERF_LOGS;
    assert.equal(createImportPerfLogger(), undefined);

    process.env.ADMIN_IMPORT_PERF_LOGS = "1";
    console.info = ((value: string) => logs.push(value)) as typeof console.info;
    const perf = createImportPerfLogger();
    assert.ok(perf);

    const original = new Error("original-operation-error");
    await assert.rejects(
      perf.measure("classification", () => {
        throw original;
      }),
      (error: unknown) => error === original && error instanceof Error && error.stack === original.stack
    );

    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /^\[admin-import-perf\] /);
    assert.match(logs[0]!, /stage=classification/);
    assert.match(logs[0]!, /status=error/);
    assert.match(logs[0]!, /rss=\d+/);
    assert.match(logs[0]!, /heap_used=\d+/);
    assert.match(logs[0]!, /heap_total=\d+/);
    assert.match(logs[0]!, /event_loop_lag_ms=\d+/);
    assert.doesNotMatch(logs[0]!, /original-operation-error/);

    console.log("✓ import diagnostics preserve the original error and emit only safe fields");
  } finally {
    console.info = originalInfo;
    if (originalFlag === undefined) {
      delete process.env.ADMIN_IMPORT_PERF_LOGS;
    } else {
      process.env.ADMIN_IMPORT_PERF_LOGS = originalFlag;
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
