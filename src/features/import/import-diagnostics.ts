export type ImportDeadlockDiagnosis =
  | "hidden_blocking_draft"
  | "cancel_disabled_for_blocking_draft"
  | "duplicate_hash_only"
  | "legacy_status_not_cancellable"
  | "server_action_stale"
  | "no_blocker_found"
  | "blocking_draft_ready_to_cancel";

export type ImportDiagnosticRow = {
  id: string;
  status: string;
  isBlockingDraft: boolean;
  isDuplicateHashBlocker: boolean;
  canCancelForUi: boolean;
  canCancelStrict: boolean;
};

export function diagnoseImportDeadlock({
  rows,
  selectedBatchId,
  serverActionStaleRisk = false
}: {
  rows: ImportDiagnosticRow[];
  selectedBatchId: string | null;
  serverActionStaleRisk?: boolean;
}): ImportDeadlockDiagnosis {
  const blockingDraft = rows.find((row) => row.isBlockingDraft) ?? null;

  if (serverActionStaleRisk) {
    return "server_action_stale";
  }

  if (blockingDraft && selectedBatchId !== blockingDraft.id) {
    return "hidden_blocking_draft";
  }

  if (blockingDraft && !blockingDraft.canCancelForUi) {
    return "cancel_disabled_for_blocking_draft";
  }

  if (blockingDraft && !blockingDraft.canCancelStrict) {
    return "legacy_status_not_cancellable";
  }

  if (!blockingDraft && rows.some((row) => row.isDuplicateHashBlocker)) {
    return "duplicate_hash_only";
  }

  if (!blockingDraft) {
    return "no_blocker_found";
  }

  return "blocking_draft_ready_to_cancel";
}

export function getRecommendedSafeAction(diagnosis: ImportDeadlockDiagnosis) {
  switch (diagnosis) {
    case "hidden_blocking_draft":
      return "Open the blocking batch explicitly and cancel it through the stable API button.";
    case "cancel_disabled_for_blocking_draft":
    case "legacy_status_not_cancellable":
      return "Deploy the unified import-state fix, then cancel the blocking draft from /admin/import.";
    case "duplicate_hash_only":
      return "Check the duplicate hash rows; finalized imports should not block a new upload.";
    case "server_action_stale":
      return "Deploy the stable POST cancel endpoint and client cancel button.";
    case "blocking_draft_ready_to_cancel":
      return "Cancel the blocking draft from /admin/import; active catalog and search will not change.";
    case "no_blocker_found":
    default:
      return "No blocking draft was found by the current resolver; inspect the upload error path.";
  }
}
