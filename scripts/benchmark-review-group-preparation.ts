import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { assertLocalTestDatabase } from "../src/lib/server/local-db-safety";
import {
  catalogVersions,
  products,
  reviewQueue,
  reviewWorkspaceItems
} from "../src/db/schema";
import { buildCategorySuggestion } from "../src/features/admin/review";
import { getCategorizationContext } from "../src/features/categorization/repository";

const REVIEWABLE_PRODUCT_STATUSES = ["needs_review", "invalid"] as const;
const DEFAULT_SIZES = [1, 5, 10, 25, 50, 100];

async function main() {
  const { databaseUrl } = assertLocalTestDatabase({
    requiredFlag: "ALLOW_LOCAL_READ_ONLY_BENCHMARK",
    purpose: "Review group preparation benchmark"
  });
  const queryClient = postgres(databaseUrl, { max: 1 });
  const database = drizzle(queryClient);

  try {
    await queryClient.unsafe("BEGIN TRANSACTION READ ONLY");
    const report = await runPreparationBenchmark(database);
    await queryClient.unsafe("ROLLBACK");
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    try {
      await queryClient.unsafe("ROLLBACK");
    } catch {
      // The primary error below is the useful safe diagnostic.
    }
    throw error;
  } finally {
    await queryClient.end();
  }
}

async function runPreparationBenchmark(database: ReturnType<typeof drizzle>) {
  const requestedSizes = readSizes();
  const [activeVersion] = await database
    .select({ id: catalogVersions.id })
    .from(catalogVersions)
    .where(eq(catalogVersions.status, "active"))
    .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
    .limit(1);

  if (!activeVersion) {
    throw new Error("No active catalog version is available for the local preparation benchmark.");
  }

  const contextStartedAt = performance.now();
  const context = await getCategorizationContext(undefined, database);
  const contextDurationMs = elapsed(contextStartedAt);
  const results = [];

  for (const requestedSize of requestedSizes) {
    const startedAt = performance.now();
    const heapBefore = process.memoryUsage().heapUsed;
    const queryStartedAt = performance.now();
    const rows = await database
      .select({
        reviewId: reviewQueue.id,
        productId: products.id,
        shopCode: products.shopCode,
        name: products.name,
        rawName: products.rawName,
        suggestedCategoryId: reviewQueue.suggestedCategoryId,
        suggestedSubcategoryId: reviewQueue.suggestedSubcategoryId
      })
      .from(reviewQueue)
      .innerJoin(products, eq(products.id, reviewQueue.productId))
      .leftJoin(
        reviewWorkspaceItems,
        and(
          eq(reviewWorkspaceItems.productId, products.id),
          inArray(reviewWorkspaceItems.status, ["pending", "excluded"])
        )
      )
      .where(
        and(
          eq(reviewQueue.status, "open"),
          eq(reviewQueue.catalogVersionId, activeVersion.id),
          inArray(products.status, REVIEWABLE_PRODUCT_STATUSES),
          sql`${reviewWorkspaceItems.id} is null`
        )
      )
      .orderBy(asc(reviewQueue.createdAt))
      .limit(requestedSize);
    const databaseDurationMs = elapsed(queryStartedAt);

    const classificationStartedAt = performance.now();
    const suggestions = rows.map((row) =>
      buildCategorySuggestion(
        {
          shopCode: row.shopCode,
          name: row.name,
          rawName: row.rawName,
          suggestedCategoryId: row.suggestedCategoryId,
          suggestedSubcategoryId: row.suggestedSubcategoryId
        },
        context,
        context.targetBySlug ?? new Map()
      )
    );
    const classificationDurationMs = elapsed(classificationStartedAt);

    results.push({
      requestedSize,
      itemCount: rows.length,
      totalReadAndClassifyMs: elapsed(startedAt),
      databaseDurationMs,
      classificationDurationMs,
      sqlOperations: 1,
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
      result: suggestions.length === rows.length ? "success" : "mismatch"
    });
  }

  return {
    kind: "review_group_preparation_read_only_benchmark",
    activeVersion: true,
    contextLoadDurationMs: contextDurationMs,
    contextSqlOperations: 2,
    results,
    limitations: [
      "Preparation benchmark only: it does not create workspace actions or items.",
      "It does not measure the group-apply transaction, revalidation, redirect, indexing, or publication.",
      "All queries run inside BEGIN TRANSACTION READ ONLY and are rolled back."
    ]
  };
}

function readSizes() {
  const option = process.argv.find((value) => value.startsWith("--sizes="));
  if (!option) return DEFAULT_SIZES;
  const values = option
    .slice("--sizes=".length)
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 5000);
  return values.length > 0 ? [...new Set(values)] : DEFAULT_SIZES;
}

function elapsed(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

main().catch((error) => {
  console.error("[review-group-preparation-benchmark] failed", {
    errorCode: getSafeErrorCode(error)
  });
  process.exit(1);
});

function getSafeErrorCode(error: unknown) {
  if (error && typeof error === "object") {
    const cause = "cause" in error ? error.cause : undefined;
    if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
      return cause.code;
    }
    if ("code" in error && typeof error.code === "string") {
      return error.code;
    }
  }
  return "benchmark_query_failed";
}
