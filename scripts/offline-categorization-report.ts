import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDefaultCategorizationContext, categorizeProductName } from "../src/features/categorization/engine";
import { CATEGORIZATION_PIPELINE_VERSION } from "../src/features/categorization/pipeline";
import type { CategorizationDecisionStatus, CategorizationResult } from "../src/features/categorization/types";
import { analyzeImportFile } from "../src/features/import/analyze";
import type { AnalyzedImportRow } from "../src/features/import/types";

const [, , inputPath, ...args] = process.argv;

if (!inputPath) {
  console.error("Usage: AUTOZAP_OFFLINE=1 pnpm categorization:offline <path-to-catalog.xls|xlsx> [--out=reports/offline-categorization]");
  process.exit(1);
}

assertOfflineGuard();

const outputDir = path.resolve(readArg("--out") ?? "reports/offline-categorization");
let analysis!: ReturnType<typeof analyzeImportFile>;

async function main() {
  const startedAt = performance.now();
  const startedMemory = process.memoryUsage().rss;
  analysis = analyzeImportFile(path.resolve(inputPath!));
  const context = buildDefaultCategorizationContext();
  const decisions: DecisionRow[] = [];

  for (const row of analysis.rows) {
    if (!isProductCandidate(row)) {
      if (row.status === "needs_review") {
        decisions.push(toInvalidDecision(row));
      }
      continue;
    }

    const result = categorizeProductName(buildTitle(row), context);
    decisions.push(toDecision(row, result));
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  const peakMemoryMb = Math.round(Math.max(startedMemory, process.memoryUsage().rss) / 1024 / 1024);
  const summary = buildSummary(decisions, elapsedMs, peakMemoryMb);
  const groups = buildGroups(decisions);
  const reviewReasons = countBy(decisions, (decision) => decision.reviewReasonCode || decision.status);
  const conflicts = decisions.filter((decision) => decision.status === "BLOCKED_CONFLICT");
  const residual = decisions.filter(
    (decision) =>
      decision.status === "MANUAL_REVIEW" ||
      decision.status === "INVALID_INPUT" ||
      decision.status === "BLOCKED_CONFLICT" ||
      decision.status === "DO_NOT_PUBLISH"
  );
  const manualSample = buildManualSample(decisions);

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeJson("after-summary.json", summary),
    writeCsv("review-reasons.csv", [
      ["reason", "count", "share", "examples"],
      ...reviewReasons.map((item) => [
        item.key,
        item.count,
        ratio(item.count, decisions.length),
        examplesFor(decisions, (decision) => (decision.reviewReasonCode || decision.status) === item.key)
      ])
    ]),
    writeCsv("category-conflicts.csv", [
      ["status", "category", "subcategory", "count", "examples"],
      ...countBy(conflicts, (decision) => `${decision.categorySlug || "none"}/${decision.subcategorySlug || "none"}`).map((item) => [
        "BLOCKED_CONFLICT",
        item.key.split("/")[0],
        item.key.split("/")[1],
        item.count,
        examplesFor(conflicts, (decision) => `${decision.categorySlug || "none"}/${decision.subcategorySlug || "none"}` === item.key)
      ])
    ]),
    writeCsv("largest-families.csv", [
      ["family", "status", "count", "share", "target", "examples"],
      ...countBy(decisions, (decision) => `${decision.familyLabel || decision.familyId || "unknown"}|${decision.status}`).slice(0, 80).map((item) => {
        const [family, status] = item.key.split("|");
        const sample = decisions.find((decision) => `${decision.familyLabel || decision.familyId || "unknown"}|${decision.status}` === item.key);
        return [
          family,
          status,
          item.count,
          ratio(item.count, decisions.length),
          [sample?.categorySlug, sample?.subcategorySlug].filter(Boolean).join("/"),
          examplesFor(decisions, (decision) => `${decision.familyLabel || decision.familyId || "unknown"}|${decision.status}` === item.key)
        ];
      })
    ]),
    writeCsv("group-proposals.csv", [
      ["groupId", "label", "status", "count", "category", "subcategory", "confidence", "homogeneity", "reviewSampleSize", "examples"],
      ...groups.map((group) => [
        group.id,
        group.label,
        group.status,
        group.count,
        group.categorySlug,
        group.subcategorySlug,
        group.confidence,
        group.homogeneity,
        group.reviewSampleSize,
        group.examples.join(" | ")
      ])
    ]),
    writeCsv("confidence-calibration.csv", [
      ["band", "count", "proxyPrecision", "note"],
      ...buildConfidenceBands(decisions)
    ]),
    writeCsv("manual-sample.csv", [
      [
        "shopCode",
        "name",
        "proposedCategory",
        "proposedSubcategory",
        "confidence",
        "status",
        "group",
        "explanation",
        "correct",
        "correctCategory",
        "reviewerComment"
      ],
      ...manualSample.map((decision) => [
        decision.shopCode,
        decision.name,
        decision.categorySlug,
        decision.subcategorySlug,
        decision.confidence,
        decision.status,
        decision.groupKey,
        decision.reason,
        "",
        "",
        ""
      ])
    ]),
    writeJson("residual-review.json", {
      count: residual.length,
      reasons: reviewReasons.filter((reason) =>
        residual.some((decision) => (decision.reviewReasonCode || decision.status) === reason.key)
      ),
      topFamilies: countBy(residual, (decision) => decision.familyLabel || decision.familyId || "unknown").slice(0, 30),
      examples: residual.slice(0, 80)
    }),
    writeMarkdown(summary, groups, reviewReasons, residual)
  ]);

  console.log(
    JSON.stringify(
      {
        outputDir,
        summary
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

interface DecisionRow {
  rowNumber: number;
  shopCode: string;
  name: string;
  price: number | null;
  status: CategorizationDecisionStatus;
  categorySlug: string;
  subcategorySlug: string;
  confidence: number;
  source: string;
  familyId: string;
  familyLabel: string;
  reason: string;
  reviewReasonCode: string;
  groupKey: string;
  evidenceCount: number;
}

function toDecision(row: AnalyzedImportRow, result: CategorizationResult): DecisionRow {
  const status = result.decisionStatus ?? (result.needsReview ? "MANUAL_REVIEW" : "AUTO_READY");
  const familyId = result.familyId ?? result.matchedRule?.pattern ?? result.source;
  const categorySlug = result.target?.categorySlug ?? "";
  const subcategorySlug = result.target?.subcategorySlug ?? "";
  const groupSignal =
    result.matchedSignals.find((signal) =>
      signal.kind === "phrase" || signal.kind === "technical" || signal.kind === "token" || signal.kind === "pattern"
    )?.value ?? "";
  const groupShard = normalizeGroupShard(groupSignal);

  return {
    rowNumber: row.rowNumber,
    shopCode: row.shopCode ?? "",
    name: row.name || row.rawName,
    price: row.price,
    status,
    categorySlug,
    subcategorySlug,
    confidence: result.confidence,
    source: result.source,
    familyId,
    familyLabel: result.familyLabel ?? familyId,
    reason: result.reason,
    reviewReasonCode: result.reviewReasonCode ?? result.source,
    groupKey: [familyId, groupShard, categorySlug, subcategorySlug].filter(Boolean).join("|") || "manual",
    evidenceCount: result.matchedSignals.length
  };
}

function normalizeGroupShard(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-zа-я0-9.-]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function toInvalidDecision(row: AnalyzedImportRow): DecisionRow {
  return {
    rowNumber: row.rowNumber,
    shopCode: row.shopCode ?? "",
    name: row.name || row.rawName,
    price: row.price,
    status: "INVALID_INPUT",
    categorySlug: "",
    subcategorySlug: "",
    confidence: 0,
    source: "invalid_name",
    familyId: "invalid_input",
    familyLabel: "Невалидные строки",
    reason: row.issues.map((issue) => issue.message).join("; "),
    reviewReasonCode: row.issues[0]?.code ?? "invalid_input",
    groupKey: "invalid_input",
    evidenceCount: 0
  };
}

function buildSummary(decisions: DecisionRow[], elapsedMs: number, peakMemoryMb: number) {
  const statusCounts = countBy(decisions, (decision) => decision.status);
  const groupReviewDecisions = decisions.filter((decision) => decision.status === "GROUP_REVIEW");
  const groups = buildGroups(decisions);
  const averageConfidence =
    decisions.length > 0
      ? decisions.reduce((sum, decision) => sum + decision.confidence, 0) / decisions.length
      : 0;
  const autoReady = statusCounts.find((item) => item.key === "AUTO_READY")?.count ?? 0;
  const groupReview = statusCounts.find((item) => item.key === "GROUP_REVIEW")?.count ?? 0;
  const manualReview = statusCounts.find((item) => item.key === "MANUAL_REVIEW")?.count ?? 0;
  const conflicts = statusCounts.find((item) => item.key === "BLOCKED_CONFLICT")?.count ?? 0;
  const doNotPublish = statusCounts.find((item) => item.key === "DO_NOT_PUBLISH")?.count ?? 0;
  const invalid = statusCounts.find((item) => item.key === "INVALID_INPUT")?.count ?? 0;
  const fullyManual = manualReview + conflicts + invalid + doNotPublish;

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    productionUsed: false,
    inputFile: analysis.report.fileName,
    selectedSheetName: analysis.report.selectedSheetName,
    pipelineVersion: CATEGORIZATION_PIPELINE_VERSION,
    totalRows: analysis.report.totalRows,
    validRows: analysis.report.validRows,
    errorRows: analysis.report.errorRows,
    skippedRows: analysis.report.skippedRows,
    productCandidates: decisions.length,
    autoReady,
    groupReview,
    manualReview,
    blockedConflict: conflicts,
    doNotPublish,
    invalidInput: invalid,
    fullyManual,
    groupCount: groups.length,
    medianGroupSize: median(groups.map((group) => group.count)),
    maxGroupSize: groups[0]?.count ?? 0,
    groupsOver100: groups.filter((group) => group.count > 100).length,
    averageConfidence: Math.round(averageConfidence * 1000) / 1000,
    manualReductionShare: ratio(autoReady + groupReview, decisions.length),
    groupReviewProducts: groupReviewDecisions.length,
    elapsedMs,
    peakMemoryMb,
    statusCounts,
    topGroups: groups.slice(0, 20)
  };
}

function buildGroups(decisions: DecisionRow[]) {
  const grouped = new Map<string, DecisionRow[]>();
  for (const decision of decisions.filter((item) => item.status === "GROUP_REVIEW")) {
    const current = grouped.get(decision.groupKey) ?? [];
    current.push(decision);
    grouped.set(decision.groupKey, current);
  }

  return [...grouped.entries()]
    .map(([id, rows]) => {
      const averageConfidence = rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length;
      const first = rows[0]!;
      return {
        id,
        label: first.familyLabel,
        status: "GROUP_REVIEW",
        count: rows.length,
        categorySlug: first.categorySlug,
        subcategorySlug: first.subcategorySlug,
        confidence: Math.round(averageConfidence * 1000) / 1000,
        homogeneity: 1,
        reviewSampleSize: sampleSizeForGroup(rows.length),
        examples: rows.slice(0, 8).map((row) => `${row.shopCode} ${row.name}`)
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"));
}

function buildConfidenceBands(decisions: DecisionRow[]) {
  const bands = [
    ["0.95-1.00", 0.95, 1],
    ["0.90-0.95", 0.9, 0.95],
    ["0.80-0.90", 0.8, 0.9],
    ["0.70-0.80", 0.7, 0.8],
    ["below-0.70", 0, 0.7]
  ] as const;

  return bands.map(([label, min, max]) => {
    const rows = decisions.filter((decision) =>
      label === "0.95-1.00"
        ? decision.confidence >= min && decision.confidence <= max
        : decision.confidence >= min && decision.confidence < max
    );
    const proxyPrecision =
      rows.length === 0
        ? ""
        : ratio(
            rows.filter((row) => row.status === "AUTO_READY" && row.evidenceCount >= 3).length,
            rows.length
          );
    return [
      label,
      rows.length,
      proxyPrecision,
      "Proxy only: real precision requires filled manual-sample.csv."
    ];
  });
}

function buildManualSample(decisions: DecisionRow[]) {
  const sorted = [...decisions].sort(
    (a, b) =>
      statusWeight(a.status) - statusWeight(b.status) ||
      Math.abs(0.9 - a.confidence) - Math.abs(0.9 - b.confidence) ||
      a.rowNumber - b.rowNumber
  );
  return sorted.slice(0, Math.min(500, sorted.length));
}

async function writeMarkdown(
  summary: ReturnType<typeof buildSummary>,
  groups: ReturnType<typeof buildGroups>,
  reviewReasons: Array<{ key: string; count: number }>,
  residual: DecisionRow[]
) {
  const lines = [
    "# Offline Categorization Report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Input: ${summary.inputFile} / ${summary.selectedSheetName}`,
    `Pipeline: ${summary.pipelineVersion}`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Product candidates | ${summary.productCandidates} |`,
    `| AUTO_READY | ${summary.autoReady} |`,
    `| GROUP_REVIEW products | ${summary.groupReview} |`,
    `| GROUP_REVIEW groups | ${summary.groupCount} |`,
    `| Fully manual residual | ${summary.fullyManual} |`,
    `| BLOCKED_CONFLICT | ${summary.blockedConflict} |`,
    `| DO_NOT_PUBLISH | ${summary.doNotPublish} |`,
    `| INVALID_INPUT | ${summary.invalidInput} |`,
    `| Average confidence | ${summary.averageConfidence} |`,
    `| Full run time, ms | ${summary.elapsedMs} |`,
    `| Peak RSS, MB | ${summary.peakMemoryMb} |`,
    "",
    "## Largest Groups",
    "",
    "| Group | Count | Target | Confidence | Review sample |",
    "| --- | ---: | --- | ---: | ---: |",
    ...groups.slice(0, 25).map(
      (group) =>
        `| ${escapeMarkdown(group.label)} | ${group.count} | ${group.categorySlug}/${group.subcategorySlug} | ${group.confidence} | ${group.reviewSampleSize} |`
    ),
    "",
    "## Residual Review Reasons",
    "",
    "| Reason | Count |",
    "| --- | ---: |",
    ...reviewReasons.slice(0, 30).map((item) => `| ${escapeMarkdown(item.key)} | ${item.count} |`),
    "",
    "## Safety and Limitations",
    "",
    "This report is generated by a read-only offline command. It does not connect to PostgreSQL, does not update Meilisearch, and does not publish or import products.",
    "",
    "The fully manual residual is intentionally not forced into broad categories. If the residual is dominated by fasteners, fittings, rings, generic hoses, adapters, or other items without a safe public taxonomy target, the correct outcome is to leave them for manual review or taxonomy/product-owner decision.",
    "",
    "## Precision Note",
    "",
    "The command prepares manual-sample.csv for real human precision assessment. Proxy bands are reported separately and are not claimed as measured manual accuracy.",
    "",
    "## Residual Examples",
    "",
    ...residual.slice(0, 30).map((decision) => `- ${decision.shopCode} ${decision.name} (${decision.reviewReasonCode})`)
  ];

  await writeFile(path.join(outputDir, "report.md"), `${lines.join("\n")}\n`, "utf8");
}

async function writeJson(fileName: string, value: unknown) {
  await writeFile(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCsv(fileName: string, rows: Array<Array<string | number>>) {
  await writeFile(
    path.join(outputDir, fileName),
    `${rows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`,
    "utf8"
  );
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ru"));
}

function examplesFor(decisions: DecisionRow[], predicate: (decision: DecisionRow) => boolean) {
  return decisions
    .filter(predicate)
    .slice(0, 5)
    .map((decision) => `${decision.shopCode} ${decision.name}`)
    .join(" | ");
}

function buildTitle(row: AnalyzedImportRow) {
  return `${row.shopCode ?? ""} ${row.name || row.rawName}`.trim();
}

function isProductCandidate(row: AnalyzedImportRow) {
  return Boolean(
    row.shopCode &&
      row.price !== null &&
      row.status !== "error" &&
      row.status !== "skipped"
  );
}

function sampleSizeForGroup(count: number) {
  if (count <= 20) return Math.min(count, 8);
  if (count <= 100) return 12;
  return 20;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function ratio(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 10000) / 10000 : 0;
}

function statusWeight(status: CategorizationDecisionStatus) {
  if (status === "AUTO_READY") return 3;
  if (status === "GROUP_REVIEW") return 2;
  if (status === "BLOCKED_CONFLICT") return 0;
  if (status === "DO_NOT_PUBLISH") return 0;
  if (status === "INVALID_INPUT") return 0;
  return 1;
}

function csvValue(value: string | number) {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function escapeMarkdown(value: string) {
  return value.replace(/\|/g, "\\|");
}

function readArg(name: string) {
  const value = args.find((arg) => arg.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1) : null;
}

function assertOfflineGuard() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run offline categorization with NODE_ENV=production.");
  }

  if (process.env.AUTOZAP_OFFLINE !== "1") {
    throw new Error("Set AUTOZAP_OFFLINE=1 to confirm this is a local/offline analysis run.");
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  const meiliHost = process.env.MEILI_HOST ?? "";
  const unsafeEndpoint = [databaseUrl, meiliHost].some((value) =>
    /prod|production|render|railway|supabase|amazonaws|digitalocean|\.ru|\.com/i.test(value)
  );

  if (unsafeEndpoint) {
    throw new Error("Refusing to run with production-like DATABASE_URL or MEILI_HOST in environment.");
  }
}
