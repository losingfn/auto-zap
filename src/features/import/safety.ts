import { importSafetyThresholds } from "@/config/import-safety";
import type {
  ImportPreviewReport,
  ImportSafetyCheckResult,
  ImportSafetyCheckStatus,
  ImportSafetyReport
} from "./types";

export class ImportSafetyError extends Error {
  constructor(
    message: string,
    public readonly report: ImportSafetyReport
  ) {
    super(message);
    this.name = "ImportSafetyError";
  }
}

export interface EvaluateImportSafetyInput {
  report: ImportPreviewReport;
  activeProductCount: number;
  draftActiveProductCount: number;
  invalidCategoryCount?: number;
  hasActiveVersion: boolean;
  hasBlockingImport?: boolean;
  meilisearchAvailable?: boolean;
}

export function evaluateImportSafety(input: EvaluateImportSafetyInput): ImportSafetyReport {
  const checks: ImportSafetyCheckResult[] = [];
  const candidateBase = Math.max(input.report.productCandidateRows, 1);
  const activeBase = Math.max(input.activeProductCount, 1);
  const shrinkRatio =
    input.activeProductCount > 0
      ? Math.max(0, input.activeProductCount - input.draftActiveProductCount) / activeBase
      : 0;
  const archiveRatio = input.activeProductCount > 0 ? input.report.archivedCount / activeBase : 0;
  const parseErrorRatio = input.report.errorRows / candidateBase;
  const missingPriceRatio = (input.report.issueCounts.missing_price ?? 0) / candidateBase;
  const missingNameRatio = (input.report.issueCounts.missing_name ?? 0) / candidateBase;
  const duplicateCodeCount = input.report.issueCounts.duplicate_code ?? 0;
  const existingCategoryLossCount = estimateExistingCategoryLoss(input.report);
  const existingCategoryLossRatio =
    input.activeProductCount > 0 ? existingCategoryLossCount / activeBase : 0;
  const reviewRatio = input.report.reviewRows / candidateBase;

  checks.push(
    booleanCheck({
      code: "active_version_exists",
      ok: input.hasActiveVersion,
      message: input.hasActiveVersion
        ? "Активная версия найдена и будет сохранена как точка отката."
        : "Активная версия каталога отсутствует."
    }),
    booleanCheck({
      code: "no_parallel_import",
      ok: !input.hasBlockingImport,
      message: input.hasBlockingImport
        ? "Уже есть незавершённый черновик импорта."
        : "Других незавершённых импортов нет."
    }),
    thresholdCheck({
      code: "new_active_count",
      value: input.draftActiveProductCount,
      threshold: 1,
      ok: input.draftActiveProductCount > 0,
      message: input.draftActiveProductCount > 0
        ? "В новой версии есть товары для публикации."
        : "Новая версия не содержит активных товаров."
    }),
    thresholdCheck({
      code: "catalog_shrink_ratio",
      value: shrinkRatio,
      threshold: importSafetyThresholds.maxCatalogShrinkRatio,
      ok: shrinkRatio <= importSafetyThresholds.maxCatalogShrinkRatio,
      message: "Новая версия не меньше активной сверх безопасного порога."
    }),
    thresholdCheck({
      code: "archive_ratio",
      value: archiveRatio,
      threshold: importSafetyThresholds.maxArchiveRatio,
      ok: archiveRatio <= importSafetyThresholds.maxArchiveRatio,
      message: "Количество кандидатов на архивирование в безопасном диапазоне."
    }),
    thresholdCheck({
      code: "parse_error_ratio",
      value: parseErrorRatio,
      threshold: importSafetyThresholds.maxParseErrorRatio,
      ok: parseErrorRatio <= importSafetyThresholds.maxParseErrorRatio,
      message: "Ошибок разбора меньше порога."
    }),
    thresholdCheck({
      code: "missing_price_ratio",
      value: missingPriceRatio,
      threshold: importSafetyThresholds.maxMissingPriceRatio,
      ok: missingPriceRatio <= importSafetyThresholds.maxMissingPriceRatio,
      message: "Строк без цены меньше порога."
    }),
    thresholdCheck({
      code: "missing_name_ratio",
      value: missingNameRatio,
      threshold: importSafetyThresholds.maxMissingNameRatio,
      ok: missingNameRatio <= importSafetyThresholds.maxMissingNameRatio,
      message: "Строк без названия меньше порога."
    }),
    thresholdCheck({
      code: "duplicate_shop_code",
      value: duplicateCodeCount,
      threshold: 0,
      ok: duplicateCodeCount === 0,
      message: duplicateCodeCount === 0
        ? "Дубли артикулов не найдены."
        : "В файле есть повторяющиеся артикулы."
    }),
    thresholdCheck({
      code: "invalid_category",
      value: input.invalidCategoryCount ?? 0,
      threshold: 0,
      ok: (input.invalidCategoryCount ?? 0) === 0,
      message: "Все публикуемые товары имеют валидную категорию и подкатегорию."
    }),
    thresholdCheck({
      code: "existing_category_loss",
      value: existingCategoryLossRatio,
      threshold: importSafetyThresholds.maxExistingCategoryLossRatio,
      ok: existingCategoryLossRatio <= importSafetyThresholds.maxExistingCategoryLossRatio,
      message: "Существующие товары не теряют категории массово."
    }),
    thresholdCheck({
      code: "review_items",
      value: reviewRatio,
      threshold: importSafetyThresholds.reviewWarningRatio,
      ok: true,
      status: reviewRatio > importSafetyThresholds.reviewWarningRatio ? "warning" : "passed",
      message:
        input.report.reviewRows > 0
          ? "Спорные товары останутся в review и не попадут в публичный каталог."
          : "Спорных товаров нет."
    })
  );

  if (input.meilisearchAvailable !== undefined) {
    checks.push(
      booleanCheck({
        code: "meilisearch_available",
        ok: input.meilisearchAvailable,
        message: input.meilisearchAvailable
          ? "Meilisearch доступен для переиндексации."
          : "Meilisearch недоступен."
      })
    );
  }

  return summarizeSafetyChecks(checks);
}

export function summarizeSafetyChecks(checks: ImportSafetyCheckResult[]): ImportSafetyReport {
  const blockingCount = checks.filter((check) => check.status === "blocked").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;

  return {
    canPublish: blockingCount === 0,
    blockingCount,
    warningCount,
    checks
  };
}

export function assertImportSafety(report: ImportSafetyReport) {
  if (report.canPublish) {
    return;
  }

  const firstBlocker = report.checks.find((check) => check.status === "blocked");
  throw new ImportSafetyError(
    firstBlocker?.message ?? "Публикация заблокирована safety checks.",
    report
  );
}

function estimateExistingCategoryLoss(report: ImportPreviewReport) {
  const existingCandidateCount = report.updatedCount + report.unchangedCount;
  const preserved = report.autoCategorizationPreview?.existingCategoryPreserved ?? 0;

  return Math.max(0, existingCandidateCount - preserved);
}

function booleanCheck({
  code,
  message,
  ok
}: {
  code: string;
  message: string;
  ok: boolean;
}): ImportSafetyCheckResult {
  return {
    code,
    status: ok ? "passed" : "blocked",
    message,
    currentValue: ok
  };
}

function thresholdCheck({
  code,
  message,
  ok,
  status,
  threshold,
  value
}: {
  code: string;
  message: string;
  ok: boolean;
  status?: ImportSafetyCheckStatus;
  threshold: number;
  value: number;
}): ImportSafetyCheckResult {
  return {
    code,
    status: status ?? (ok ? "passed" : "blocked"),
    message,
    currentValue: value,
    threshold
  };
}
