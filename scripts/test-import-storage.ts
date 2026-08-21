import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ImportStoragePathError,
  getImportStoragePath,
  getImportUploadDir,
  getImportUploadFilePath,
  getImportStorageRoot,
  migrateLegacyStandaloneImportFiles,
  resolveExistingImportStoragePath,
  resolveImportStoragePath
} from "../src/features/import/storage";

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "autozap-import-storage-"));
  const projectRoot = path.join(tempRoot, "project");
  const standaloneCwd = path.join(projectRoot, ".next", "standalone");
  const configuredRoot = path.join(tempRoot, "persistent-import-root");

  try {
    await run("web standalone and worker resolve one configured persistent file", async () => {
      const env = { IMPORT_STORAGE_ROOT: configuredRoot };
      const webUploadDir = getImportUploadDir({ cwd: standaloneCwd, env });
      const workerUploadDir = getImportUploadDir({ cwd: projectRoot, env });
      assert.equal(webUploadDir, workerUploadDir);

      const filePath = getImportUploadFilePath("catalog.xlsx", { cwd: standaloneCwd, env });
      await mkdir(webUploadDir, { recursive: true });
      await writeFile(filePath, "excel-data");

      const storagePath = getImportStoragePath(filePath, { cwd: standaloneCwd, env });
      assert.equal(storagePath, "data/imports/uploads/catalog.xlsx");
      assert.equal(resolveImportStoragePath(storagePath, { cwd: projectRoot, env }), filePath);
      assert.equal(await resolveExistingImportStoragePath(storagePath, { cwd: projectRoot, env }), filePath);
    });

    await run("absolute configured roots stay independent from either process cwd", async () => {
      const env = { IMPORT_STORAGE_ROOT: configuredRoot };
      assert.equal(getImportStorageRoot({ cwd: standaloneCwd, env }), path.resolve(configuredRoot));
      assert.equal(getImportStorageRoot({ cwd: projectRoot, env }), path.resolve(configuredRoot));
      assert.throws(
        () => getImportStorageRoot({ cwd: projectRoot, env: { IMPORT_STORAGE_ROOT: "relative-root" } }),
        ImportStoragePathError
      );
    });

    await run("standalone fallback resolves to the local project root", async () => {
      const env = {};
      assert.equal(getImportStorageRoot({ cwd: standaloneCwd, env }), projectRoot);
      assert.equal(getImportStorageRoot({ cwd: projectRoot, env }), projectRoot);
      assert.equal(getImportUploadDir({ cwd: standaloneCwd, env }), getImportUploadDir({ cwd: projectRoot, env }));
    });

    await run("legacy standalone storagePath remains readable for existing batches", async () => {
      const legacyFilePath = path.join(projectRoot, ".next", "standalone", "data", "imports", "uploads", "legacy.xlsx");
      await mkdir(path.dirname(legacyFilePath), { recursive: true });
      await writeFile(legacyFilePath, "legacy-excel-data");

      assert.equal(
        await resolveExistingImportStoragePath("data/imports/uploads/legacy.xlsx", { cwd: projectRoot, env: {} }),
        legacyFilePath
      );
      assert.equal(
        await resolveExistingImportStoragePath(legacyFilePath, { cwd: projectRoot, env: {} }),
        legacyFilePath
      );
    });

    await run("pre-build migration moves legacy files without copying or overwriting", async () => {
      const migrationRoot = path.join(tempRoot, "migration-project");
      const legacyFilePath = path.join(migrationRoot, ".next", "standalone", "data", "imports", "uploads", "queued.xlsx");
      await mkdir(path.dirname(legacyFilePath), { recursive: true });
      await writeFile(legacyFilePath, "queued-excel-data");

      const result = await migrateLegacyStandaloneImportFiles({ cwd: migrationRoot, env: {} });
      const migratedFilePath = path.join(migrationRoot, "data", "imports", "uploads", "queued.xlsx");
      assert.equal(result.moved, 1);
      assert.equal(await resolveExistingImportStoragePath("data/imports/uploads/queued.xlsx", { cwd: migrationRoot, env: {} }), migratedFilePath);
      assert.equal(await resolveExistingImportStoragePath(legacyFilePath, { cwd: migrationRoot, env: {} }), migratedFilePath);

      await mkdir(path.dirname(legacyFilePath), { recursive: true });
      await writeFile(legacyFilePath, "old-content");
      await assert.rejects(
        () => migrateLegacyStandaloneImportFiles({ cwd: migrationRoot, env: {} }),
        ImportStoragePathError
      );
      assert.equal(await readFile(legacyFilePath, "utf8"), "old-content");
    });

    await run("paths outside the import upload directory are rejected", async () => {
      assert.throws(
        () => resolveImportStoragePath("../outside.xlsx", { cwd: projectRoot, env: {} }),
        ImportStoragePathError
      );
      assert.throws(
        () => getImportUploadFilePath("nested/catalog.xlsx", { cwd: projectRoot, env: {} }),
        ImportStoragePathError
      );
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function run(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`ok - ${name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
