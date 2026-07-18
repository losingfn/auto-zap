import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { defaultCategorizationRules } from "../src/config/catalog-taxonomy";
import { isPublicCategorySlug, isPublicTaxonomyTarget } from "../src/config/public-taxonomy";
import { categorizeProductName, normalizeForCategorization } from "../src/features/categorization/engine";
import { CATEGORIZATION_PIPELINE_VERSION } from "../src/features/categorization/pipeline";
import {
  AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  MEDIUM_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  type CategorizationContext,
  type CategorizationDecisionStatus,
  type CategorizationResult,
  type CategorizationRuleRecord,
  type CategorizationSignal,
  type CategorizationSource,
  type CategorizationTarget
} from "../src/features/categorization/types";
import {
  normalizeProductName,
  type NormalizedProductName
} from "../src/features/categorization/normalization";
import { analyzeImportFile } from "../src/features/import/analyze";
import type { AnalyzedImportRow, ExistingProductSnapshot } from "../src/features/import/types";

const [, , inputPath, ...args] = process.argv;

if (!inputPath) {
  console.error(
    "Usage: DATABASE_URL=postgres://autozap:autozap@localhost:5432/autozap AUTOZAP_OFFLINE=1 pnpm categorization:replay <path-to-catalog.xlsx> [--out=reports/offline-real-replay] [--target-existing=21811] [--target-new=3742] [--import-limit=25567]"
  );
  process.exit(1);
}

assertOfflineGuard();

const outputDir = path.resolve(readArg("--out") ?? "reports/offline-real-replay");
const targetExisting = readNumberArg("--target-existing");
const targetNew = readNumberArg("--target-new");
const importLimit = readNumberArg("--import-limit");
const manualSampleSize = readNumberArg("--manual-sample-size") ?? 500;
const sql = postgres(process.env.DATABASE_URL!, {
  max: 4,
  idle_timeout: 10,
  connect_timeout: 5
});

async function main() {
  const startedAt = performance.now();
  const startedMemory = process.memoryUsage().rss;
  await sql`set default_transaction_read_only = on`;

  const [activeVersion, context, activeProducts, importBatches] = await Promise.all([
    loadActiveVersion(),
    loadCategorizationContext(),
    loadActiveProducts(),
    loadImportBatchSummary()
  ]);
  const activeByCode = new Map(activeProducts.map((product) => [product.shopCode, product]));
  const activeIndex = buildActiveIndex(activeProducts);
  const analysis = analyzeImportFile(path.resolve(inputPath!), { existingProducts: activeProducts });
  const candidateRows = selectScenarioRows(
    analysis.rows.filter(isProductCandidate),
    activeByCode
  );
  const decisions: DecisionRow[] = [];

  for (const row of candidateRows) {
    const existing = row.shopCode ? activeByCode.get(row.shopCode) ?? null : null;
    const result = categorizeImportRow(row, context, activeIndex, existing);
    decisions.push(toDecision(row, result, existing ? "existing_active" : "new_or_unconfirmed"));
  }

  const existingDecisions = decisions.filter((decision) => decision.scope === "existing_active");
  const newDecisions = decisions.filter((decision) => decision.scope === "new_or_unconfirmed");
  const groups = buildGroups(newDecisions);
  const residual = newDecisions.filter(isFullyManual);
  const familyDistribution = buildFamilyDistribution(newDecisions);
  const activeAnalogPareto = buildActiveAnalogPareto(residual, activeIndex);
  const shadowPrecision = buildShadowPrecision(activeProducts, context);
  const confidenceCalibration = buildConfidenceCalibration(shadowPrecision.rows);
  const manualSample = buildManualSample(newDecisions, manualSampleSize);
  const precisionSample = buildPrecisionSample(newDecisions, groups, manualSampleSize);
  const elapsedMs = Math.round(performance.now() - startedAt);
  const peakMemoryMb = Math.round(Math.max(startedMemory, process.memoryUsage().rss) / 1024 / 1024);
  const summary = buildSummary({
    analysis,
    activeVersion,
    importBatches,
    activeProducts,
    activeByCode,
    decisions,
    existingDecisions,
    newDecisions,
    groups,
    residual,
    shadowPrecision,
    elapsedMs,
    peakMemoryMb
  });
  const residualAnalysis = buildResidualAnalysis(residual, activeIndex);
  const iterationComparison = await buildIterationComparison(summary);
  const autoReadyAudit = buildAutoReadyAudit(newDecisions);

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeJson("summary.json", summary),
    writeJson("residual-review.json", {
      count: residual.length,
      byReason: countBy(residual, (decision) => decision.reviewReasonCode).slice(0, 40),
      byFamily: countBy(residual, (decision) => decision.detectedFamily).slice(0, 40),
      activeAnalogPareto: activeAnalogPareto.slice(0, 40),
      examples: residual.slice(0, 120)
    }),
    writeJson("shadow-precision.json", shadowPrecision.summary),
    writeCsv("new-products.csv", [
      [
        "scope",
        "status",
        "shopCode",
        "name",
        "category",
        "subcategory",
        "confidence",
        "source",
        "family",
        "detectedFamily",
        "reviewReason",
        "evidence",
        "neighborTarget",
        "neighborShare",
        "neighborExamples"
      ],
      ...newDecisions.map((decision) => [
        decision.scope,
        decision.status,
        decision.shopCode,
        decision.name,
        decision.categorySlug,
        decision.subcategorySlug,
        decision.confidence,
        decision.source,
        decision.familyLabel,
        decision.detectedFamily,
        decision.reviewReasonCode,
        decision.evidence.join(" | "),
        decision.neighborTarget,
        decision.neighborShare,
        decision.neighborExamples.join(" | ")
      ])
    ]),
    writeCsv("review-reasons.csv", [
      ["reason", "count", "share", "examples"],
      ...countBy(residual, (decision) => decision.reviewReasonCode).map((item) => [
        item.key,
        item.count,
        ratio(item.count, Math.max(residual.length, 1)),
        examplesFor(residual, (decision) => decision.reviewReasonCode === item.key)
      ])
    ]),
    writeCsv("residual-reasons.csv", [
      ["reason", "count", "share", "examples"],
      ...residualAnalysis.reasonRows.map((item) => [
        item.reason,
        item.count,
        item.share,
        item.examples.join(" | ")
      ])
    ]),
    writeCsv("residual-families.csv", [
      [
        "family",
        "residualCount",
        "share",
        "reason",
        "usefulContext",
        "noUsefulContext",
        "topTokens",
        "activeAnalogs",
        "topActiveTargets",
        "groupPossible",
        "autoReadyPossible",
        "irreducible",
        "examples"
      ],
      ...residualAnalysis.familyRows.map((item) => [
        item.family,
        item.residualCount,
        item.share,
        item.reason,
        item.usefulContext,
        item.noUsefulContext,
        item.topTokens.join(" | "),
        item.activeAnalogs,
        item.topActiveTargets.map((target) => `${target.key}:${target.count}`).join(" | "),
        item.groupPossible,
        item.autoReadyPossible,
        item.irreducible,
        item.examples.join(" | ")
      ])
    ]),
    writeCsv("residual-classified.csv", [
      [
        "familyId",
        "family",
        "reason",
        "shopCode",
        "name",
        "status",
        "reviewReason",
        "detectedFamily",
        "neighborTarget",
        "neighborShare",
        "confidence",
        "evidence"
      ],
      ...residualAnalysis.classifiedRows.map((item) => [
        item.familyId,
        item.family,
        item.reason,
        item.decision.shopCode,
        item.decision.name,
        item.decision.status,
        item.decision.reviewReasonCode,
        item.decision.detectedFamily,
        item.decision.neighborTarget,
        item.decision.neighborShare,
        item.decision.confidence,
        item.decision.evidence.join(" | ")
      ])
    ]),
    writeCsv("taxonomy-limit.csv", [
      [
        "Family",
        "Residual",
        "Contextual",
        "No context",
        "Active analogs",
        "Top target",
        "Purity",
        "Confidence gap",
        "Conflict share",
        "No analog share",
        "Safe auto",
        "Safe group",
        "Irreducible",
        "Limit reason"
      ],
      ...residualAnalysis.taxonomyLimitRows.map((item) => [
        item.family,
        item.residual,
        item.contextual,
        item.noContext,
        item.activeAnalogs,
        item.topTarget,
        item.purity,
        item.confidenceGap,
        item.conflictShare,
        item.noAnalogShare,
        item.safeAuto,
        item.safeGroup,
        item.irreducible,
        item.limitReason
      ])
    ]),
    writeCsv("iteration-comparison.csv", [
      ["Iteration", "AUTO_READY", "GROUP_REVIEW", "Groups", "MANUAL_REVIEW", "BLOCKED_CONFLICT", "INVALID_INPUT", "Fully manual", "Main change"],
      ...iterationComparison.map((item) => [
        item.iteration,
        item.autoReady,
        item.groupReview,
        item.groups,
        item.manualReview,
        item.blockedConflict,
        item.invalidInput,
        item.fullyManual,
        item.mainChange
      ])
    ]),
    writeCsv("largest-groups.csv", [
      ["groupId", "label", "count", "target", "confidence", "homogeneity", "reviewSampleSize", "riskFlags", "examples", "outliers"],
      ...groups.slice(0, 80).map((group) => [
        group.id,
        group.label,
        group.count,
        `${group.categorySlug}/${group.subcategorySlug}`,
        group.confidence,
        group.homogeneity,
        group.reviewSampleSize,
        group.riskFlags.join(" | "),
        group.examples.join(" | "),
        group.outliers.join(" | ")
      ])
    ]),
    writeCsv("auto-ready-audit.csv", [
      ["source", "family", "target", "band", "count", "averageConfidence", "neighborBased", "examples"],
      ...autoReadyAudit.map((item) => [
        item.source,
        item.family,
        item.target,
        item.band,
        item.count,
        item.averageConfidence,
        item.neighborBased,
        item.examples.join(" | ")
      ])
    ]),
    writeCsv("group-review-audit.csv", [
      ["groupId", "label", "count", "target", "confidence", "homogeneity", "reviewSampleSize", "riskFlags", "operatorAction", "examples", "outliers"],
      ...groups.map((group) => [
        group.id,
        group.label,
        group.count,
        `${group.categorySlug}/${group.subcategorySlug}`,
        group.confidence,
        group.homogeneity,
        group.reviewSampleSize,
        group.riskFlags.join(" | "),
        "confirm_or_split_group",
        group.examples.join(" | "),
        group.outliers.join(" | ")
      ])
    ]),
    writeCsv("family-distribution.csv", [
      ["family", "status", "count", "shareOfNew", "target", "examples"],
      ...familyDistribution.map((item) => [
        item.family,
        item.status,
        item.count,
        ratio(item.count, newDecisions.length),
        item.target,
        item.examples.join(" | ")
      ])
    ]),
    writeCsv("active-analog-pareto.csv", [
      ["family", "residualCount", "activeAnalogCount", "topActiveTargets", "residualExamples"],
      ...activeAnalogPareto.map((item) => [
        item.family,
        item.residualCount,
        item.activeAnalogCount,
        item.topActiveTargets.map((target) => `${target.key}:${target.count}`).join(" | "),
        item.residualExamples.join(" | ")
      ])
    ]),
    writeCsv("group-proposals.csv", [
      [
        "groupId",
        "label",
        "count",
        "category",
        "subcategory",
        "confidence",
        "homogeneity",
        "reviewSampleSize",
        "riskFlags",
        "examples",
        "outliers"
      ],
      ...groups.map((group) => [
        group.id,
        group.label,
        group.count,
        group.categorySlug,
        group.subcategorySlug,
        group.confidence,
        group.homogeneity,
        group.reviewSampleSize,
        group.riskFlags.join(" | "),
        group.examples.join(" | "),
        group.outliers.join(" | ")
      ])
    ]),
    writeCsv("confidence-calibration.csv", [
      ["status", "band", "evaluated", "correct", "precision", "note"],
      ...confidenceCalibration
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
        "detectedFamily",
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
        decision.detectedFamily,
        decision.reason,
        "",
        "",
        ""
      ])
    ]),
    writeCsv("precision-sample.csv", [
      [
        "sampleType",
        "shopCode",
        "name",
        "proposedCategory",
        "proposedSubcategory",
        "confidence",
        "status",
        "group",
        "detectedFamily",
        "evidence",
        "neighborTarget",
        "needsHumanCheck",
        "correct",
        "correctCategory",
        "reviewerComment"
      ],
      ...precisionSample.map((sample) => [
        sample.sampleType,
        sample.decision.shopCode,
        sample.decision.name,
        sample.decision.categorySlug,
        sample.decision.subcategorySlug,
        sample.decision.confidence,
        sample.decision.status,
        sample.decision.groupKey,
        sample.decision.detectedFamily,
        sample.decision.evidence.join(" | "),
        sample.decision.neighborTarget,
        "yes",
        "",
        "",
        ""
      ])
    ]),
    writeMarkdown(summary, groups, residual, activeAnalogPareto, confidenceCalibration, residualAnalysis, iterationComparison),
    writeManualAudit(summary, residualAnalysis, groups),
    writeDraftPr(summary, residualAnalysis, iterationComparison)
  ]);

  console.log(JSON.stringify({ outputDir, summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });

interface ActiveVersionRow {
  id: string;
  source_file_name: string | null;
  total_rows: number;
  parsed_rows: number;
  added_count: number;
  updated_count: number;
  review_count: number;
  error_count: number;
  published_at: Date | null;
  created_at: Date;
}

interface DbRuleRow {
  id: string;
  pattern: string;
  match_type: CategorizationRuleRecord["matchType"];
  priority: number;
  category_id: string;
  category_slug: string;
  category_name: string;
  subcategory_id: string;
  subcategory_slug: string;
  subcategory_name: string;
  created_by: string | null;
}

interface DbTargetRow {
  category_id: string;
  category_slug: string;
  category_name: string;
  subcategory_id: string;
  subcategory_slug: string;
  subcategory_name: string;
}

interface ActiveProduct extends ExistingProductSnapshot {
  id: string;
  rawName: string;
  targetKey: string;
  tokens: string[];
  tokenSet: Set<string>;
  normalized: NormalizedProductName;
}

interface ActiveIndex {
  products: ActiveProduct[];
  byToken: Map<string, ActiveProduct[]>;
}

interface NeighborSummary {
  target: CategorizationTarget | null;
  share: number;
  evidence: string[];
  examples: string[];
}

type DecisionScope = "existing_active" | "new_or_unconfirmed";

interface DecisionRow {
  rowNumber: number;
  scope: DecisionScope;
  shopCode: string;
  name: string;
  price: number | null;
  status: CategorizationDecisionStatus;
  categorySlug: string;
  subcategorySlug: string;
  confidence: number;
  source: CategorizationSource | string;
  familyId: string;
  familyLabel: string;
  detectedFamily: string;
  reason: string;
  reviewReasonCode: string;
  groupKey: string;
  evidence: string[];
  negativeEvidence: string[];
  candidateGap: number | null;
  neighborTarget: string;
  neighborShare: number;
  neighborExamples: string[];
}

interface ReplayResult {
  result: CategorizationResult;
  neighbor: NeighborSummary;
}

interface GroupRow {
  id: string;
  label: string;
  count: number;
  categorySlug: string;
  subcategorySlug: string;
  confidence: number;
  homogeneity: number;
  reviewSampleSize: number;
  riskFlags: string[];
  examples: string[];
  outliers: string[];
}

async function loadActiveVersion() {
  const [row] = await sql<ActiveVersionRow[]>`
    select id, source_file_name, total_rows, parsed_rows, added_count, updated_count,
      review_count, error_count, published_at, created_at
    from catalog_versions
    where status = 'active'
    order by published_at desc nulls last, created_at desc
    limit 1
  `;
  if (!row) {
    throw new Error("No local active catalog version found. Load a local/offline snapshot first.");
  }
  return row;
}

async function loadImportBatchSummary() {
  return sql<{
    id: string;
    source_file_name: string;
    status: string;
    created_at: Date;
    analyzed_at: Date | null;
    published_at: Date | null;
    total_rows: number | null;
    parsed_rows: number | null;
    review_rows: number | null;
    added_count: number | null;
    updated_count: number | null;
  }[]>`
    select import_batches.id, import_batches.source_file_name, import_batches.status,
      import_batches.created_at, import_batches.analyzed_at, import_batches.published_at,
      (import_batches.report->>'totalRows')::int as total_rows,
      (import_batches.report->>'parsedRows')::int as parsed_rows,
      (import_batches.report->>'reviewRows')::int as review_rows,
      (import_batches.report->>'addedCount')::int as added_count,
      (import_batches.report->>'updatedCount')::int as updated_count
    from import_batches
    order by import_batches.created_at desc
    limit 8
  `;
}

async function loadCategorizationContext(): Promise<CategorizationContext> {
  const ruleRows = await sql<DbRuleRow[]>`
    select categorization_rules.id, categorization_rules.pattern,
      categorization_rules.match_type, categorization_rules.priority,
      categories.id as category_id, categories.slug as category_slug, categories.name as category_name,
      subcategories.id as subcategory_id, subcategories.slug as subcategory_slug, subcategories.name as subcategory_name,
      categorization_rules.created_by
    from categorization_rules
      inner join categories on categories.id = categorization_rules.category_id
      inner join subcategories on subcategories.id = categorization_rules.subcategory_id
    where categorization_rules.is_active = true
      and categories.is_active = true
      and subcategories.is_active = true
    order by categorization_rules.priority asc
  `;
  const rules: CategorizationRuleRecord[] = ruleRows
    .filter((row) => isPublicTaxonomyTarget(row.category_slug, row.subcategory_slug))
    .map((row) => ({
      id: row.id,
      pattern: row.pattern,
      matchType: row.match_type,
      priority: row.priority,
      categoryId: row.category_id,
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      subcategoryId: row.subcategory_id,
      subcategorySlug: row.subcategory_slug,
      subcategoryName: row.subcategory_name,
      createdBy: row.created_by
    }));

  const fallbackRows = await sql<DbTargetRow[]>`
    select categories.id as category_id, categories.slug as category_slug, categories.name as category_name,
      subcategories.id as subcategory_id, subcategories.slug as subcategory_slug, subcategories.name as subcategory_name
    from subcategories
      inner join categories on categories.id = subcategories.category_id
    where categories.is_active = true
      and subcategories.is_active = true
    order by categories.sort_order asc, subcategories.sort_order asc
  `;
  const fallbackByCategorySlug = new Map<string, CategorizationTarget>();
  const targetBySlug = new Map<string, CategorizationTarget>();
  for (const row of fallbackRows) {
    if (
      !isPublicCategorySlug(row.category_slug) ||
      !isPublicTaxonomyTarget(row.category_slug, row.subcategory_slug)
    ) {
      continue;
    }

    const target = {
      categoryId: row.category_id,
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      subcategoryId: row.subcategory_id,
      subcategorySlug: row.subcategory_slug,
      subcategoryName: row.subcategory_name
    };
    targetBySlug.set(`${row.category_slug}/${row.subcategory_slug}`, target);

    if (!fallbackByCategorySlug.has(row.category_slug)) {
      fallbackByCategorySlug.set(row.category_slug, target);
    }
  }

  const ruleKeys = new Set(
    rules.map((rule) =>
      [rule.pattern, rule.matchType, rule.categorySlug, rule.subcategorySlug].join("|")
    )
  );
  for (const rule of defaultCategorizationRules) {
    if (!isPublicTaxonomyTarget(rule.categorySlug, rule.subcategorySlug)) {
      continue;
    }

    const target = targetBySlug.get(`${rule.categorySlug}/${rule.subcategorySlug}`);
    const key = [rule.pattern, rule.matchType, rule.categorySlug, rule.subcategorySlug].join("|");
    if (!target || ruleKeys.has(key)) {
      continue;
    }

    rules.push({
      pattern: rule.pattern,
      matchType: rule.matchType,
      priority: rule.priority,
      categoryId: target.categoryId,
      categorySlug: target.categorySlug,
      categoryName: target.categoryName,
      subcategoryId: target.subcategoryId,
      subcategorySlug: target.subcategorySlug,
      subcategoryName: target.subcategoryName
    });
    ruleKeys.add(key);
  }
  rules.sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);

  return { rules, fallbackByCategorySlug };
}

async function loadActiveProducts(): Promise<ActiveProduct[]> {
  const activeVersion = await loadActiveVersion();
  const rows = await sql<{
    id: string;
    shop_code: string;
    raw_name: string;
    name: string;
    price: string;
    category_id: string | null;
    category_slug: string | null;
    category_name: string | null;
    subcategory_id: string | null;
    subcategory_slug: string | null;
    subcategory_name: string | null;
    status: string;
  }[]>`
    select products.id, products.shop_code, products.raw_name, products.name, products.price::text,
      products.category_id, categories.slug as category_slug, categories.name as category_name,
      products.subcategory_id, subcategories.slug as subcategory_slug, subcategories.name as subcategory_name,
      products.status
    from products
      left join categories on categories.id = products.category_id
      left join subcategories on subcategories.id = products.subcategory_id
    where products.catalog_version_id = ${activeVersion.id}
      and products.status = 'active'
  `;

  return rows
    .filter((row) => isPublicTaxonomyTarget(row.category_slug, row.subcategory_slug))
    .map((row) => {
      const normalized = normalizeProductName(`${row.shop_code} ${row.name}`);
      const tokens = tokenizeForSimilarity(`${row.shop_code} ${row.name}`);
      return {
        id: row.id,
        shopCode: row.shop_code,
        rawName: row.raw_name,
        name: row.name,
        price: Number(row.price),
        categoryId: row.category_id,
        categorySlug: row.category_slug,
        categoryName: row.category_name,
        subcategoryId: row.subcategory_id,
        subcategorySlug: row.subcategory_slug,
        subcategoryName: row.subcategory_name,
        status: row.status,
        targetKey: `${row.category_slug}/${row.subcategory_slug}`,
        normalized,
        tokens,
        tokenSet: new Set(tokens)
      };
    });
}

function selectScenarioRows(rows: AnalyzedImportRow[], activeByCode: Map<string, ActiveProduct>) {
  const ordered = importLimit ? rows.slice(0, importLimit) : rows;
  if (!targetExisting && !targetNew) {
    return ordered;
  }

  const selected: AnalyzedImportRow[] = [];
  let existingCount = 0;
  let newCount = 0;
  for (const row of ordered) {
    const isExisting = Boolean(row.shopCode && activeByCode.has(row.shopCode));
    if (isExisting) {
      if (targetExisting && existingCount >= targetExisting) {
        continue;
      }
      existingCount += 1;
      selected.push(row);
      continue;
    }

    if (targetNew && newCount >= targetNew) {
      continue;
    }
    newCount += 1;
    selected.push(row);
  }
  return selected;
}

function buildActiveIndex(products: ActiveProduct[]): ActiveIndex {
  const byToken = new Map<string, ActiveProduct[]>();
  for (const product of products) {
    for (const token of product.tokens) {
      const current = byToken.get(token) ?? [];
      current.push(product);
      byToken.set(token, current);
    }
  }
  return { products, byToken };
}

function categorizeImportRow(
  row: AnalyzedImportRow,
  context: CategorizationContext,
  activeIndex: ActiveIndex,
  existingProduct: ActiveProduct | null
): ReplayResult {
  const initialResult = categorizeProductName(buildTitle(row), context, {
    existingProduct
  });
  const neighbor = findSimilarExistingProductTarget(row, activeIndex, existingProduct?.shopCode ?? null);

  if (
    initialResult.source === "existing_product_category" ||
    (initialResult.target && initialResult.confidence >= AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD)
  ) {
    return { result: initialResult, neighbor };
  }

  if (neighbor.target && neighbor.share >= 0.75) {
    const autoAcceptNeighbor = shouldAutoAcceptNeighbor(row, neighbor);
    return {
      result: {
        target: neighbor.target,
        matchedRule: initialResult.matchedRule,
        confidence: Math.min(0.94, 0.89 + neighbor.share * 0.06),
        source: "similarity",
        reason: "Категория предложена по однородным похожим товарам активного каталога.",
        matchedSignals: [
          { kind: "neighbor", value: `active-neighbor:${Math.round(neighbor.share * 100)}%` },
          ...neighbor.evidence.slice(0, 4).map((value) => ({ kind: "token" as const, value }))
        ],
        negativeSignals: [],
        needsReview: !autoAcceptNeighbor,
        reviewReason: autoAcceptNeighbor ? null : "Похожая группа требует быстрого подтверждения.",
        decisionStatus: autoAcceptNeighbor ? "AUTO_READY" : "GROUP_REVIEW",
        familyId: "active_neighbor",
        familyLabel: "Похожие активные товары",
        candidates: initialResult.candidates,
        confidenceModelVersion: CATEGORIZATION_PIPELINE_VERSION,
        reviewReasonCode: autoAcceptNeighbor ? null : "neighbor_group_confirmation"
      },
      neighbor
    };
  }

  return { result: initialResult, neighbor };
}

const ambiguousNeighborFamilies = new Set([
  "bolts",
  "nuts",
  "washers",
  "screws",
  "studs",
  "fittings",
  "rings",
  "clamps",
  "bushings",
  "hoses",
  "caps_plugs",
  "pins"
]);

function shouldAutoAcceptNeighbor(row: AnalyzedImportRow, neighbor: NeighborSummary) {
  if (neighbor.share < 0.88) {
    return false;
  }
  const detectedFamily = detectFamily(normalizeProductName(buildTitle(row)));
  return !ambiguousNeighborFamilies.has(detectedFamily);
}

function findSimilarExistingProductTarget(
  row: Pick<AnalyzedImportRow, "shopCode" | "name" | "rawName">,
  activeIndex: ActiveIndex,
  excludeShopCode: string | null
): NeighborSummary {
  const rowTokens = tokenizeForSimilarity(buildTitle(row));
  if (rowTokens.length < 2) {
    return { target: null, share: 0, evidence: [], examples: [] };
  }

  const candidateSet = new Set<ActiveProduct>();
  for (const token of rowTokens) {
    for (const product of activeIndex.byToken.get(token) ?? []) {
      if (product.shopCode !== excludeShopCode) {
        candidateSet.add(product);
      }
    }
  }

  const rowTokenSet = new Set(rowTokens);
  const targetGroups = new Map<
    string,
    { target: CategorizationTarget; count: number; scoreSum: number; signals: Map<string, number>; examples: string[] }
  >();
  let accepted = 0;

  for (const product of candidateSet) {
    const sharedTokens = rowTokens.filter((token) => product.tokenSet.has(token));
    const unionSize = new Set([...rowTokens, ...product.tokens]).size;
    const score = sharedTokens.length / Math.max(unionSize, 1);
    if (sharedTokens.length < 2 || score < 0.28) {
      continue;
    }

    accepted += 1;
    const key = product.targetKey;
    const target = {
      categoryId: product.categoryId ?? undefined,
      categorySlug: product.categorySlug!,
      categoryName: product.categoryName ?? undefined,
      subcategoryId: product.subcategoryId ?? undefined,
      subcategorySlug: product.subcategorySlug!,
      subcategoryName: product.subcategoryName ?? undefined
    };
    const group =
      targetGroups.get(key) ?? { target, count: 0, scoreSum: 0, signals: new Map<string, number>(), examples: [] };
    group.count += 1;
    group.scoreSum += score;
    for (const token of sharedTokens) {
      group.signals.set(token, (group.signals.get(token) ?? 0) + 1);
    }
    if (group.examples.length < 5) {
      group.examples.push(`${product.shopCode} ${product.name}`);
    }
    targetGroups.set(key, group);
  }

  const [best, second] = [...targetGroups.values()].sort(
    (a, b) => b.count - a.count || b.scoreSum / b.count - a.scoreSum / a.count
  );
  if (!best || accepted < 3) {
    return { target: null, share: 0, evidence: [], examples: [] };
  }

  const share = best.count / accepted;
  const enoughSeparation = !second || second.count < best.count * 0.4;
  if (best.count < 3 || share < 0.75 || !enoughSeparation) {
    return { target: null, share, evidence: [], examples: best.examples };
  }

  const evidence = [...best.signals.entries()]
    .filter(([token]) => rowTokenSet.has(token))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .map(([token]) => token);

  return { target: best.target, share, evidence, examples: best.examples };
}

function toDecision(row: AnalyzedImportRow, replay: ReplayResult, scope: DecisionScope): DecisionRow {
  const result = replay.result;
  const status = resolveDecisionStatus(row, result);
  const familyId = result.familyId ?? result.matchedRule?.pattern ?? result.source;
  const categorySlug = result.target?.categorySlug ?? "";
  const subcategorySlug = result.target?.subcategorySlug ?? "";
  const evidence = result.matchedSignals.map((signal) => `${signal.kind}:${signal.value}`);
  const groupSignal = groupSignalFor(result.matchedSignals, replay.neighbor.evidence);
  const detectedFamily = detectFamily(normalizeProductName(buildTitle(row)));
  const groupShard = normalizeGroupShard(groupSignal || detectedFamily);
  const firstCandidate = result.candidates?.[0];
  const secondCandidate = result.candidates?.find(
    (candidate) =>
      !firstCandidate ||
      candidate.categorySlug !== firstCandidate.categorySlug ||
      candidate.subcategorySlug !== firstCandidate.subcategorySlug
  );

  return {
    rowNumber: row.rowNumber,
    scope,
    shopCode: row.shopCode ?? "",
    name: row.name || row.rawName,
    price: row.price,
    status,
    categorySlug,
    subcategorySlug,
    confidence: round(result.confidence),
    source: result.source,
    familyId,
    familyLabel: result.familyLabel ?? String(familyId),
    detectedFamily,
    reason: result.reason,
    reviewReasonCode: result.reviewReasonCode ?? reviewReasonFor(row, result, replay.neighbor),
    groupKey: [familyId, detectedFamily, groupShard, categorySlug, subcategorySlug].filter(Boolean).join("|") || "manual",
    evidence,
    negativeEvidence: (result.negativeSignals ?? []).map((signal) => `${signal.kind}:${signal.value}`),
    candidateGap:
      firstCandidate && secondCandidate ? round(firstCandidate.score - secondCandidate.score) : null,
    neighborTarget: replay.neighbor.target
      ? `${replay.neighbor.target.categorySlug}/${replay.neighbor.target.subcategorySlug}`
      : "",
    neighborShare: round(replay.neighbor.share),
    neighborExamples: replay.neighbor.examples
  };
}

function resolveDecisionStatus(row: AnalyzedImportRow, result: CategorizationResult): CategorizationDecisionStatus {
  if (result.decisionStatus) {
    return result.decisionStatus;
  }
  if (row.status === "error" || row.status === "skipped") {
    return "INVALID_INPUT";
  }
  if (result.source === "existing_product_category") {
    return "AUTO_READY";
  }
  if (!result.target) {
    return "MANUAL_REVIEW";
  }
  if (!result.needsReview && result.confidence >= AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD) {
    return "AUTO_READY";
  }
  if (result.confidence >= MEDIUM_CATEGORIZATION_CONFIDENCE_THRESHOLD) {
    return "GROUP_REVIEW";
  }
  return "MANUAL_REVIEW";
}

function reviewReasonFor(row: AnalyzedImportRow, result: CategorizationResult, neighbor: NeighborSummary) {
  if (row.issues.length > 0) return row.issues[0]!.code;
  if (!result.target) {
    return neighbor.examples.length > 0 ? "mixed_or_weak_active_neighbors" : "no_candidate";
  }
  if ((result.negativeSignals ?? []).length > 0) return "negative_evidence";
  if (result.candidates && result.candidates.length > 1) return "close_candidates_or_weak_gap";
  if (neighbor.target && neighbor.share < 0.88) return "neighbor_group_confirmation";
  return result.source || "weak_candidate";
}

function groupSignalFor(signals: CategorizationSignal[], neighborEvidence: string[]) {
  const preferred =
    signals.find((signal) => signal.kind === "phrase") ??
    signals.find((signal) => signal.kind === "technical") ??
    signals.find((signal) => signal.kind === "neighbor") ??
    signals.find((signal) => signal.kind === "token" && !isBroadGroupingToken(signal.value)) ??
    signals.find((signal) => signal.kind === "pattern");
  if (preferred) return preferred.value;
  return neighborEvidence.find((token) => !isBroadGroupingToken(token)) ?? neighborEvidence[0] ?? "";
}

function buildGroups(decisions: DecisionRow[]): GroupRow[] {
  const grouped = new Map<string, DecisionRow[]>();
  for (const decision of decisions.filter((item) => item.status === "GROUP_REVIEW")) {
    const current = grouped.get(decision.groupKey) ?? [];
    current.push(decision);
    grouped.set(decision.groupKey, current);
  }

  return [...grouped.entries()]
    .map(([id, rows]) => {
      const first = rows[0]!;
      const averageConfidence = rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length;
      const riskFlags = groupRiskFlags(rows);
      return {
        id,
        label: first.familyLabel,
        count: rows.length,
        categorySlug: first.categorySlug,
        subcategorySlug: first.subcategorySlug,
        confidence: round(averageConfidence),
        homogeneity: round(estimateHomogeneity(rows)),
        reviewSampleSize: sampleSizeForGroup(rows.length),
        riskFlags,
        examples: representativeExamples(rows, 8),
        outliers: outlierExamples(rows, 8)
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"));
}

function groupRiskFlags(rows: DecisionRow[]) {
  const flags = new Set<string>();
  const first = rows[0]!;
  const evidenceTokens = rows.flatMap((row) => row.evidence.map((item) => item.split(":").slice(1).join(":")));
  const distinctFamilies = new Set(rows.map((row) => row.detectedFamily)).size;
  const neighborTargets = new Set(rows.map((row) => row.neighborTarget).filter(Boolean));
  const categoryTargets = new Set(rows.map((row) => `${row.categorySlug}/${row.subcategorySlug}`));
  const sharedBroad = evidenceTokens.some(isBroadGroupingToken);
  if (rows.length > 100) flags.add("large_group");
  if (rows.length > 300) flags.add("very_large_group_requires_split");
  if (estimateHomogeneity(rows) < 0.85) flags.add("low_homogeneity");
  if (distinctFamilies > 3) flags.add("mixed_detected_families");
  if (neighborTargets.size > 1) flags.add("mixed_active_neighbor_targets");
  if (categoryTargets.size > 1) flags.add("mixed_proposed_targets");
  if (sharedBroad && first.evidence.length < 3) flags.add("broad_single_signal");
  if (rows.some((row) => row.negativeEvidence.length > 0)) flags.add("negative_evidence_present");
  if (rows.some((row) => row.candidateGap !== null && row.candidateGap < 0.04)) flags.add("near_threshold_or_close_candidate");
  return [...flags];
}

function estimateHomogeneity(rows: DecisionRow[]) {
  if (rows.length === 0) return 0;
  const targetPurity = largestShare(rows, (row) => `${row.categorySlug}/${row.subcategorySlug}`);
  const familyPurity = largestShare(rows, (row) => row.detectedFamily);
  const neighborPurity = largestShare(rows.filter((row) => row.neighborTarget), (row) => row.neighborTarget);
  const evidencePurity = largestShare(rows, (row) => row.groupKey);
  const parts = [targetPurity, familyPurity, evidencePurity];
  if (neighborPurity > 0) parts.push(neighborPurity);
  return parts.reduce((sum, value) => sum + value, 0) / parts.length;
}

function largestShare<T>(items: T[], keyFn: (item: T) => string) {
  if (items.length === 0) return 0;
  return (countBy(items, keyFn)[0]?.count ?? 0) / items.length;
}

function representativeExamples(rows: DecisionRow[], limit: number) {
  const byConfidence = [...rows].sort((a, b) => b.confidence - a.confidence || a.rowNumber - b.rowNumber);
  const lowConfidence = [...rows].sort((a, b) => a.confidence - b.confidence || a.rowNumber - b.rowNumber);
  const mixed = new Map<string, string>();
  for (const row of [...byConfidence.slice(0, limit), ...lowConfidence.slice(0, limit), ...rows]) {
    mixed.set(row.shopCode, `${row.shopCode} ${row.name}`);
    if (mixed.size >= limit) break;
  }
  return [...mixed.values()];
}

function outlierExamples(rows: DecisionRow[], limit: number) {
  const commonFamily = countBy(rows, (row) => row.detectedFamily)[0]?.key;
  const commonNeighbor = countBy(rows.filter((row) => row.neighborTarget), (row) => row.neighborTarget)[0]?.key;
  return rows
    .filter(
      (row) =>
        (commonFamily && row.detectedFamily !== commonFamily) ||
        (commonNeighbor && row.neighborTarget && row.neighborTarget !== commonNeighbor) ||
        row.negativeEvidence.length > 0 ||
        (row.candidateGap !== null && row.candidateGap < 0.04)
    )
    .slice(0, limit)
    .map((row) => `${row.shopCode} ${row.name}`);
}

function buildFamilyDistribution(decisions: DecisionRow[]) {
  return countBy(decisions, (decision) => `${decision.detectedFamily}|${decision.status}`).map((item) => {
    const [family, status] = item.key.split("|");
    const examples = decisions
      .filter((decision) => `${decision.detectedFamily}|${decision.status}` === item.key)
      .slice(0, 5);
    const first = examples[0];
    return {
      family,
      status,
      count: item.count,
      target: [first?.categorySlug, first?.subcategorySlug].filter(Boolean).join("/"),
      examples: examples.map((decision) => `${decision.shopCode} ${decision.name}`)
    };
  });
}

function buildActiveAnalogPareto(residual: DecisionRow[], activeIndex: ActiveIndex) {
  const residualFamilies = countBy(residual, (decision) => decision.detectedFamily);
  return residualFamilies.map((item) => {
    const definition = productFamilyDefinitions.find((family) => family.id === item.key);
    const activeMatches = definition
      ? activeIndex.products.filter((product) => definition.terms.some((term) => hasNormalizedToken(product.normalized, term)))
      : [];
    return {
      family: item.key,
      residualCount: item.count,
      activeAnalogCount: activeMatches.length,
      topActiveTargets: countBy(activeMatches, (product) => product.targetKey).slice(0, 8),
      residualExamples: residual
        .filter((decision) => decision.detectedFamily === item.key)
        .slice(0, 8)
        .map((decision) => `${decision.shopCode} ${decision.name}`)
    };
  });
}

function buildShadowPrecision(activeProducts: ActiveProduct[], context: CategorizationContext) {
  const rows = activeProducts.map((product) => {
    const result = categorizeProductName(`${product.shopCode} ${product.name}`, context);
    const status = resolveDecisionStatus(
      {
        rowNumber: 0,
        rowIndex: 0,
        sheetName: "",
        rawName: product.rawName,
        stockQuantity: null,
        price: product.price,
        stockSum: null,
        shopCode: product.shopCode,
        name: product.name,
        status: "valid",
        issues: []
      },
      result
    );
    const predictedTarget = result.target
      ? `${result.target.categorySlug}/${result.target.subcategorySlug}`
      : "";
    const actualTarget = product.targetKey;
    return {
      shopCode: product.shopCode,
      name: product.name,
      status,
      confidence: result.confidence,
      source: result.source,
      predictedTarget,
      actualTarget,
      correct: predictedTarget === actualTarget,
      family: result.familyLabel ?? result.familyId ?? result.source
    };
  });
  const evaluated = rows.filter((row) => row.predictedTarget);
  const summary = {
    note:
      "Active-label shadow evaluation only. Existing catalog labels are treated as local reference data; this is not a human precision audit.",
    totalActiveProducts: activeProducts.length,
    evaluatedWithTarget: evaluated.length,
    autoReady: summarizeShadow(rows.filter((row) => row.status === "AUTO_READY")),
    groupReview: summarizeShadow(rows.filter((row) => row.status === "GROUP_REVIEW")),
    bySource: countBy(rows, (row) => `${row.source}|${row.status}`).slice(0, 30),
    topErrors: rows
      .filter((row) => row.predictedTarget && !row.correct)
      .slice(0, 80)
      .map((row) => ({
        shopCode: row.shopCode,
        name: row.name,
        status: row.status,
        confidence: row.confidence,
        predictedTarget: row.predictedTarget,
        actualTarget: row.actualTarget,
        source: row.source,
        family: row.family
      }))
  };
  return { rows, summary };
}

function summarizeShadow(rows: Array<{ correct: boolean; predictedTarget: string }>) {
  const evaluated = rows.filter((row) => row.predictedTarget);
  const correct = evaluated.filter((row) => row.correct).length;
  return {
    evaluated: evaluated.length,
    correct,
    precision: evaluated.length > 0 ? round(correct / evaluated.length) : 0
  };
}

function buildConfidenceCalibration(
  rows: Array<{ status: CategorizationDecisionStatus; confidence: number; predictedTarget: string; correct: boolean }>
) {
  const bands = [
    ["0.95-1.00", 0.95, 1],
    ["0.90-0.95", 0.9, 0.95],
    ["0.80-0.90", 0.8, 0.9],
    ["0.70-0.80", 0.7, 0.8],
    ["below-0.70", 0, 0.7]
  ] as const;
  const statuses: CategorizationDecisionStatus[] = ["AUTO_READY", "GROUP_REVIEW", "MANUAL_REVIEW", "BLOCKED_CONFLICT"];
  return statuses.flatMap((status) =>
    bands.map(([label, min, max]) => {
      const bandRows = rows.filter(
        (row) =>
          row.status === status &&
          row.predictedTarget &&
          (label === "0.95-1.00"
            ? row.confidence >= min && row.confidence <= max
            : row.confidence >= min && row.confidence < max)
      );
      const correct = bandRows.filter((row) => row.correct).length;
      return [
        status,
        label,
        bandRows.length,
        correct,
        bandRows.length > 0 ? ratio(correct, bandRows.length) : "",
        "Active-label shadow; not a human audit."
      ];
    })
  );
}

interface ResidualDefinition {
  id: string;
  label: string;
  terms?: string[];
  phrases?: string[];
  activeTerms?: string[];
  reason: string;
  limitReason: string;
}

const residualDefinitions: ResidualDefinition[] = [
  {
    id: "socket_head_fasteners_no_public_target",
    label: "DIN/socket-head fasteners without public target",
    terms: ["din912", "шестигранник", "шестигранником", "гровер", "самоконтр"],
    reason: "no_allowed_target_current_taxonomy",
    limitReason: "Крепёж как самостоятельная категория запрещён, а назначения узла в названии нет."
  },
  {
    id: "repair_kits_without_system",
    label: "Repair kits without destination system",
    terms: ["ремкомплект", "ремонтный"],
    phrases: ["рем. к-т", "рем.к-т", "ремонтный сб", "фланцев ремонтный"],
    reason: "name_lacks_destination_context",
    limitReason: "Ремкомплект/ремонтный набор без узла ремонта не указывает безопасную публичную подкатегорию."
  },
  {
    id: "engine_transmission_partial_context",
    label: "Engine/transmission parts with partial context",
    terms: [
      "поддон",
      "картер",
      "коробк",
      "кпп",
      "синхронизатор",
      "маховик",
      "шатун",
      "вкладыш",
      "гидрокомпенсатор",
      "цепь",
      "натяжитель",
      "поршн",
      "поршнев",
      "вал",
      "вала"
    ],
    phrases: [
      "вторичного вала",
      "цепь моторная",
      "натяжитель ремня",
      "ремня приводного",
      "коробки москвич",
      "поддон картера"
    ],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Есть моторный или трансмиссионный намёк, но оставшиеся названия не дают устойчивого назначения без дополнительных правил и ручной проверки активных аналогов."
  },
  {
    id: "suspension_steering_partial_context",
    label: "Suspension/steering parts with partial context",
    terms: ["стойк", "отбойник", "тяга", "рул", "руля", "сошка", "маятник", "растяжк", "стабилизатор"],
    phrases: ["кронштейн руля", "стойки стабилизатора", "стоек стабилизатора", "тяга рулевая"],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Подвеска/рулевое направление видно, но конкретная подкатегория часто конфликтует между стойками, наконечниками, рычагами и прочими деталями."
  },
  {
    id: "line_mounts_without_system",
    label: "Tube/line mounts without system",
    terms: ["гусек", "гребенка"],
    phrases: ["крепление трубок", "трубок гребенка", "гребенка трубок"],
    reason: "name_lacks_destination_context",
    limitReason: "Есть трубки или крепление магистралей, но без тормозного/топливного/охлаждающего назначения target остаётся неоднозначным."
  },
  {
    id: "wheel_tire_accessories_partial_context",
    label: "Wheel/tire accessories with partial context",
    terms: ["колес", "дисков", "колпак", "колпачк", "проставка"],
    phrases: ["колпачки дисков", "колпачок дисков", "проставка колес", "мешки колес", "мешок колес"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Колёсный контекст есть, но остаток смешивает декоративные колпачки, проставки, упаковку/чехлы и крепёж дисков."
  },
  {
    id: "body_interior_unmapped",
    label: "Body/interior fragments without stable target",
    terms: [
      "торпед",
      "бардач",
      "радиобокс",
      "воздухозаборник",
      "воздухоприток",
      "воздухоотвод",
      "салазк",
      "сидень",
      "обшивк",
      "полк",
      "люк",
      "бокс",
      "тоннел",
      "поручень",
      "педал",
      "прибор"
    ],
    phrases: [
      "вещевого ящика",
      "опора полки",
      "задней обшивки",
      "накладки сидений",
      "подогрев-сидушка",
      "салазки сиденья"
    ],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Кузовной/салонный контекст есть, но текущая таксономия и активные аналоги не дают единой подкатегории для всех вариантов."
  },
  {
    id: "optics_glass_partial_context",
    label: "Optics/glass parts with partial context",
    terms: ["блок-фар", "блокфар", "оптика", "фара", "фары", "фар", "огней", "поворота", "повторител", "светомаскировк"],
    phrases: ["ходовых огней", "ближ дальн", "ближ./дальн", "стекло поворота", "стекло повторителя", "крепления фар"],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Оптика/стекло видны, но остаток смешивает фары, поворотники, крепёж, стекла и комплекты без единого safe target."
  },
  {
    id: "body_locks_handles_glass_partial",
    label: "Body locks/handles/glass mechanisms with partial context",
    terms: [
      "замок",
      "замки",
      "запор",
      "ручки",
      "ручка",
      "форточк",
      "стекл",
      "лючок",
      "подкладк",
      "направляющ",
      "облицовк",
      "поперечин",
      "механизм"
    ],
    phrases: ["ручки 2106", "упор стекла", "замок внутренний", "запорный механизм", "лючок б/бака"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Кузовной механизм есть, но текущие названия не всегда отделяют замки, ручки, стекло, лючки и декоративные элементы."
  },
  {
    id: "body_exterior_decor_partial_context",
    label: "Exterior/decor body items with partial context",
    terms: ["арка", "арки", "водосток", "ресничк", "бака", "бак", "молдинг", "расширител", "крыл", "закат"],
    phrases: ["арки колес", "лючок бака", "накладки ручек", "расширитель арок"],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Позиции похожи на кузовной декор или наружные детали, но часть названий не отделяет декор от кузовных деталей."
  },
  {
    id: "driveline_axle_differential_partial",
    label: "Driveline/axle/differential parts with partial context",
    terms: [
      "дифференциал",
      "сателлит",
      "саттелит",
      "промвал",
      "чулок",
      "мост",
      "моста",
      "торсион",
      "шарнир",
      "полуось",
      "ось",
      "эксцентрик"
    ],
    phrases: ["глав. пара", "главная пара", "делителя передач", "ось педали", "ось сателлитов"],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Трансмиссионный/мостовой контекст есть, но target расходится между КПП, трансмиссией, ступицами и подвеской."
  },
  {
    id: "mounting_installation_kits_without_target",
    label: "Mounting/installation kits without destination target",
    terms: ["крепл", "крепления", "установочный", "установочная", "установочн", "секретки", "стяжк", "шплинт", "масленк", "штифт", "шток", "прижим"],
    phrases: ["набор крепл", "к-т установочный", "крепление передней балки", "крепления воздушного фланца"],
    reason: "name_lacks_destination_context",
    limitReason: "Монтажный набор или фиксатор есть, но без устойчивого узла автомобиля нельзя выбрать категорию."
  },
  {
    id: "chassis_mounts_supports_partial",
    label: "Chassis mounts/supports with partial context",
    terms: ["стойк", "стоек", "чашк", "подушка", "подушки", "подвесной", "балк", "балки", "демпфер", "упор"],
    phrases: ["передних стоек", "зад. балки", "задней балки", "чашка перед", "чашка зад"],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Контекст стойки/балки/подушки есть, но остаток смешивает подвеску, кузов, двигатель и универсальные упоры."
  },
  {
    id: "car_care_consumables_unmapped",
    label: "Car-care consumables without stable target",
    terms: ["вакс", "аппликатор", "полировк", "полироль", "ткань", "наждачн", "антисептик", "аэрозоль", "салфетк"],
    phrases: ["доктор вакс", "наждачная бумага", "паста притирочная"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Расходники ухода/полировки есть, но текущие активные аналоги расходятся между автохимией, инструментами и прочими аксессуарами."
  },
  {
    id: "diagnostic_driver_electronics_unmapped",
    label: "Driver electronics and diagnostics without stable target",
    terms: [
      "рация",
      "пзу",
      "сканер",
      "мультитестер",
      "тестер",
      "модулятор",
      "gsm",
      "стробоскоп",
      "манометр",
      "инвертор",
      "антирадар"
    ],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Электроника и диагностические приборы в остатке пересекаются между приборами водителя, инструментами и прочей электрикой."
  },
  {
    id: "lighting_signal_unmapped",
    label: "Lighting/signal devices without stable target",
    terms: ["прожектор", "маячок", "сигнал", "габарит", "стробоскоп", "фонар"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Световой или сигнальный прибор виден, но без подтверждения автомобильной установки и target-подкатегории перевод небезопасен."
  },
  {
    id: "fans_thermal_ventilation_unmapped",
    label: "Fans and thermal/ventilation parts without stable target",
    terms: ["вентилятор", "электровентилятор", "крыльчатк", "воздуховод", "дефлектор"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Вентиляторы и воздуховоды встречаются в охлаждении, отопителе, салоне и универсальных аксессуарах; без назначения target конфликтует."
  },
  {
    id: "audio_radio_media_accessories",
    label: "Audio/radio/media accessories without stable target",
    terms: ["радио", "флешка", "магнитол", "динамик", "антенн", "сабвуфер", "савбуфер"],
    phrases: ["радио+флешка"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Аудио и медиа-аксессуары пересекаются между автоэлектроникой, прочей электрикой и универсальными товарами."
  },
  {
    id: "safety_reflective_emergency_unmapped",
    label: "Safety/reflective/emergency goods without stable target",
    terms: ["светоотраж", "браслет", "жилет", "аптечк", "огнетуш", "знак", "аварийный"],
    reason: "no_allowed_target_current_taxonomy",
    limitReason: "Товары безопасности видны, но часть остатка не имеет устойчивой подкатегории или автомобильного назначения в текущей таксономии."
  },
  {
    id: "tools_road_equipment_unmapped",
    label: "Tools and road equipment without stable target",
    terms: ["нож", "лопата", "струна", "ключ", "съемник", "съёмник", "сверло", "вороток", "насадка"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Инструментальные позиции могут быть аксессуарами или специнструментом под узел автомобиля; без устойчивого назначения автоперевод небезопасен."
  },
  {
    id: "starter_ignition_electrical_partial",
    label: "Starter/ignition electrical parts with partial context",
    terms: ["бендикс", "втягивающ", "трамблер", "трамблёр", "контакты", "катушк", "щеткодержател"],
    phrases: ["щиток приборов"],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Электрический узел виден, но в остатке смешаны стартер, зажигание, приборка и мелкие компоненты."
  },
  {
    id: "fluids_adhesives_chemical_unmapped",
    label: "Fluids/adhesives/chemicals without stable target",
    terms: ["герметик", "смазк", "клей", "мастик", "антикор", "очистител", "присадк"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Химия и клеевые материалы распределяются между автохимией, жидкостями, смазками и прочими аксессуарами."
  },
  {
    id: "comfort_cabin_universal_accessories",
    label: "Cabin comfort/universal accessories without stable target",
    terms: ["часы", "держател", "пепельниц", "шторк", "коврик", "ковр", "подлокотник"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Салонные универсальные аксессуары в остатке не всегда отделяются от кузовных/салонных деталей и бытовых товаров."
  },
  {
    id: "cleaning_wiper_unmapped",
    label: "Cleaning/wiper accessories without stable target",
    terms: ["щетка", "щётка", "скребок", "водосгон", "омывател", "очиститель"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Очистка/стеклоочистители частично автоматизированы, но оставшиеся названия смешивают расходники, аксессуары и детали узла."
  },
  {
    id: "fuel_air_intake_partial",
    label: "Fuel/air intake parts with partial context",
    terms: ["жиклер", "жиклёр", "карбюратор", "дроссел", "ресивер", "фильтроэлемент", "воздухоочистител"],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Есть топливный/воздушный контекст, но оставшиеся позиции требуют отделить систему питания от фильтров, двигателя и универсальных деталей."
  },
  {
    id: "travel_storage_covers_unmapped",
    label: "Travel/storage/covers without stable target",
    terms: ["тент", "сумка", "термокружка", "органайзер", "чехол", "накидка", "кресло", "бескаркасн"],
    phrases: ["покрытие пола", "сумка-холодильник"],
    reason: "no_allowed_target_current_taxonomy",
    limitReason: "Часть товаров является универсальными дорожными/бытовыми аксессуарами без точного target в автомобильной таксономии."
  },
  {
    id: "fragrance_airfresheners_unmapped",
    label: "Fragrance/air-freshener goods without stable target",
    terms: ["автопарфюм", "ароматизатор", "дезодорант"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Ароматизаторы частично похожи на аксессуары/автохимию, но остаток не имеет подтвержденной подкатегории."
  },
  {
    id: "misc_universal_non_catalog_singletons",
    label: "Miscellaneous universal non-catalog goods",
    terms: ["тюнинг", "мышь", "тарелочка", "отпугивател", "грызун", "аудиоколонк", "табличк", "перевозка", "детей"],
    phrases: ["магнитная для мелочей", "отпугиватель грызунов", "перевозка детей"],
    reason: "no_allowed_target_current_taxonomy",
    limitReason: "Единичные универсальные товары не являются автозапчастями или не имеют точного публичного target в текущей таксономии."
  },
  {
    id: "consumer_power_phone_accessories",
    label: "Consumer phone/power accessories",
    terms: ["iphone", "samsung", "зарядка", "зарядное", "пауэрбанк", "батарейки", "eplutus"],
    phrases: ["карта памяти", "power bank", "пауэр банк"],
    reason: "no_allowed_target_current_taxonomy",
    limitReason: "Потребительская электроника и телефонные аксессуары не имеют подтверждённого автомобильного target."
  },
  {
    id: "novelty_souvenir_non_catalog",
    label: "Novelty/souvenir non-catalog goods",
    terms: ["обезьяна", "хомяк", "поросенок", "рысь", "леопард", "мячик", "вымпел", "игрушка", "корова"],
    phrases: ["рука на присоске", "люблю россию", "подарочный набор"],
    reason: "no_allowed_target_current_taxonomy",
    limitReason: "Сувенирные/игрушечные позиции не являются автозапчастями и не имеют допустимой публичной подкатегории."
  },
  {
    id: "generic_fasteners_without_destination",
    label: "Generic fasteners without destination",
    terms: ["болт", "болты", "гайка", "гайки", "шайба", "шайбы", "винт", "саморез", "шпилька", "шпильки", "хомут", "хомуты"],
    reason: "name_lacks_destination_context",
    limitReason: "Есть только тип крепежа/размер, без узла автомобиля и без единого безопасного target."
  },
  {
    id: "ambiguous_line_fittings",
    label: "Ambiguous fittings and connectors",
    terms: ["штуцер", "щтуцер", "фитинг", "тройник", "соединитель", "переходник", "фурнитура", "быстросъем", "быстросъём", "уголок", "удлинитель"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Похожие соединители в активном каталоге распределены по нескольким системам; без назначения нельзя выбрать подкатегорию."
  },
  {
    id: "caps_plugs_without_destination",
    label: "Caps, covers and plugs without destination",
    terms: ["крышка", "пробка", "заглушка"],
    reason: "name_lacks_destination_context",
    limitReason: "Крышки и заглушки требуют контекст узла: радиатор, поддон, фара, бардачок, КПП и т.п."
  },
  {
    id: "rings_and_seals_without_destination",
    label: "Rings and seals without destination",
    terms: ["кольцо", "кольца", "сальник", "манжета"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Кольца и уплотнения встречаются в двигателе, КПП, ступицах, тормозах и выхлопе."
  },
  {
    id: "body_or_interior_small_parts",
    label: "Small body/interior parts with weak context",
    terms: ["скоба", "кронштейн", "накладка", "планка", "фиксатор", "пистон", "люк", "бокс"],
    reason: "active_analogs_conflict_or_no_destination",
    limitReason: "Малые кузовные/салонные элементы имеют похожие названия, но разные targets и часто недостаточный контекст."
  },
  {
    id: "engine_small_parts_with_partial_context",
    label: "Engine small parts with partial context",
    terms: ["клапан", "клапаны", "клапанов", "втулка", "втулки", "палец", "толкатель", "сапун", "форсунок", "рампа"],
    reason: "potentially_automatable_future_context_rules",
    limitReason: "Часть моторного контекста есть, но оставшиеся позиции требуют дополнительного правила или проверки шума активного каталога."
  },
  {
    id: "hoses_tubes_without_system",
    label: "Hoses and tubes without system",
    terms: ["шланг", "шланги", "трубка", "трубки", "патрубок", "патрубки"],
    reason: "name_lacks_destination_context",
    limitReason: "Шланги/трубки без тормозного, топливного, охлаждающего, ГУР или выхлопного контекста нельзя безопасно развести."
  },
  {
    id: "personal_or_non_catalog_accessories",
    label: "Personal/non-catalog accessories",
    terms: ["перчатки", "бумажник", "кошелек", "кошелёк", "собака", "смайлики", "брелок", "четки", "чётки", "стакан"],
    reason: "no_allowed_target_current_taxonomy",
    limitReason: "Позиции не имеют точного публичного target в текущей автомобильной таксономии."
  },
  {
    id: "electrical_or_consumer_devices_without_auto_context",
    label: "Electrical/consumer devices without auto context",
    terms: ["usb", "флешка", "адаптер", "разветвитель", "тепловентилятор", "плитка"],
    reason: "technical_insufficient_data",
    limitReason: "Электрический товар есть, но автомобильное назначение не подтверждено достаточными признаками."
  },
  {
    id: "vehicle_model_only_or_legacy_part",
    label: "Vehicle-model-only or legacy part without function",
    terms: ["москвич", "2141", "2101", "2103", "2105", "2106", "2107", "2108", "2109", "2110", "2121", "21213", "ока", "камаз", "газель"],
    reason: "name_lacks_destination_context",
    limitReason: "Марка/модель автомобиля помогает совместимости, но без функции детали не выбирает публичную подкатегорию."
  },
  {
    id: "short_or_code_only_names",
    label: "Short/code-only names",
    reason: "technical_insufficient_data",
    limitReason: "Название состоит из кода или слишком короткой фразы, классификационных признаков недостаточно."
  },
  {
    id: "unique_low_frequency_items",
    label: "Unique low-frequency items",
    reason: "unique_singleton_or_no_active_analogs",
    limitReason: "Редкие единичные товары без активных аналогов и без повторяемого паттерна."
  }
];

function buildResidualAnalysis(residual: DecisionRow[], activeIndex: ActiveIndex) {
  const classified = residual.map((decision) => ({
    decision,
    definition: classifyResidualDecision(decision)
  }));
  const total = Math.max(residual.length, 1);
  const reasonRows = countBy(classified, (item) => item.definition.reason).map((item) => {
    const examples = classified
      .filter((current) => current.definition.reason === item.key)
      .slice(0, 8)
      .map((current) => `${current.decision.shopCode} ${current.decision.name}`);
    return {
      reason: item.key,
      count: item.count,
      share: ratio(item.count, total),
      examples
    };
  });

  const familyRows = countBy(classified, (item) => item.definition.id).map((item) => {
    const rows = classified
      .filter((current) => current.definition.id === item.key)
      .map((current) => current.decision);
    const definition = classified.find((current) => current.definition.id === item.key)!.definition;
    const activeMatches = activeMatchesForDefinition(definition, activeIndex);
    const topActiveTargets = countBy(activeMatches, (product) => product.targetKey).slice(0, 8);
    const usefulContext = rows.filter(hasUsefulDestinationContext).length;
    const safeGroup = rows.filter((decision) => decision.neighborTarget && decision.neighborShare >= 0.75).length;
    return {
      family: definition.label,
      familyId: definition.id,
      residualCount: item.count,
      share: ratio(item.count, total),
      reason: definition.reason,
      usefulContext,
      noUsefulContext: item.count - usefulContext,
      topTokens: topTokensForRows(rows, 10),
      activeAnalogs: activeMatches.length,
      topActiveTargets,
      groupPossible: safeGroup,
      autoReadyPossible: 0,
      irreducible: item.count - safeGroup,
      limitReason: definition.limitReason,
      examples: rows.slice(0, 8).map((decision) => `${decision.shopCode} ${decision.name}`)
    };
  });

  const taxonomyLimitRows = familyRows.map((item) => {
    const topTarget = item.topActiveTargets[0] ?? null;
    const secondTarget = item.topActiveTargets[1] ?? null;
    const purity = topTarget && item.activeAnalogs > 0 ? ratio(topTarget.count, item.activeAnalogs) : 0;
    const confidenceGap =
      topTarget && secondTarget && item.activeAnalogs > 0
        ? round((topTarget.count - secondTarget.count) / item.activeAnalogs)
        : topTarget
          ? purity
          : 0;
    const conflictShare = item.topActiveTargets.length > 1 ? round(1 - purity) : 0;
    const noAnalogShare = item.activeAnalogs === 0 ? 1 : 0;
    return {
      family: item.family,
      residual: item.residualCount,
      contextual: item.usefulContext,
      noContext: item.noUsefulContext,
      activeAnalogs: item.activeAnalogs,
      topTarget: topTarget ? topTarget.key : "",
      purity,
      confidenceGap,
      conflictShare,
      noAnalogShare,
      safeAuto: item.autoReadyPossible,
      safeGroup: item.groupPossible,
      irreducible: item.irreducible,
      limitReason: item.limitReason
    };
  });

  return {
    reasonRows,
    familyRows,
    taxonomyLimitRows,
    classifiedRows: classified.map((item) => ({
      familyId: item.definition.id,
      family: item.definition.label,
      reason: item.definition.reason,
      decision: item.decision
    })),
    otherResidual: familyRows.find((row) => row.familyId === "unique_low_frequency_items")?.residualCount ?? 0
  };
}

function classifyResidualDecision(decision: DecisionRow): ResidualDefinition {
  const text = normalizeForCategorization(`${decision.shopCode} ${decision.name}`);
  const matched = residualDefinitions.find((definition) => {
    if (definition.id === "short_or_code_only_names" || definition.id === "unique_low_frequency_items") {
      return false;
    }
    const termMatched = (definition.terms ?? []).some((term) => textHasTokenPrefix(text, term));
    const phraseMatched = (definition.phrases ?? []).some((phrase) => text.includes(normalizeForCategorization(phrase)));
    return termMatched || phraseMatched;
  });

  if (matched) {
    return matched;
  }

  if (isShortOrCodeOnly(decision)) {
    return residualDefinitions.find((definition) => definition.id === "short_or_code_only_names")!;
  }

  return residualDefinitions.find((definition) => definition.id === "unique_low_frequency_items")!;
}

function activeMatchesForDefinition(definition: ResidualDefinition, activeIndex: ActiveIndex) {
  const terms = definition.activeTerms ?? definition.terms ?? [];
  const phrases = definition.phrases ?? [];
  if (terms.length === 0 && phrases.length === 0) {
    return [];
  }

  return activeIndex.products.filter((product) => {
    const termMatched = terms.some((term) => hasNormalizedToken(product.normalized, term));
    const phraseMatched = phrases.some((phrase) =>
      product.normalized.normalized.includes(normalizeForCategorization(phrase))
    );
    return termMatched || phraseMatched;
  });
}

function hasUsefulDestinationContext(decision: DecisionRow) {
  if (decision.neighborTarget && decision.neighborShare >= 0.65) {
    return true;
  }

  const tokens = tokenizeForSimilarity(`${decision.shopCode} ${decision.name}`);
  return tokens.some((token) =>
    destinationContextTokens.some((contextToken) => token.startsWith(contextToken))
  );
}

const destinationContextTokens = [
  "тормоз",
  "топлив",
  "бензин",
  "масл",
  "охлажд",
  "радиатор",
  "печк",
  "отопител",
  "двигател",
  "гбц",
  "клапан",
  "поддон",
  "кпп",
  "коробк",
  "сцеплен",
  "ступиц",
  "колес",
  "развал",
  "подвеск",
  "амортиз",
  "рессор",
  "рулев",
  "кузов",
  "двер",
  "капот",
  "багажник",
  "глушител",
  "выхлоп",
  "приемн",
  "коллектор",
  "генератор",
  "стартер",
  "суппорт",
  "форсунк",
  "насос",
  "фильтр",
  "шланг",
  "труб",
  "патруб",
  "датчик",
  "свеч",
  "ремн",
  "фар",
  "фонар",
  "стекл",
  "сидень",
  "омывател"
];

function topTokensForRows(rows: DecisionRow[], limit: number) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const token of tokenizeForSimilarity(`${row.shopCode} ${row.name}`)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .slice(0, limit)
    .map(([token, count]) => `${token}:${count}`);
}

function isShortOrCodeOnly(decision: DecisionRow) {
  const name = normalizeForCategorization(decision.name);
  const usefulTokens = tokenizeForSimilarity(name);
  const compactName = name.replace(/[^a-zа-я0-9]/giu, "");
  const compactCode = normalizeForCategorization(decision.shopCode).replace(/[^a-zа-я0-9]/giu, "");
  return usefulTokens.length <= 1 || Boolean(compactName && compactName === compactCode);
}

function textHasTokenPrefix(text: string, token: string) {
  const normalizedToken = normalizeForCategorization(token);
  return tokenizeForSimilarity(text).some((current) => current === normalizedToken || current.startsWith(normalizedToken));
}

async function buildIterationComparison(summary: ReturnType<typeof buildSummary>) {
  const baseline = await readBaselineSummary();
  const rows = [];
  if (baseline) {
    rows.push({
      iteration: "iteration11",
      autoReady: baseline.newProductMetrics.autoReady,
      groupReview: baseline.newProductMetrics.groupReview,
      groups: baseline.newProductMetrics.groupCount,
      manualReview: baseline.newProductMetrics.manualReview,
      blockedConflict: baseline.newProductMetrics.blockedConflict,
      invalidInput: baseline.newProductMetrics.invalidInput,
      fullyManual: baseline.newProductMetrics.fullyManual,
      mainChange: "Baseline before final residual pass."
    });
  }
  rows.push({
    iteration: outputDir.includes("iteration12") ? "iteration12" : "final",
    autoReady: summary.newProductMetrics.autoReady,
    groupReview: summary.newProductMetrics.groupReview,
    groups: summary.newProductMetrics.groupCount,
    manualReview: summary.newProductMetrics.manualReview,
    blockedConflict: summary.newProductMetrics.blockedConflict,
    invalidInput: summary.newProductMetrics.invalidInput,
    fullyManual: summary.newProductMetrics.fullyManual,
    mainChange: "Contextual residual families, stricter residual decomposition, final reports."
  });
  return rows;
}

async function readBaselineSummary(): Promise<ReturnType<typeof buildSummary> | null> {
  try {
    const baselinePath = path.resolve("reports/offline-real-replay-target-count-iteration11/summary.json");
    return JSON.parse(await readFile(baselinePath, "utf8"));
  } catch {
    return null;
  }
}

function buildAutoReadyAudit(decisions: DecisionRow[]) {
  const autoRows = decisions.filter((decision) => decision.status === "AUTO_READY");
  const grouped = new Map<string, DecisionRow[]>();
  for (const row of autoRows) {
    const key = [row.source, row.familyLabel, `${row.categorySlug}/${row.subcategorySlug}`, confidenceBand(row.confidence)].join("|");
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return [...grouped.entries()]
    .map(([key, rows]) => {
      const [source, family, target, band] = key.split("|");
      return {
        source: source ?? "",
        family: family ?? "",
        target: target ?? "",
        band: band ?? "",
        count: rows.length,
        averageConfidence: round(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length),
        neighborBased: rows.filter((row) => row.source === "similarity").length,
        examples: rows.slice(0, 6).map((row) => `${row.shopCode} ${row.name}`)
      };
    })
    .sort((a, b) => b.count - a.count || a.target.localeCompare(b.target, "ru"));
}

function confidenceBand(confidence: number) {
  if (confidence >= 0.95) return "0.95-1.00";
  if (confidence >= 0.9) return "0.90-0.95";
  if (confidence >= 0.85) return "0.85-0.90";
  return "below-0.85";
}

function buildManualSample(decisions: DecisionRow[], limit: number) {
  return [...decisions]
    .sort(
      (a, b) =>
        statusWeight(a.status) - statusWeight(b.status) ||
        Math.abs(AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD - a.confidence) -
          Math.abs(AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD - b.confidence) ||
        b.neighborShare - a.neighborShare ||
        a.rowNumber - b.rowNumber
    )
    .slice(0, Math.min(limit, decisions.length));
}

function buildPrecisionSample(decisions: DecisionRow[], groups: GroupRow[], limit: number) {
  const samples: Array<{ sampleType: string; decision: DecisionRow }> = [];
  const addRows = (sampleType: string, rows: DecisionRow[], max: number) => {
    for (const row of rows) {
      if (samples.length >= limit) return;
      if (samples.some((sample) => sample.decision.shopCode === row.shopCode)) continue;
      samples.push({ sampleType, decision: row });
      if (samples.filter((sample) => sample.sampleType === sampleType).length >= max) return;
    }
  };

  addRows(
    "auto_ready_random",
    deterministicShuffle(decisions.filter((decision) => decision.status === "AUTO_READY")),
    Math.ceil(limit * 0.25)
  );
  addRows(
    "group_review_random",
    deterministicShuffle(decisions.filter((decision) => decision.status === "GROUP_REVIEW")),
    Math.ceil(limit * 0.25)
  );
  addRows(
    "near_threshold",
    [...decisions].sort(
      (a, b) =>
        Math.abs(AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD - a.confidence) -
        Math.abs(AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD - b.confidence)
    ),
    Math.ceil(limit * 0.2)
  );
  for (const group of groups.slice(0, 20)) {
    addRows(
      `largest_group:${group.id}`,
      decisions.filter((decision) => decision.groupKey === group.id),
      10
    );
  }
  addRows("manual_residual", decisions.filter(isFullyManual), Math.ceil(limit * 0.15));
  return samples.slice(0, limit);
}

function buildSummary(input: {
  analysis: ReturnType<typeof analyzeImportFile>;
  activeVersion: ActiveVersionRow;
  importBatches: Awaited<ReturnType<typeof loadImportBatchSummary>>;
  activeProducts: ActiveProduct[];
  activeByCode: Map<string, ActiveProduct>;
  decisions: DecisionRow[];
  existingDecisions: DecisionRow[];
  newDecisions: DecisionRow[];
  groups: GroupRow[];
  residual: DecisionRow[];
  shadowPrecision: ReturnType<typeof buildShadowPrecision>;
  elapsedMs: number;
  peakMemoryMb: number;
}) {
  const statusCounts = countBy(input.newDecisions, (decision) => decision.status);
  const autoReady = statusCount(statusCounts, "AUTO_READY");
  const groupReview = statusCount(statusCounts, "GROUP_REVIEW");
  const manualReview = statusCount(statusCounts, "MANUAL_REVIEW");
  const blockedConflict = statusCount(statusCounts, "BLOCKED_CONFLICT");
  const invalidInput = statusCount(statusCounts, "INVALID_INPUT");
  const operatorDecisionsAfter =
    manualReview + blockedConflict + invalidInput + input.groups.length;
  const localScenarioMismatch = {
    requestedLatestImportApproximation: {
      totalRows: 25567,
      existingProducts: 21811,
      newProducts: 3742,
      initialReview: 3297
    },
    localSnapshotObserved: {
      totalRows: input.analysis.report.totalRows,
      parsedRows: input.analysis.report.parsedRows,
      activeExistingProducts: input.activeProducts.length,
      newOrUnconfirmedProducts: input.newDecisions.length,
      activeVersionReviewCount: input.activeVersion.review_count
    },
    limitation:
      "Локальный snapshot не содержит заявленный 25 567-row импорт; replay использует доступный локальный active catalog и локальный import file. Target-count flags can create a count-bounded approximation, but it is reported separately."
  };

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    productionUsed: false,
    inputFile: input.analysis.report.fileName,
    selectedSheetName: input.analysis.report.selectedSheetName,
    pipelineVersion: CATEGORIZATION_PIPELINE_VERSION,
    activeVersion: {
      id: input.activeVersion.id,
      sourceFileName: input.activeVersion.source_file_name,
      totalRows: input.activeVersion.total_rows,
      parsedRows: input.activeVersion.parsed_rows,
      addedCount: input.activeVersion.added_count,
      updatedCount: input.activeVersion.updated_count,
      reviewCount: input.activeVersion.review_count,
      errorCount: input.activeVersion.error_count,
      publishedAt: input.activeVersion.published_at
    },
    recentLocalImportBatches: input.importBatches,
    scenario: {
      mode: targetExisting || targetNew || importLimit ? "target-count-bounded-local-replay" : "local-active-catalog-replay",
      importLimit,
      targetExisting,
      targetNew,
      selectedRows: input.decisions.length,
      existingActiveRows: input.existingDecisions.length,
      newOrUnconfirmedRows: input.newDecisions.length,
      localScenarioMismatch
    },
    importReportWithActiveProducts: {
      totalRows: input.analysis.report.totalRows,
      parsedRows: input.analysis.report.parsedRows,
      validRows: input.analysis.report.validRows,
      reviewRows: input.analysis.report.reviewRows,
      errorRows: input.analysis.report.errorRows,
      skippedRows: input.analysis.report.skippedRows,
      addedCount: input.analysis.report.addedCount,
      updatedCount: input.analysis.report.updatedCount,
      archivedCount: input.analysis.report.archivedCount,
      unchangedCount: input.analysis.report.unchangedCount
    },
    newProductMetrics: {
      total: input.newDecisions.length,
      autoReady,
      groupReview,
      manualReview,
      blockedConflict,
      invalidInput,
      fullyManual: input.residual.length,
      groupCount: input.groups.length,
      medianGroupSize: median(input.groups.map((group) => group.count)),
      maxGroupSize: input.groups[0]?.count ?? 0,
      groupsOver100: input.groups.filter((group) => group.count > 100).length,
      groupsOver300: input.groups.filter((group) => group.count > 300).length,
      averageConfidence: round(
        input.newDecisions.reduce((sum, decision) => sum + decision.confidence, 0) /
          Math.max(input.newDecisions.length, 1)
      ),
      handledShare: ratio(autoReady + groupReview, input.newDecisions.length),
      fullyManualShare: ratio(input.residual.length, input.newDecisions.length),
      statusCounts,
      reviewReasons: countBy(input.residual, (decision) => decision.reviewReasonCode).slice(0, 30),
      familyDistribution: countBy(input.newDecisions, (decision) => `${decision.detectedFamily}|${decision.status}`).slice(0, 30)
    },
    operatorWorkflow: {
      decisionsBefore: input.newDecisions.length,
      decisionsAfter: operatorDecisionsAfter,
      reduction: input.newDecisions.length - operatorDecisionsAfter,
      reductionShare: ratio(input.newDecisions.length - operatorDecisionsAfter, input.newDecisions.length)
    },
    groupQuality: {
      largestGroups: input.groups.slice(0, 30),
      riskyGroupCount: input.groups.filter((group) => group.riskFlags.length > 0).length,
      veryLargeGroups: input.groups.filter((group) => group.count > 300).length
    },
    precision: {
      activeLabelShadow: input.shadowPrecision.summary,
      humanAudit: {
        performed: false,
        note: "CSV samples were generated for human review. No manual precision is claimed by this command."
      }
    },
    elapsedMs: input.elapsedMs,
    peakMemoryMb: input.peakMemoryMb
  };
}

async function writeMarkdown(
  summary: ReturnType<typeof buildSummary>,
  groups: GroupRow[],
  residual: DecisionRow[],
  activeAnalogPareto: ReturnType<typeof buildActiveAnalogPareto>,
  confidenceCalibration: Array<Array<string | number>>,
  residualAnalysis: ReturnType<typeof buildResidualAnalysis>,
  iterationComparison: Awaited<ReturnType<typeof buildIterationComparison>>
) {
  const baseline = iterationComparison.find((item) => item.iteration === "iteration11") ?? null;
  const targetReached = summary.newProductMetrics.fullyManual >= 300 && summary.newProductMetrics.fullyManual <= 900;
  const groupsOver20 = groups.filter((group) => group.count > 20).length;
  const groupsOver50 = groups.filter((group) => group.count > 50).length;
  const groupsOver100 = groups.filter((group) => group.count > 100).length;
  const averageGroupSize =
    groups.length > 0
      ? round(groups.reduce((sum, group) => sum + group.count, 0) / groups.length)
      : 0;
  const riskyGroupCount = groups.filter((group) => group.riskFlags.length > 0).length;
  const lines = [
    "# Final Offline Import Categorization Report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Input: ${summary.inputFile} / ${summary.selectedSheetName}`,
    `Pipeline: ${summary.pipelineVersion}`,
    "",
    "## 1. Executive Summary",
    "",
    `The 300-900 fully manual target was ${targetReached ? "reached" : "not reached"} in the local count-bounded replay.`,
    `Final fully manual residual: ${summary.newProductMetrics.fullyManual}.`,
    `AUTO_READY products: ${summary.newProductMetrics.autoReady}. GROUP_REVIEW products: ${summary.newProductMetrics.groupReview} across ${summary.newProductMetrics.groupCount} groups.`,
    `The remaining lower bound is supported by \`taxonomy-limit.csv\`; it is dominated by missing destination context, no allowed public target, conflicting active analogs, short/code-only names, and low-frequency items without analogs.`,
    "",
    "## 2. Current State",
    "",
    `Mode: ${summary.scenario.mode}`,
    `Active version: ${summary.activeVersion.id} (${summary.activeVersion.sourceFileName ?? "unknown"})`,
    `Read-only offline command: ${summary.readOnly}. Production used: ${summary.productionUsed}.`,
    "Local PostgreSQL was used only for read-only catalog context. The replay did not import, publish, update active catalog rows, write Meilisearch, restart PM2, touch Nginx, backup, cron, SSL, or production environment files.",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Import total rows | ${summary.importReportWithActiveProducts.totalRows} |`,
    `| Import parsed rows | ${summary.importReportWithActiveProducts.parsedRows} |`,
    `| Existing active rows in replay | ${summary.scenario.existingActiveRows} |`,
    `| New/unconfirmed rows in replay | ${summary.scenario.newOrUnconfirmedRows} |`,
    `| Local active-version review count | ${summary.activeVersion.reviewCount} |`,
    "",
    "The local workspace does not contain the exact 25,567-row latest import described in the task. This replay uses the available local active catalog and import upload, and reports the mismatch explicitly.",
    "",
    "## 3. What Was Implemented Before This Run",
    "",
    "- Deterministic categorization statuses: AUTO_READY, GROUP_REVIEW, MANUAL_REVIEW, BLOCKED_CONFLICT and INVALID_INPUT.",
    "- GROUP_REVIEW stays `needsReview=true` and is not publicly published automatically.",
    "- Offline replay with production guards, read-only DB mode, existing/new split, count-bounded scenario, Pareto outputs, shadow precision samples and search-token fixes.",
    "- Public search fixture excludes review/unconfirmed products and preserves technical-token behavior for T10/W5W/H7/DOT4/5W-30.",
    "",
    "## 4. What Was Done In This Run",
    "",
    "- Added safe contextual GROUP_REVIEW families for recurring residual clusters, while keeping broad fasteners and ambiguous parts out of AUTO_READY.",
    "- Extended residual analytics with `residual-reasons.csv`, `residual-families.csv`, `taxonomy-limit.csv`, `largest-groups.csv`, `auto-ready-audit.csv`, `group-review-audit.csv`, `manual-audit.md` and `draft-pr.md`.",
    "- Split the previous broad residual into concrete report-only families: fasteners without destination, fittings/connectors, repair kits, engine/transmission partial context, body/interior fragments, wheel accessories, driver electronics, lighting/signal devices, novelty/non-catalog goods, code-only names and truly low-frequency items.",
    "- Preserved safety boundaries: no new public categories, no broad artificial fastener category, no LLM, no production writes, no push and no PR.",
    "",
    "## 5. Baseline Iteration 11",
    "",
    baseline
      ? `Iteration 11 baseline: AUTO_READY=${baseline.autoReady}, GROUP_REVIEW=${baseline.groupReview}, groups=${baseline.groups}, MANUAL_REVIEW=${baseline.manualReview}, BLOCKED_CONFLICT=${baseline.blockedConflict}, fully manual=${baseline.fullyManual}.`
      : "Iteration 11 baseline summary was not found in the local reports directory.",
    "",
    "## 6. Decomposition Other",
    "",
    `Final unresolved low-frequency bucket: ${residualAnalysis.otherResidual}.`,
    "The previous broad residual is now reported as concrete families below; the remaining low-frequency bucket contains rows without a repeatable safe pattern after the listed classes are removed.",
    "",
    "| Family | Count | Reason | Useful context | Active analogs | Top tokens | Examples |",
    "| --- | ---: | --- | ---: | ---: | --- | --- |",
    ...residualAnalysis.familyRows.map(
      (item) =>
        `| ${escapeMarkdown(item.family)} | ${item.residualCount} | ${escapeMarkdown(item.reason)} | ${item.usefulContext} | ${item.activeAnalogs} | ${escapeMarkdown(item.topTokens.slice(0, 5).join("; "))} | ${escapeMarkdown(item.examples.slice(0, 3).join("; "))} |`
    ),
    "",
    "## 7. New Contextual Families",
    "",
    "- Seat belts, portable 12/24V work lights, car clocks, heater electrical/cooling parts, copper brake tubes and pneumatic-line fittings were added as narrow reviewable families.",
    "- Fuel-system, engine-valve, suspension-hardware, tow-hardware, engine-mount, brake-tube, body/interior/decor, exhaust and car-audio/product-normalization signals were expanded only with contextual evidence and negative terms.",
    "- Generic DIN/socket-head fasteners, nuts, washers, rings, caps, hoses and ambiguous fittings remain manual unless destination context and active analogs are strong enough.",
    "",
    "## 8. Taxonomy-Limit Analysis",
    "",
    "| Family | Residual | Contextual | No context | Active analogs | Top target | Purity | Confidence gap | Conflict share | Safe auto | Safe group | Irreducible | Limit reason |",
    "| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...residualAnalysis.taxonomyLimitRows.map(
      (item) =>
        `| ${escapeMarkdown(item.family)} | ${item.residual} | ${item.contextual} | ${item.noContext} | ${item.activeAnalogs} | ${escapeMarkdown(item.topTarget || "none")} | ${item.purity} | ${item.confidenceGap} | ${item.conflictShare} | ${item.safeAuto} | ${item.safeGroup} | ${item.irreducible} | ${escapeMarkdown(item.limitReason)} |`
    ),
    "",
    "## 9. Iteration Comparison",
    "",
    "| Iteration | AUTO_READY | GROUP_REVIEW | Groups | MANUAL_REVIEW | BLOCKED | INVALID_INPUT | Fully manual | Main change |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...iterationComparison.map(
      (item) =>
        `| ${item.iteration} | ${item.autoReady} | ${item.groupReview} | ${item.groups} | ${item.manualReview} | ${item.blockedConflict} | ${item.invalidInput} | ${item.fullyManual} | ${escapeMarkdown(item.mainChange)} |`
    ),
    "",
    "## 10. Final Metrics",
    "",
    "| Status | Count |",
    "| --- | ---: |",
    `| AUTO_READY | ${summary.newProductMetrics.autoReady} |`,
    `| GROUP_REVIEW | ${summary.newProductMetrics.groupReview} |`,
    `| MANUAL_REVIEW | ${summary.newProductMetrics.manualReview} |`,
    `| BLOCKED_CONFLICT | ${summary.newProductMetrics.blockedConflict} |`,
    `| INVALID_INPUT | ${summary.newProductMetrics.invalidInput} |`,
    `| Fully manual residual | ${summary.newProductMetrics.fullyManual} |`,
    `| GROUP_REVIEW groups | ${summary.newProductMetrics.groupCount} |`,
    "",
    "## 11. AUTO_READY Quality",
    "",
    "This is not a human audit. It compares classifier output on active catalog products to their current active labels.",
    "",
    `AUTO_READY shadow precision: ${summary.precision.activeLabelShadow.autoReady.precision} (${summary.precision.activeLabelShadow.autoReady.correct}/${summary.precision.activeLabelShadow.autoReady.evaluated})`,
    `GROUP_REVIEW shadow precision: ${summary.precision.activeLabelShadow.groupReview.precision} (${summary.precision.activeLabelShadow.groupReview.correct}/${summary.precision.activeLabelShadow.groupReview.evaluated})`,
    "No manual precision is claimed. `precision-sample.csv` and `auto-ready-audit.csv` are generated for human sampling.",
    "",
    "Confidence calibration:",
    "",
    "| Status | Band | Evaluated | Correct | Precision |",
    "| --- | --- | ---: | ---: | ---: |",
    ...confidenceCalibration.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} | ${row[4]} |`),
    "",
    "## 12. GROUP_REVIEW Quality",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Groups | ${summary.newProductMetrics.groupCount} |`,
    `| Median group size | ${summary.newProductMetrics.medianGroupSize} |`,
    `| Average group size | ${averageGroupSize} |`,
    `| Max group size | ${summary.newProductMetrics.maxGroupSize} |`,
    `| Groups > 20 | ${groupsOver20} |`,
    `| Groups > 50 | ${groupsOver50} |`,
    `| Groups > 100 | ${groupsOver100} |`,
    `| Risk-flagged groups | ${riskyGroupCount} |`,
    "",
    "GROUP_REVIEW rows remain `needsReview=true`; they are grouped for operator confirmation, not published automatically.",
    "",
    "## 13. Largest Groups",
    "",
    "| Group | Count | Target | Confidence | Homogeneity | Risk flags | Examples | Outliers |",
    "| --- | ---: | --- | ---: | ---: | --- | --- | --- |",
    ...groups.slice(0, 25).map(
      (group) =>
        `| ${escapeMarkdown(group.label)} | ${group.count} | ${group.categorySlug}/${group.subcategorySlug} | ${group.confidence} | ${group.homogeneity} | ${escapeMarkdown(group.riskFlags.join(", ") || "none")} | ${escapeMarkdown(group.examples.slice(0, 3).join("; "))} | ${escapeMarkdown(group.outliers.slice(0, 3).join("; "))} |`
    ),
    "",
    "## 14. Residual Manual Review",
    "",
    "| Reason | Count | Share | Examples |",
    "| --- | ---: | ---: | --- |",
    ...residualAnalysis.reasonRows.map(
      (item) =>
        `| ${escapeMarkdown(item.reason)} | ${item.count} | ${item.share} | ${escapeMarkdown(item.examples.slice(0, 4).join("; "))} |`
    ),
    "",
    "Active analog Pareto for residual rows:",
    "",
    "| Family | Residual | Active analogs | Top active targets |",
    "| --- | ---: | ---: | --- |",
    ...activeAnalogPareto.slice(0, 20).map(
      (item) =>
        `| ${escapeMarkdown(item.family)} | ${item.residualCount} | ${item.activeAnalogCount} | ${escapeMarkdown(item.topActiveTargets.map((target) => `${target.key}:${target.count}`).join("; "))} |`
    ),
    "",
    "## 15. Operator Workload",
    "",
    `Initial individual decisions: ${summary.operatorWorkflow.decisionsBefore}.`,
    `Final individual decisions plus group confirmations: ${summary.operatorWorkflow.decisionsAfter}.`,
    `Group confirmations required: ${summary.newProductMetrics.groupCount}.`,
    `Estimated action reduction: ${summary.operatorWorkflow.reduction} (${summary.operatorWorkflow.reductionShare}).`,
    `Median reviewed examples per group: ${summary.newProductMetrics.medianGroupSize}.`,
    "",
    "## 16. Search Results",
    "",
    "Search regression is run separately with `pnpm search:fixture` and saved as `search-regression-results.json` in this directory. The fixture excludes GROUP_REVIEW/manual/unconfirmed products from public-search candidates.",
    "",
    "## 17. Tests",
    "",
    "Command results are recorded after the replay: typecheck, lint, test, build, categorization check, search fixture and safe import dry-run where available.",
    "",
    "## 18. Performance",
    "",
    `Elapsed: ${summary.elapsedMs} ms.`,
    `Peak memory: ${summary.peakMemoryMb} MB.`,
    "",
    "## 19. Risks",
    "",
    "- Active-label shadow precision is a proxy, not a human audit.",
    "- Risk-flagged GROUP_REVIEW clusters require operator sampling before enablement.",
    "- Broad destination-free fasteners, fittings, caps, rings and hoses remain manual to avoid unsafe category assignment.",
    "",
    "## 20. Known Limitations",
    "",
    "- The exact requested 25,567-row production import snapshot is not present locally; this is a count-bounded replay using the available local upload and active catalog.",
    "- Remaining generic fasteners, universal fittings, code-only rows, vehicle-model-only names and non-catalog accessories require taxonomy or source-data decisions before further safe automation.",
    "- No manual precision audit was performed by the replay command.",
    "",
    "## 21. Safe Deployment Plan",
    "",
    "1. Review `auto-ready-audit.csv`, `group-review-audit.csv`, and the largest groups before enabling the pipeline.",
    "2. Run the same replay against the exact target import snapshot in a local or staging database.",
    "3. Publish only after operator sampling confirms the group targets and search fixture remains green.",
    "",
    "## 22. Rollback Plan",
    "",
    "Keep the previous categorization code and search index active until replay and sampling pass. If quality drops, revert the local commit and keep all new products in manual review.",
    "",
    "## 23. Next Recommended Product/Taxonomy Decision",
    "",
    "Decide whether generic fasteners, universal pneumatic fittings, code-only legacy parts and non-catalog accessories deserve explicit public taxonomy targets or source-data enrichment. Without that product/taxonomy decision, the lower bound remains dominated by items with no allowed destination or insufficient product context.",
    "",
    "## Appendix. Residual Examples",
    "",
    ...residual.slice(0, 40).map(
      (decision) =>
        `- ${decision.shopCode} ${decision.name} (${decision.reviewReasonCode}; neighbors: ${decision.neighborTarget || "none"} ${decision.neighborShare})`
    )
  ];

  await writeFile(path.join(outputDir, "report.md"), `${lines.join("\n")}\n`, "utf8");
}

async function writeManualAudit(
  summary: ReturnType<typeof buildSummary>,
  residualAnalysis: ReturnType<typeof buildResidualAnalysis>,
  groups: GroupRow[]
) {
  const lines = [
    "# Manual Audit",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Summary",
    "",
    `Fully manual residual: ${summary.newProductMetrics.fullyManual}.`,
    `GROUP_REVIEW products: ${summary.newProductMetrics.groupReview}.`,
    `GROUP_REVIEW groups: ${summary.newProductMetrics.groupCount}.`,
    `Largest group size: ${summary.newProductMetrics.maxGroupSize}.`,
    "",
    "## Residual Reasons",
    "",
    "| Reason | Count | Share | Examples |",
    "| --- | ---: | ---: | --- |",
    ...residualAnalysis.reasonRows.map(
      (item) =>
        `| ${escapeMarkdown(item.reason)} | ${item.count} | ${item.share} | ${escapeMarkdown(item.examples.slice(0, 4).join("; "))} |`
    ),
    "",
    "## Residual Families",
    "",
    "| Family | Count | Useful context | Active analogs | Irreducible | Reason | Examples |",
    "| --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...residualAnalysis.familyRows.slice(0, 40).map(
      (item) =>
        `| ${escapeMarkdown(item.family)} | ${item.residualCount} | ${item.usefulContext} | ${item.activeAnalogs} | ${item.irreducible} | ${escapeMarkdown(item.reason)} | ${escapeMarkdown(item.examples.slice(0, 4).join("; "))} |`
    ),
    "",
    "## Group Review QA",
    "",
    `Risky groups: ${groups.filter((group) => group.riskFlags.length > 0).length}.`,
    `Groups over 20 products: ${groups.filter((group) => group.count > 20).length}.`,
    `Groups over 50 products: ${groups.filter((group) => group.count > 50).length}.`,
    `Groups over 100 products: ${groups.filter((group) => group.count > 100).length}.`,
    "",
    "Operator should confirm each group target, inspect outliers listed in `group-review-audit.csv`, and split or reject any group with non-empty risk flags."
  ];

  await writeFile(path.join(outputDir, "manual-audit.md"), `${lines.join("\n")}\n`, "utf8");
}

async function writeDraftPr(
  summary: ReturnType<typeof buildSummary>,
  residualAnalysis: ReturnType<typeof buildResidualAnalysis>,
  iterationComparison: Awaited<ReturnType<typeof buildIterationComparison>>
) {
  const baseline = iterationComparison[0];
  const final = iterationComparison[iterationComparison.length - 1]!;
  const deltaAuto = baseline ? final.autoReady - baseline.autoReady : final.autoReady;
  const deltaGroup = baseline ? final.groupReview - baseline.groupReview : final.groupReview;
  const deltaManual = baseline ? final.fullyManual - baseline.fullyManual : final.fullyManual;
  const lines = [
    "# Draft PR: Finish Offline Import Categorization Residual Pass",
    "",
    "## Problem",
    "",
    "The import categorization pipeline left a large fully manual residual. The final pass needs to reduce only safe, context-backed cases and prove the remaining lower bound without reintroducing fasteners or unsafe public search exposure.",
    "",
    "## Architecture",
    "",
    "- Extends deterministic domain families with contextual `GROUP_REVIEW` decisions.",
    "- Keeps broad fasteners and ambiguous connector/cap/ring families out of AUTO_READY.",
    "- Adds reproducible replay artifacts for residual decomposition, taxonomy-limit proof, AUTO_READY audit, GROUP_REVIEW audit and operator workload.",
    "",
    "## Metrics",
    "",
    "| Metric | Baseline | Final | Delta |",
    "| --- | ---: | ---: | ---: |",
    `| AUTO_READY | ${baseline?.autoReady ?? 0} | ${final.autoReady} | ${deltaAuto} |`,
    `| GROUP_REVIEW products | ${baseline?.groupReview ?? 0} | ${final.groupReview} | ${deltaGroup} |`,
    `| GROUP_REVIEW groups | ${baseline?.groups ?? 0} | ${final.groups} | ${baseline ? final.groups - baseline.groups : final.groups} |`,
    `| Fully manual | ${baseline?.fullyManual ?? 0} | ${final.fullyManual} | ${deltaManual} |`,
    "",
    "## Residual Analysis",
    "",
    ...residualAnalysis.familyRows.slice(0, 12).map(
      (item) =>
        `- ${item.family}: ${item.residualCount}, reason=${item.reason}, irreducible=${item.irreducible}. Examples: ${item.examples.slice(0, 2).join("; ")}`
    ),
    "",
    "## Taxonomy Limit",
    "",
    "Remaining residual is dominated by families with no allowed public target, missing destination context, conflicting active analogs, absent active analogs, and short/code-only names. See `taxonomy-limit.csv` and `manual-audit.md`.",
    "",
    "## Search Fix",
    "",
    "Technical-token search behavior for T10/W5W/H7/DOT4/5W-30 is preserved by tests and search fixture. Review/unconfirmed products remain excluded from public search fixture output.",
    "",
    "## Tests",
    "",
    "- `pnpm typecheck`",
    "- `pnpm lint`",
    "- `pnpm test`",
    "- `pnpm build`",
    "- count-bounded offline replay",
    "- search fixture",
    "",
    "## Risks",
    "",
    "- Active-label shadow precision is proxy quality, not human precision.",
    "- Local data is a count-bounded approximation because the exact 25,567-row import snapshot is not present.",
    "- Generic fasteners and universal fittings still need a product taxonomy decision.",
    "",
    "## Deployment Plan",
    "",
    "Run replay in staging/local against the exact import snapshot, review CSV samples, then enable the pipeline without changing production DB or Meilisearch directly.",
    "",
    "## Rollback Plan",
    "",
    "Revert the categorization commit and keep new products in manual review. Public search remains protected because only active confirmed products are indexed.",
    "",
    "## Checklist",
    "",
    "- [ ] Review AUTO_READY sample.",
    "- [ ] Review largest GROUP_REVIEW groups.",
    "- [ ] Confirm taxonomy-limit lower bound.",
    "- [ ] Run production preflight in a safe environment.",
    "- [ ] Do not push or create PR until owner approval."
  ];

  await writeFile(path.join(outputDir, "draft-pr.md"), `${lines.join("\n")}\n`, "utf8");
}

const productFamilyDefinitions = [
  { id: "socket_head_fasteners", terms: ["din912", "шестигранником", "шестигранник"] },
  { id: "safety_belts", terms: ["ремни безопасности", "ремень безопасности", "ремня безопасности"] },
  { id: "pneumatic_fittings", terms: ["фурнитура", "соединитель шлангов", "наружная резьба", "внутренняя резьба"] },
  { id: "brake_tubes", terms: ["трубки медные", "трубка медная"] },
  { id: "tow_hardware", terms: ["скоба такелажная", "крюк буксировочный", "буксирной проушины"] },
  { id: "body_decor", terms: ["расширитель арок", "сетка алюминиевая", "сетка пластиковая", "реснички"] },
  { id: "interior_sunvisors", terms: ["козырьки солнцезащитные", "сопло обдува"] },
  { id: "bolts", terms: ["болт", "винт"] },
  { id: "nuts", terms: ["гайка", "гайа"] },
  { id: "washers", terms: ["шайба"] },
  { id: "screws", terms: ["саморез"] },
  { id: "studs", terms: ["шпилька"] },
  {
    id: "fittings",
    terms: ["фитинг", "штуцер", "тройник", "соединитель", "переходник", "быстросъем", "быстросъём", "быстроразъем", "быстроразъём"]
  },
  { id: "rings", terms: ["кольцо", "кольца"] },
  { id: "clamps", terms: ["хомут"] },
  { id: "bushings", terms: ["втулка"] },
  { id: "hoses", terms: ["патрубок", "шланг", "трубка"] },
  { id: "sensors", terms: ["датчик", "дмрв", "дпкв", "дпдз", "рхх"] },
  { id: "bearings", terms: ["подшипник"] },
  { id: "gaskets", terms: ["прокладка", "сальник"] },
  { id: "caps_plugs", terms: ["крышка", "пробка", "заглушка"] },
  { id: "fragrances", terms: ["ароматизатор", "дезодорант"] },
  { id: "steering_wheels", terms: ["руль"] },
  { id: "steering_wheel_covers", terms: ["оплетка", "оплётка"] },
  { id: "child_seats", terms: ["автокресло", "кресло"] },
  { id: "heater_parts", terms: ["печка", "печки", "отопитель"] },
  { id: "ignition_distributor", terms: ["трамблер", "трамблёр"] },
  { id: "seat_parts", terms: ["сиденье", "сиденья", "сидений"] },
  { id: "ventilation", terms: ["вентилятор", "электровентилятор"] },
  { id: "conditioner_parts", terms: ["кондиционер", "кондиционера"] },
  { id: "adhesive_tapes", terms: ["скотч"] },
  { id: "driver_electronics", terms: ["антирадар", "алкотестер", "рация", "инвертор"] },
  { id: "roof_rails", terms: ["рейлинг", "рейлинги"] },
  { id: "document_accessories", terms: ["автодокументы", "футляр"] },
  { id: "washing_sponges", terms: ["губка", "швабра"] },
  { id: "body_clips", terms: ["пистон", "пистоны"] },
  { id: "jacks", terms: ["домкрат"] },
  { id: "pins", terms: ["шплинт"] },
  { id: "personal_accessories", terms: ["перчатки", "бумажник", "брелок", "смайлики"] },
  { id: "electrical_consumer", terms: ["usb", "флешка", "адаптер", "тепловентилятор"] },
  { id: "other", terms: [] }
];

const broadGroupingTokens = new Set([
  "болт",
  "гайка",
  "винт",
  "втулка",
  "датчик",
  "диск",
  "кольцо",
  "крепление",
  "кронштейн",
  "насос",
  "патрубок",
  "провод",
  "ремкомплект",
  "ремень",
  "ручка",
  "сальник",
  "стекло",
  "трубка",
  "фильтр",
  "хомут",
  "шайба",
  "шланг",
  "шпилька",
  "штуцер"
]);

const similarityStopTokens = new Set([
  "для",
  "без",
  "под",
  "над",
  "при",
  "или",
  "на",
  "в",
  "во",
  "от",
  "до",
  "из",
  "со",
  "передний",
  "передняя",
  "задний",
  "задняя",
  "левый",
  "левая",
  "правый",
  "правая",
  "верхний",
  "нижний",
  "комплект",
  "набор",
  "деталь",
  "универсальный"
]);

function tokenizeForSimilarity(value: string) {
  return [
    ...new Set(
      normalizeForCategorization(value)
        .split(/\s+/)
        .map((token) => token.replace(/^\d+|\d+$/g, ""))
        .filter(
          (token) =>
            token.length >= 3 &&
            !/^\d+$/.test(token) &&
            !similarityStopTokens.has(token)
        )
    )
  ];
}

function detectFamily(features: NormalizedProductName) {
  return (
    productFamilyDefinitions.find(
      (family) =>
        family.id !== "other" &&
        family.terms.some((term) =>
          term.includes(" ")
            ? features.normalized.includes(normalizeForCategorization(term))
            : hasNormalizedToken(features, term)
        )
    )?.id ?? "other"
  );
}

function hasNormalizedToken(features: NormalizedProductName, token: string) {
  const normalized = normalizeForCategorization(token);
  return features.tokens.some((current) => current === normalized || current.startsWith(normalized));
}

function isProductCandidate(row: AnalyzedImportRow) {
  return Boolean(
    row.shopCode &&
      row.price !== null &&
      row.status !== "error" &&
      row.status !== "skipped"
  );
}

function isFullyManual(decision: DecisionRow) {
  return (
    decision.status === "MANUAL_REVIEW" ||
    decision.status === "BLOCKED_CONFLICT" ||
    decision.status === "INVALID_INPUT"
  );
}

function buildTitle(row: Pick<AnalyzedImportRow, "shopCode" | "name" | "rawName">) {
  return `${row.shopCode ?? ""} ${row.name || row.rawName}`.trim();
}

function normalizeGroupShard(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-zа-я0-9.-]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isBroadGroupingToken(value: string) {
  const normalized = normalizeForCategorization(value).split(/\s+/)[0] ?? value;
  return broadGroupingTokens.has(normalized);
}

function statusCount(items: Array<{ key: string; count: number }>, status: CategorizationDecisionStatus) {
  return items.find((item) => item.key === status)?.count ?? 0;
}

function sampleSizeForGroup(count: number) {
  if (count <= 20) return Math.min(count, 8);
  if (count <= 100) return 12;
  return 20;
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

function deterministicShuffle<T extends { shopCode: string; rowNumber: number }>(items: T[]) {
  return [...items].sort((a, b) => stableHash(a.shopCode || String(a.rowNumber)) - stableHash(b.shopCode || String(b.rowNumber)));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round((sorted[middle - 1]! + sorted[middle]!) / 2) : sorted[middle]!;
}

function ratio(value: number, total: number) {
  return total > 0 ? round(value / total) : 0;
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function statusWeight(status: CategorizationDecisionStatus) {
  if (status === "BLOCKED_CONFLICT") return 0;
  if (status === "INVALID_INPUT") return 0;
  if (status === "MANUAL_REVIEW") return 1;
  if (status === "GROUP_REVIEW") return 2;
  return 3;
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

function readNumberArg(name: string) {
  const value = readArg(name);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return Math.floor(parsed);
}

function assertOfflineGuard() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run replay with NODE_ENV=production.");
  }
  if (process.env.AUTOZAP_OFFLINE !== "1") {
    throw new Error("Set AUTOZAP_OFFLINE=1 to confirm local/offline replay.");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required and must point to a local/offline PostgreSQL database.");
  }
  const host = safeUrlHost(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  if (!localHosts.has(host)) {
    throw new Error(`Refusing non-local DATABASE_URL host: ${host}`);
  }
  const meiliHost = process.env.MEILI_HOST ?? "";
  const unsafeEndpoint = [databaseUrl, meiliHost].some((value) =>
    /prod|production|render|railway|supabase|neon|amazonaws|digitalocean|\.ru|\.com/i.test(value)
  );
  if (unsafeEndpoint) {
    throw new Error("Refusing to run with production-like DATABASE_URL or MEILI_HOST.");
  }
}

function safeUrlHost(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    throw new Error("DATABASE_URL must be a URL.");
  }
}
