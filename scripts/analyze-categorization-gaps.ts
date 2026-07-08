import path from "node:path";
import { buildDefaultCategorizationContext, categorizeProductName } from "../src/features/categorization/engine";
import { analyzeImportFile } from "../src/features/import/analyze";
import { normalizeForCategorization } from "../src/features/categorization/engine";

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error("Usage: pnpm categorization:gaps <path-to-catalog.xls|xlsx>");
  process.exit(1);
}

const stopWords = new Set([
  "a",
  "an",
  "and",
  "at",
  "in",
  "of",
  "on",
  "the",
  "v",
  "а",
  "без",
  "в",
  "г",
  "газ",
  "гранта",
  "для",
  "до",
  "з",
  "и",
  "к",
  "калина",
  "к-т",
  "кт",
  "лада",
  "лев",
  "левый",
  "н",
  "на",
  "нива",
  "нов",
  "о",
  "от",
  "п",
  "пер",
  "перед",
  "передн",
  "передний",
  "прав",
  "правый",
  "приора",
  "р",
  "с",
  "сб",
  "ст",
  "уаз",
  "шт"
]);

const minTokenLength = 3;
const context = buildDefaultCategorizationContext();
const analysis = analyzeImportFile(path.resolve(inputPath));
const prefixes = new Map<string, { count: number; examples: string[] }>();
const tokens = new Map<string, { count: number; examples: string[] }>();
const bigrams = new Map<string, { count: number; examples: string[] }>();
const totalCandidates = {
  matched: 0,
  needsReview: 0
};

for (const row of analysis.rows) {
  if (!row.shopCode || row.price === null || row.status === "error" || row.status === "skipped") {
    continue;
  }

  const rawTitle = `${row.shopCode} ${row.name || row.rawName}`;
  const result = categorizeProductName(rawTitle, context);
  if (result.target) {
    totalCandidates.matched += 1;
    continue;
  }

  totalCandidates.needsReview += 1;
  const example = `${row.shopCode} ${row.name || row.rawName}`.trim();
  const prefix = row.shopCode.split("-")[0]?.trim().toUpperCase() || "NO_PREFIX";
  pushCount(prefixes, prefix, example);

  const words = normalizeForCategorization(row.name || row.rawName)
    .split(/\s+/)
    .map((word) => word.replace(/^\d+|\d+$/g, ""))
    .filter((word) => word.length >= minTokenLength && !stopWords.has(word) && !/^\d+$/.test(word));

  for (const word of words) {
    pushCount(tokens, word, example);
  }

  for (let index = 0; index < words.length - 1; index += 1) {
    pushCount(bigrams, `${words[index]} ${words[index + 1]}`, example);
  }
}

const report = {
  fileName: analysis.report.fileName,
  selectedSheetName: analysis.report.selectedSheetName,
  rules: context.rules.length,
  ...totalCandidates,
  topPrefixes: topEntries(prefixes, 40),
  topTokens: topEntries(tokens, 80),
  topBigrams: topEntries(bigrams, 60)
};

console.log(JSON.stringify(report, null, 2));

function pushCount(bucket: Map<string, { count: number; examples: string[] }>, key: string, example: string) {
  const current = bucket.get(key) ?? { count: 0, examples: [] };
  current.count += 1;
  if (current.examples.length < 5 && !current.examples.includes(example)) {
    current.examples.push(example);
  }
  bucket.set(key, current);
}

function topEntries(bucket: Map<string, { count: number; examples: string[] }>, limit: number) {
  return [...bucket.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ru"))
    .slice(0, limit);
}
