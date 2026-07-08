import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets } from "@/db/schema";

const execFileAsync = promisify(execFile);
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "content");

const KIND_LIMITS: Record<ContentAssetKind, number> = {
  logo: 4 * 1024 * 1024,
  favicon: 1024 * 1024,
  og_image: 8 * 1024 * 1024,
  store_photo: 8 * 1024 * 1024,
  category_icon: 2 * 1024 * 1024,
  vacancy_image: 8 * 1024 * 1024
};

const KIND_EXTENSIONS: Record<ContentAssetKind, Set<string>> = {
  logo: new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]),
  favicon: new Set([".ico", ".svg", ".png"]),
  og_image: new Set([".jpg", ".jpeg", ".png", ".webp"]),
  store_photo: new Set([".jpg", ".jpeg", ".png", ".webp"]),
  category_icon: new Set([".svg", ".png", ".webp"]),
  vacancy_image: new Set([".jpg", ".jpeg", ".png", ".webp"])
};

const MIME_BY_EXTENSION: Record<string, string[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".svg": ["image/svg+xml"],
  ".ico": ["image/x-icon", "image/vnd.microsoft.icon"]
};

export type ContentAssetKind = typeof assets.$inferInsert.kind;

export class ContentAssetUploadError extends Error {
  constructor(
    public readonly code:
      | "missing_file"
      | "empty_file"
      | "file_too_large"
      | "invalid_extension"
      | "invalid_type"
      | "invalid_signature",
    message: string
  ) {
    super(message);
    this.name = "ContentAssetUploadError";
  }
}

export async function saveContentAsset({
  file,
  kind,
  altText,
  sortOrder = 0,
  singleton = false
}: {
  file: File | null;
  kind: ContentAssetKind;
  altText?: string | null;
  sortOrder?: number;
  singleton?: boolean;
}) {
  const validated = await validateAssetFile(file, kind);
  const folder = path.join(UPLOAD_ROOT, kind);
  const hash = createHash("sha256").update(validated.buffer).digest("hex");
  const extension = normalizedOutputExtension(validated.extension);
  const baseName = path
    .basename(validated.file.name, validated.extension)
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  const fileName = `${Date.now()}-${hash.slice(0, 12)}-${baseName || kind}${extension}`;
  const absolutePath = path.join(folder, fileName);

  await mkdir(folder, { recursive: true });

  const { bytes, mimeType, optimized } = await optimizeAssetBytes({
    buffer: validated.buffer,
    extension: validated.extension,
    outputPath: absolutePath,
    kind
  });

  if (!optimized) {
    await writeFile(absolutePath, bytes);
  }

  if (singleton) {
    await db.update(assets).set({ isActive: false }).where(eq(assets.kind, kind));
  }

  const publicPath = `/uploads/content/${kind}/${fileName}`;
  const [asset] = await db
    .insert(assets)
    .values({
      kind,
      originalFilename: validated.file.name,
      publicPath,
      mimeType,
      sizeBytes: bytes.length,
      altText: altText?.trim() || null,
      sortOrder,
      isActive: true,
      metadata: {
        sha256: hash,
        optimized,
        originalMimeType: validated.file.type || null,
        originalSizeBytes: validated.file.size
      }
    })
    .returning({
      id: assets.id,
      publicPath: assets.publicPath,
      originalFilename: assets.originalFilename
    });

  return asset;
}

async function validateAssetFile(file: File | null, kind: ContentAssetKind) {
  if (!file) {
    throw new ContentAssetUploadError("missing_file", "Выберите файл изображения.");
  }

  if (file.size === 0) {
    throw new ContentAssetUploadError("empty_file", "Файл пустой.");
  }

  const limit = KIND_LIMITS[kind];
  if (file.size > limit) {
    throw new ContentAssetUploadError(
      "file_too_large",
      `Файл больше ${Math.round(limit / 1024 / 1024)} МБ.`
    );
  }

  const extension = path.extname(file.name).toLowerCase();
  if (!KIND_EXTENSIONS[kind].has(extension)) {
    throw new ContentAssetUploadError("invalid_extension", "Неподдерживаемое расширение файла.");
  }

  const allowedMimeTypes = MIME_BY_EXTENSION[extension] ?? [];
  if (
    file.type &&
    file.type !== "application/octet-stream" &&
    allowedMimeTypes.length > 0 &&
    !allowedMimeTypes.includes(file.type)
  ) {
    throw new ContentAssetUploadError("invalid_type", "Тип файла не соответствует изображению.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidImageSignature(buffer, extension)) {
    throw new ContentAssetUploadError(
      "invalid_signature",
      "Содержимое файла не похоже на изображение выбранного типа."
    );
  }

  return { file, extension, buffer };
}

async function optimizeAssetBytes({
  buffer,
  extension,
  outputPath,
  kind
}: {
  buffer: Buffer;
  extension: string;
  outputPath: string;
  kind: ContentAssetKind;
}) {
  if (extension === ".svg") {
    const optimizedSvg = minifySvg(buffer.toString("utf8"));
    return {
      bytes: Buffer.from(optimizedSvg, "utf8"),
      mimeType: "image/svg+xml",
      optimized: true
    };
  }

  if (extension === ".jpg" || extension === ".jpeg" || extension === ".png") {
    const optimized = await tryOptimizeWithSips(buffer, outputPath, extension, maxWidthForKind(kind));
    if (optimized) {
      return {
        bytes: optimized,
        mimeType: extension === ".png" ? "image/png" : "image/jpeg",
        optimized: true
      };
    }
  }

  return {
    bytes: buffer,
    mimeType: mimeTypeForExtension(extension),
    optimized: extension === ".webp" || extension === ".ico"
  };
}

async function tryOptimizeWithSips(
  buffer: Buffer,
  outputPath: string,
  extension: string,
  maxWidth: number
) {
  const tempInput = `${outputPath}.source${extension}`;
  await writeFile(tempInput, buffer);

  try {
    const args =
      extension === ".png"
        ? ["-Z", String(maxWidth), tempInput, "--out", outputPath]
        : [
            "-Z",
            String(maxWidth),
            "--setProperty",
            "format",
            "jpeg",
            "--setProperty",
            "formatOptions",
            "84",
            tempInput,
            "--out",
            outputPath
          ];
    await execFileAsync("/usr/bin/sips", args);
    const { readFile, rm } = await import("node:fs/promises");
    const optimized = await readFile(outputPath);
    await rm(tempInput, { force: true });
    return optimized.length > 0 ? optimized : null;
  } catch {
    const { rm } = await import("node:fs/promises");
    await rm(tempInput, { force: true });
    return null;
  }
}

function hasValidImageSignature(buffer: Buffer, extension: string) {
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (extension === ".png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === ".webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (extension === ".ico") {
    return buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]));
  }
  if (extension === ".svg") {
    return /<svg[\s>]/i.test(buffer.toString("utf8", 0, Math.min(buffer.length, 2048)));
  }
  return false;
}

function normalizedOutputExtension(extension: string) {
  return extension === ".jpeg" ? ".jpg" : extension;
}

function mimeTypeForExtension(extension: string) {
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function maxWidthForKind(kind: ContentAssetKind) {
  if (kind === "og_image") return 1200;
  if (kind === "logo" || kind === "category_icon" || kind === "favicon") return 512;
  return 1280;
}

function minifySvg(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}
