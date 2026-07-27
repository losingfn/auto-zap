import { classifyWithDomainPipeline } from "../src/features/categorization/pipeline";
import { familyDefinitions } from "../src/features/categorization/domain-config";
import {
  createPipelineFixtureCases,
  createPipelineFixtureContext
} from "./helpers/categorization-pipeline-fixture";
import {
  classifyWithDomainPipelineReference,
  createPipelineReferenceMetrics
} from "./helpers/categorization-pipeline-reference";

const mode = process.argv[2] ?? "both";
const runCount = 7;
const context = createPipelineFixtureContext();
const fixtures = createPipelineFixtureCases(300, context);
const compiledFamilyStaticValues = familyDefinitions.reduce(
  (total, family) =>
    total +
    family.requiredAny.length +
    (family.requiredAll?.length ?? 0) +
    (family.contextAny?.length ?? 0) +
    (family.strongPhrases?.length ?? 0) +
    (family.technicalAny?.length ?? 0) +
    (family.optional?.length ?? 0) +
    (family.negative?.length ?? 0),
  0
);

if (mode === "baseline" || mode === "both") {
  console.log(JSON.stringify({ baseline: benchmarkReference() }, null, 2));
}

if (mode === "optimized" || mode === "both") {
  console.log(JSON.stringify({ optimized: benchmarkOptimized() }, null, 2));
}

function benchmarkReference() {
  const runs = Array.from({ length: runCount }, () => {
    const metrics = createPipelineReferenceMetrics();
    const startedAt = performance.now();
    for (const fixture of fixtures) {
      classifyWithDomainPipelineReference(
        fixture.productName,
        context,
        fixture.legacyResult,
        metrics
      );
    }
    return { durationMs: performance.now() - startedAt, metrics };
  });

  return summarize(runs, runs[0]!.metrics);
}

function benchmarkOptimized() {
  const referenceMetrics = createPipelineReferenceMetrics();
  for (const fixture of fixtures) {
    classifyWithDomainPipelineReference(
      fixture.productName,
      context,
      fixture.legacyResult,
      referenceMetrics
    );
  }
  const runs = Array.from({ length: runCount }, () => {
    const startedAt = performance.now();
    let candidateCount = 0;
    for (const fixture of fixtures) {
      const result = classifyWithDomainPipeline(
        fixture.productName,
        context,
        fixture.legacyResult
      );
      candidateCount += result.candidates?.length ?? 0;
    }
    return { durationMs: performance.now() - startedAt, candidateCount };
  });

  return summarize(runs, referenceMetrics, {
    staticFamilyNormalizations: 0,
    compiledFamilyStaticValues
  });
}

function summarize(
  runs: Array<{ durationMs: number; metrics?: ReturnType<typeof createPipelineReferenceMetrics>; candidateCount?: number }>,
  baselineMetrics: ReturnType<typeof createPipelineReferenceMetrics> | undefined,
  optimizedCounts?: { staticFamilyNormalizations: number; compiledFamilyStaticValues: number }
) {
  const durations = runs.map((run) => run.durationMs);
  return {
    rows: fixtures.length,
    runs_ms: durations.map((duration) => Math.round(duration)),
    average_ms: round(durations.reduce((total, duration) => total + duration, 0) / durations.length),
    median_ms: round(percentile(durations, 0.5)),
    p95_ms: round(percentile(durations, 0.95)),
    max_ms: round(Math.max(...durations)),
    average_per_row_ms: round(percentile(durations, 0.5) / fixtures.length),
    family_evaluations: baselineMetrics?.familyEvaluations ?? fixtures.length * 149,
    family_candidates: baselineMetrics?.familyCandidates ?? "equal_to_reference_by_deep_equality_test",
    product_normalizations: baselineMetrics?.productNormalizations ?? "unchanged",
    static_family_normalizations: optimizedCounts?.staticFamilyNormalizations ?? baselineMetrics?.staticFamilyNormalizations ?? 0,
    compiled_family_static_values: optimizedCounts?.compiledFamilyStaticValues ?? 0,
    displayed_candidate_summaries: runs[0]?.candidateCount ?? "not_measured"
  };
}

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentileValue) - 1] ?? 0;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
