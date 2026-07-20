import { access, cp, rm, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneDir = path.join(projectRoot, ".next", "standalone");

const copyJobs = [
  {
    label: "public",
    source: path.join(projectRoot, "public"),
    destination: path.join(standaloneDir, "public"),
    required: false
  },
  {
    label: ".next/static",
    source: path.join(projectRoot, ".next", "static"),
    destination: path.join(standaloneDir, ".next", "static"),
    required: true
  }
];

async function main() {
  await assertFile(path.join(standaloneDir, "server.js"), "standalone server");

  for (const job of copyJobs) {
    const exists = await pathExists(job.source);
    if (!exists) {
      if (job.required) {
        throw new Error(`${job.label} source is missing: ${job.source}`);
      }
      console.log(`[standalone-release] skipped missing ${job.label}`);
      continue;
    }

    assertSafeCopy(job.source, job.destination);
    await rm(job.destination, { recursive: true, force: true });
    await cp(job.source, job.destination, {
      recursive: true,
      errorOnExist: false,
      force: true,
      preserveTimestamps: true
    });
    console.log(`[standalone-release] copied ${relative(job.source)} -> ${relative(job.destination)}`);
  }

  await assertDirectory(path.join(standaloneDir, ".next", "static"), "standalone static assets");
  if (await pathExists(path.join(projectRoot, "public"))) {
    await assertDirectory(path.join(standaloneDir, "public"), "standalone public assets");
  }
}

function assertSafeCopy(source: string, destination: string) {
  const sourcePath = normalizeForComparison(source);
  const destinationPath = normalizeForComparison(destination);

  if (sourcePath === destinationPath) {
    throw new Error(`Refusing to copy ${source} onto itself.`);
  }

  if (destinationPath.startsWith(`${sourcePath}${path.sep}`)) {
    throw new Error(`Refusing to copy ${source} into its own child ${destination}.`);
  }

  if (!destinationPath.startsWith(`${normalizeForComparison(standaloneDir)}${path.sep}`)) {
    throw new Error(`Refusing to write outside standalone directory: ${destination}`);
  }
}

async function assertFile(filePath: string, label: string) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

async function assertDirectory(directoryPath: string, label: string) {
  const directoryStat = await stat(directoryPath).catch(() => null);
  if (!directoryStat?.isDirectory()) {
    throw new Error(`${label} is missing: ${directoryPath}`);
  }
}

async function pathExists(filePath: string) {
  return access(filePath).then(
    () => true,
    () => false
  );
}

function normalizeForComparison(filePath: string) {
  return path.resolve(filePath);
}

function relative(filePath: string) {
  return path.relative(projectRoot, filePath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
