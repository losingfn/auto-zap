export type FeatureFlags = {
  backgroundJobsInfrastructure: boolean;
  importViaWorker: boolean;
  reviewReapplyViaWorker: boolean;
  groupApplyViaWorker: boolean;
};

export function getFeatureFlags(): FeatureFlags {
  return {
    backgroundJobsInfrastructure: readBooleanFlag(process.env.BACKGROUND_JOBS_ENABLED),
    importViaWorker: readBooleanFlag(process.env.IMPORT_VIA_WORKER_ENABLED),
    reviewReapplyViaWorker: readBooleanFlag(process.env.REVIEW_REAPPLY_VIA_WORKER_ENABLED),
    groupApplyViaWorker: readBooleanFlag(process.env.GROUP_APPLY_VIA_WORKER_ENABLED)
  };
}

export function isBackgroundJobsInfrastructureEnabled() {
  return getFeatureFlags().backgroundJobsInfrastructure;
}

/**
 * Import jobs may only be accepted when both the feature and its worker
 * infrastructure are enabled. Keeping this check central prevents a pending
 * import from being created in a configuration with no process to consume it.
 */
export function isImportWorkerModeAvailable(flags = getFeatureFlags()) {
  return flags.backgroundJobsInfrastructure && flags.importViaWorker;
}

function readBooleanFlag(value: string | undefined) {
  return value === "1" || value === "true";
}
