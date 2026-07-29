import { runBackgroundWorker } from "../src/workers/background-worker";

runBackgroundWorker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[background-job] worker_fatal", {
      error: error instanceof Error ? error.message : "Unknown worker error."
    });
    process.exit(1);
  });
