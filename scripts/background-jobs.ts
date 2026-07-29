import { randomUUID } from "node:crypto";
import {
  clearTestHealthCheckJobs,
  createBackgroundJob,
  getBackgroundJobStatusCounts,
  retryFailedHealthCheckJob
} from "../src/features/background-jobs/repository";

const [, , command, jobId] = process.argv;

async function main() {
  switch (command) {
    case "status":
      print({ command, statuses: await getBackgroundJobStatusCounts() });
      return;
    case "enqueue-test-health-check": {
      const job = await createBackgroundJob({
        type: "health_check",
        payload: { testOnly: true },
        idempotencyKey: `test-health-check:${randomUUID()}`,
        maxAttempts: 1,
        correlationId: `manual-test:${randomUUID().slice(0, 8)}`
      });
      print({ command, jobId: job.id, status: job.status });
      return;
    }
    case "retry": {
      if (!jobId) throw new Error("Job id is required.");
      const job = await retryFailedHealthCheckJob(jobId);
      if (!job) throw new Error("Failed health-check job was not found.");
      print({ command, jobId: job.id, status: job.status });
      return;
    }
    case "clear-test":
      print({ command, deleted: await clearTestHealthCheckJobs() });
      return;
    default:
      printUsage();
      process.exitCode = 1;
  }
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printUsage() {
  console.log(`Usage:
  pnpm jobs status
  pnpm jobs enqueue-test-health-check
  pnpm jobs retry <failed-health-check-job-id>
  pnpm jobs clear-test`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[background-job] cli_failed", {
      error: error instanceof Error ? error.message : "Unknown command error."
    });
    process.exit(1);
  });
