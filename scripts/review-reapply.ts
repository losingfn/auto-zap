import { asc, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { adminUsers } from "../src/db/schema";
import {
  cancelReviewReapplyRun,
  createReviewReapplyApplyRun,
  createReviewReapplyDryRun,
  getReviewReapplyRun,
  pauseReviewReapplyRun,
  processReviewReapplyRun,
  resumeReviewReapplyRun,
  rollbackReviewReapplyApplyRun
} from "../src/features/admin/review-reapply";

const [, , command, positionalId] = process.argv;

async function main() {
  switch (command) {
    case "dry-run": {
      const adminUserId = await resolveAdminUserId();
      const run = await createReviewReapplyDryRun({ adminUserId });
      print({
        command,
        run,
        next: run ? `pnpm review:reapply process ${run.id}` : null
      });
      return;
    }

    case "apply": {
      const dryRunId = requiredId(positionalId, "dry-run id");
      const adminUserId = await resolveAdminUserId();
      const run = await createReviewReapplyApplyRun({ dryRunId, adminUserId });
      print({
        command,
        run,
        next: run ? `pnpm review:reapply process ${run.id}` : null
      });
      return;
    }

    case "process": {
      const runId = requiredId(positionalId, "run id");
      const result = await processReviewReapplyRun({
        runId,
        batchSize: readNumberOption("batch-size"),
        maxBatches: readNumberOption("max-batches")
      });
      print({
        command,
        ...result
      });
      return;
    }

    case "status": {
      const run = await getReviewReapplyRun(requiredId(positionalId, "run id"));
      print({ command, run });
      return;
    }

    case "pause": {
      const run = await pauseReviewReapplyRun(requiredId(positionalId, "run id"));
      print({ command, run });
      return;
    }

    case "resume": {
      const run = await resumeReviewReapplyRun(requiredId(positionalId, "run id"));
      print({
        command,
        run,
        next: run ? `pnpm review:reapply process ${run.id}` : null
      });
      return;
    }

    case "cancel": {
      const run = await cancelReviewReapplyRun(requiredId(positionalId, "run id"));
      print({ command, run });
      return;
    }

    case "rollback": {
      const adminUserId = await resolveAdminUserId();
      const result = await rollbackReviewReapplyApplyRun({
        runId: requiredId(positionalId, "apply run id"),
        adminUserId
      });
      print({ command, ...result });
      return;
    }

    default:
      printUsage();
      process.exitCode = 1;
  }
}

function requiredId(value: string | undefined, label: string) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

async function resolveAdminUserId() {
  const explicit = readStringOption("admin-user-id") ?? process.env.REVIEW_REAPPLY_ADMIN_USER_ID;
  if (explicit) return explicit;

  const [admin] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.isActive, true))
    .orderBy(asc(adminUsers.createdAt))
    .limit(1);

  if (!admin) {
    throw new Error("Admin user is required. Pass --admin-user-id=<uuid> or REVIEW_REAPPLY_ADMIN_USER_ID.");
  }

  return admin.id;
}

function readStringOption(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : null;
}

function readNumberOption(name: string) {
  const value = readStringOption(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printUsage() {
  console.log(`Usage:
  pnpm review:reapply dry-run [--admin-user-id=<uuid>]
  pnpm review:reapply process <run-id> [--batch-size=100] [--max-batches=10]
  pnpm review:reapply apply <dry-run-id> [--admin-user-id=<uuid>]
  pnpm review:reapply status <run-id>
  pnpm review:reapply pause <run-id>
  pnpm review:reapply resume <run-id>
  pnpm review:reapply cancel <run-id>
  pnpm review:reapply rollback <apply-run-id> [--admin-user-id=<uuid>]`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
