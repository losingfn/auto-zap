import { access, mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";

const IMPORT_UPLOAD_PATH_SEGMENTS = ["data", "imports", "uploads"] as const;
const IMPORT_UPLOAD_RELATIVE_PATH = IMPORT_UPLOAD_PATH_SEGMENTS.join("/");

type ImportStorageOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export class ImportStoragePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportStoragePathError";
  }
}

/**
 * Returns the project root that owns persistent import files.
 *
 * IMPORT_STORAGE_ROOT is intentionally read dynamically: the standalone web
 * server and the background worker can receive it at runtime from PM2.
 */
export function getImportStorageRoot(options: ImportStorageOptions = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const configuredRoot = env["IMPORT_STORAGE_ROOT"]?.trim();

  if (configuredRoot) {
    if (!path.isAbsolute(configuredRoot)) {
      throw new ImportStoragePathError("IMPORT_STORAGE_ROOT must be an absolute path.");
    }
    return path.resolve(configuredRoot);
  }

  // Next's standalone server changes its cwd to <project>/.next/standalone.
  // Keep local development and tests simple while making that runtime resolve
  // to the same project-owned storage as the worker.
  if (path.basename(cwd) === "standalone" && path.basename(path.dirname(cwd)) === ".next") {
    return path.dirname(path.dirname(cwd));
  }

  return cwd;
}

export function getImportUploadDir(options: ImportStorageOptions = {}) {
  return path.join(getImportStorageRoot(options), ...IMPORT_UPLOAD_PATH_SEGMENTS);
}

export function getImportUploadFilePath(fileName: string, options: ImportStorageOptions = {}) {
  if (!fileName || path.basename(fileName) !== fileName) {
    throw new ImportStoragePathError("Import upload file name must not contain a path.");
  }
  return path.join(getImportUploadDir(options), fileName);
}

/** Converts an absolute upload-file path to the stable DB representation. */
export function getImportStoragePath(filePath: string, options: ImportStorageOptions = {}) {
  const uploadDir = getImportUploadDir(options);
  const relativeFilePath = getRelativeDescendant(uploadDir, filePath);
  return `${IMPORT_UPLOAD_RELATIVE_PATH}/${toStorageSeparator(relativeFilePath)}`;
}

/** Resolves current stable DB values without checking whether the file exists. */
export function resolveImportStoragePath(storagePath: string, options: ImportStorageOptions = {}) {
  return getImportStoragePathCandidates(storagePath, options)[0]!;
}

/**
 * Resolves an existing upload file. Relative values created before this fix may
 * refer to a file under the old standalone runtime directory, so that location
 * remains a read-only fallback for existing batches only.
 */
export async function resolveExistingImportStoragePath(storagePath: string, options: ImportStorageOptions = {}) {
  const candidates = getImportStoragePathCandidates(storagePath, options);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the legacy standalone location before reporting the missing file.
    }
  }

  throw new ImportStoragePathError("Stored import file does not exist.");
}

/**
 * One-time pre-build migration for files written by the old standalone cwd.
 * It moves (never copies) only direct upload files and refuses every target
 * collision, so it cannot overwrite a file saved by the fixed application.
 */
export async function migrateLegacyStandaloneImportFiles(options: ImportStorageOptions = {}) {
  const root = getImportStorageRoot(options);
  const uploadDir = path.join(root, ...IMPORT_UPLOAD_PATH_SEGMENTS);
  const legacyUploadDir = path.join(root, ".next", "standalone", ...IMPORT_UPLOAD_PATH_SEGMENTS);
  const entries = await readdir(legacyUploadDir, { withFileTypes: true }).catch((error: unknown) => {
    if (getErrorCode(error) === "ENOENT") return [];
    throw error;
  });
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  if (fileNames.length === 0) return { moved: 0, legacyUploadDir, uploadDir };

  await mkdir(uploadDir, { recursive: true });
  for (const fileName of fileNames) {
    const targetPath = path.join(uploadDir, fileName);
    try {
      await access(targetPath);
      throw new ImportStoragePathError(`Refusing to overwrite existing import upload: ${fileName}`);
    } catch (error) {
      if (error instanceof ImportStoragePathError) throw error;
      if (getErrorCode(error) !== "ENOENT") throw error;
    }
  }

  for (const fileName of fileNames) {
    await rename(path.join(legacyUploadDir, fileName), path.join(uploadDir, fileName));
  }

  return { moved: fileNames.length, legacyUploadDir, uploadDir };
}

function getImportStoragePathCandidates(storagePath: string, options: ImportStorageOptions) {
  const root = getImportStorageRoot(options);
  const uploadDir = path.join(root, ...IMPORT_UPLOAD_PATH_SEGMENTS);
  const legacyUploadDir = path.join(root, ".next", "standalone", ...IMPORT_UPLOAD_PATH_SEGMENTS);
  const normalizedStoragePath = storagePath.trim();

  if (!normalizedStoragePath) {
    throw new ImportStoragePathError("Import storage path is empty.");
  }

  if (path.isAbsolute(normalizedStoragePath)) {
    if (isDescendant(uploadDir, normalizedStoragePath)) {
      return [path.resolve(normalizedStoragePath)];
    }
    if (isDescendant(legacyUploadDir, normalizedStoragePath)) {
      const relativeFilePath = getRelativeDescendant(legacyUploadDir, normalizedStoragePath);
      return uniquePaths([
        path.join(uploadDir, relativeFilePath),
        path.resolve(normalizedStoragePath)
      ]);
    }
    throw new ImportStoragePathError("Import storage path is outside the upload directory.");
  }

  const normalizedRelativePath = normalizedStoragePath.split("\\").join(path.sep);
  const primaryPath = path.resolve(root, normalizedRelativePath);
  if (!isDescendant(uploadDir, primaryPath)) {
    throw new ImportStoragePathError("Import storage path is outside the upload directory.");
  }

  const relativeFilePath = getRelativeDescendant(uploadDir, primaryPath);
  return uniquePaths([
    primaryPath,
    path.join(legacyUploadDir, relativeFilePath)
  ]);
}

function getRelativeDescendant(parentPath: string, filePath: string) {
  const resolvedParent = path.resolve(parentPath);
  const resolvedFile = path.resolve(filePath);
  const relative = path.relative(resolvedParent, resolvedFile);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new ImportStoragePathError("Import storage path is outside the upload directory.");
  }
  return relative;
}

function isDescendant(parentPath: string, filePath: string) {
  try {
    getRelativeDescendant(parentPath, filePath);
    return true;
  } catch {
    return false;
  }
}

function toStorageSeparator(value: string) {
  return value.split(path.sep).join("/");
}

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((filePath) => path.resolve(filePath)))];
}

function getErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}
