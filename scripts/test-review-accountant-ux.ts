import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appendTemporarilySkippedReviewId,
  createIsolatedReviewFormState,
  shouldApplyReviewActionResponse
} from "../src/features/admin/review-form-state";
import {
  advanceToPrefetchedReviewItem,
  applySimilarGroupToCurrentReviewItem
} from "../src/features/admin/review-prefetch-state";
import { applyReviewActionWithOptionalRule } from "../src/features/admin/review-rule-fallback";
import type { AdminReviewItem, AdminReviewPrimaryData, AdminReviewSimilarGroup } from "../src/features/admin/review";
import {
  buildPrimaryReviewSummary,
  buildReviewPagination,
  getReviewPageWindow,
  REVIEW_PRIMARY_PREFETCH_SIZE,
  REVIEW_SIMILAR_GROUP_LIMIT
} from "../src/features/admin/review";

async function main() {
  await run("a changed card form cannot leak into the next product", () => {
    const gubka = createIsolatedReviewFormState({
      reviewId: "review-gubka",
      suggestedCategoryId: "accessories",
      suggestedSubcategoryId: "car-care",
      currentCategoryId: null,
      currentSubcategoryId: null
    });
    const reviewerChangedGubka = {
      ...gubka,
      categoryId: "engine",
      subcategoryId: "air-intake",
      learnRule: true,
      identityDecision: "same" as const
    };
    const airIntake = createIsolatedReviewFormState({
      reviewId: "review-air-intake",
      suggestedCategoryId: null,
      suggestedSubcategoryId: null,
      currentCategoryId: null,
      currentSubcategoryId: null
    });

    assert.deepEqual(airIntake, {
      reviewId: "review-air-intake",
      categoryId: "",
      subcategoryId: "",
      learnRule: false,
      identityDecision: null
    });
    assert.notDeepEqual(airIntake, reviewerChangedGubka);
  });

  await run("a delayed response from product A cannot replace product B", () => {
    let visibleReviewId: string | null = "review-gubka";
    let visibleProduct = "Губка";

    visibleReviewId = "review-air-intake";
    visibleProduct = "Воздухозаборник";
    if (shouldApplyReviewActionResponse(visibleReviewId, "review-gubka")) {
      visibleProduct = "устаревший ответ";
    }

    assert.equal(visibleProduct, "Воздухозаборник");
    assert.equal(shouldApplyReviewActionResponse(visibleReviewId, "review-air-intake"), true);
  });

  await run("skip is temporary, ordered, and bounded without making a workspace exclusion", () => {
    let skipped: string[] = [];
    skipped = appendTemporarilySkippedReviewId(skipped, "review-gubka", 2);
    skipped = appendTemporarilySkippedReviewId(skipped, "review-air-intake", 2);
    skipped = appendTemporarilySkippedReviewId(skipped, "review-filter", 2);

    assert.deepEqual(skipped, ["review-air-intake", "review-filter"]);
  });

  await run("skip moves to prefetched B instantly, then applies only B's similar group", () => {
    const groupA = similarGroup(["review-a", "review-a2"]);
    const groupB = similarGroup(["review-b", "review-b2", "review-b3"]);
    const initial = primaryData(item("review-a"), [item("review-b"), item("review-c")], groupA);
    const skipped = appendTemporarilySkippedReviewId([], "review-a");
    const advance = advanceToPrefetchedReviewItem(initial);

    assert.equal(advance.kind, "prefetched");
    if (advance.kind !== "prefetched") throw new Error("Expected prefetched review item");
    assert.equal(advance.reviewId, "review-b");
    assert.equal(advance.data.item?.reviewId, "review-b");
    assert.deepEqual(advance.data.prefetchedItems.map((candidate) => candidate.reviewId), ["review-c"]);
    assert.equal(advance.data.similarGroup, null);
    assert.deepEqual(advance.data.summary, initial.summary);
    assert.deepEqual(skipped, ["review-a"]);
    assert.deepEqual(
      createIsolatedReviewFormState({
        reviewId: "review-b",
        suggestedCategoryId: null,
        suggestedSubcategoryId: null,
        currentCategoryId: null,
        currentSubcategoryId: null
      }),
      {
        reviewId: "review-b",
        categoryId: "",
        subcategoryId: "",
        learnRule: false,
        identityDecision: null
      }
    );

    const withGroupB = applySimilarGroupToCurrentReviewItem(advance.data, "review-b", groupB);
    assert.deepEqual(withGroupB.similarGroup, groupB);
    assert.equal(withGroupB.item?.reviewId, "review-b");
    assert.equal(withGroupB.prefetchedItems[0]?.reviewId, "review-c");
    assert.deepEqual(initial.similarGroup, groupA);
  });

  await run("a missing group stays absent and a stale group response cannot reach C", () => {
    const initial = primaryData(item("review-a"), [item("review-b"), item("review-c")]);
    const toB = advanceToPrefetchedReviewItem(initial);
    assert.equal(toB.kind, "prefetched");
    if (toB.kind !== "prefetched") throw new Error("Expected B");
    const withoutGroup = applySimilarGroupToCurrentReviewItem(toB.data, "review-b", null);
    assert.equal(withoutGroup.similarGroup, null);

    const toC = advanceToPrefetchedReviewItem(withoutGroup);
    assert.equal(toC.kind, "prefetched");
    if (toC.kind !== "prefetched") throw new Error("Expected C");
    const staleBGroup = applySimilarGroupToCurrentReviewItem(
      toC.data,
      "review-b",
      similarGroup(["review-b", "review-b2"])
    );
    assert.equal(staleBGroup, toC.data);
    assert.equal(staleBGroup.item?.reviewId, "review-c");
    assert.equal(staleBGroup.similarGroup, null);
    assert.equal(shouldApplyReviewActionResponse("review-c", "review-b"), false);
  });

  await run("exhausted prefetch preserves data for the existing server fallback", () => {
    const initial = primaryData(item("review-last"), []);
    assert.deepEqual(advanceToPrefetchedReviewItem(initial), { kind: "exhausted" });
    assert.deepEqual(initial.summary, { remaining: 8, reviewed: 2, total: 10 });
  });

  await run("optional rule learning falls back to staging only when safety blocks the rule", async () => {
    const calls: boolean[] = [];
    const result = await applyReviewActionWithOptionalRule(
      true,
      async (learnRule) => {
        calls.push(learnRule);
        if (learnRule) throw Object.assign(new Error("rule blocked"), { code: "rule_blocked" });
        return "staged";
      },
      (error) => typeof error === "object" && error !== null && "code" in error && error.code === "rule_blocked"
    );

    assert.equal(result, "staged");
    assert.deepEqual(calls, [true, false]);
    await assert.rejects(
      applyReviewActionWithOptionalRule(
        false,
        async () => {
          throw new Error("save failed");
        },
        () => true
      ),
      /save failed/
    );
  });

  await run("list pagination uses a server page window and counters include handled work", () => {
    assert.deepEqual(getReviewPageWindow(2, 20), { limit: 20, offset: 20 });
    assert.deepEqual(buildReviewPagination(3, 20, 54), {
      page: 3,
      pageSize: 20,
      total: 54,
      from: 41,
      to: 54,
      pageCount: 3
    });
    assert.deepEqual(buildReviewPagination(1, 20, 0), {
      page: 1,
      pageSize: 20,
      total: 0,
      from: 0,
      to: 0,
      pageCount: 1
    });
    assert.deepEqual(
      buildPrimaryReviewSummary(8, { preparedProductCount: 3, excludedProductCount: 2 }),
      { remaining: 8, reviewed: 5, total: 13 }
    );
  });

  await run("primary prefetch and similar confirmation limits stay intentionally small", () => {
    assert.equal(REVIEW_PRIMARY_PREFETCH_SIZE, 5);
    assert.equal(REVIEW_SIMILAR_GROUP_LIMIT, 50);
  });

  const workflowSource = readFileSync("src/app/admin/(panel)/review/review-workflow.tsx", "utf8");
  const actionsSource = readFileSync("src/app/admin/(panel)/review/actions.ts", "utf8");
  const reviewSource = readFileSync("src/features/admin/review.ts", "utf8");

  await run("thin integration smoke keeps safety wiring at server boundaries", () => {
    assert.match(workflowSource, /key=\{data\.item\.reviewId\}/);
    assert.match(workflowSource, /shouldApplyReviewActionResponse\(activeReviewId\.current, actionReviewId\)/);
    assert.match(workflowSource, /advanceToPrefetchedReviewItem\(data\)/);
    assert.match(workflowSource, /loadReviewSimilarGroupInlineAction/);
    assert.match(workflowSource, /applySimilarGroupToCurrentReviewItem/);
    assert.match(workflowSource, /loadNextReviewItemInlineAction\(\{ skippedReviewQueueIds: nextSkipped \}\)/);
    assert.match(workflowSource, /Подтвердить все найденные \{similarCount\}/);
    assert.match(workflowSource, /Запомнить это решение для похожих товаров/);
    assert.doesNotMatch(workflowSource, /Шаблон правила/);
    assert.doesNotMatch(workflowSource, /window\.location|router\.refresh/);
    assert.match(workflowSource, /Этот товар уже обработан или больше не требует проверки/);
    assert.match(actionsSource, /applyReviewActionWithOptionalRule\(input\.learnRule, apply, isRuleBlocked\)/);
    assert.match(actionsSource, /Данные товара изменились\. Мы обновили карточку/);
    assert.match(actionsSource, /getAdminReviewSimilarGroupData/);
    assert.match(reviewSource, /eq\(reviewQueue\.catalogVersionId, activeVersionId\)/);
    assert.match(reviewSource, /focusItemUnavailable/);
    assert.match(reviewSource, /getReviewPageWindow\(params\.page, params\.pageSize\)/);
  });

  console.log("ok - accountant review workflow regression coverage passed");
}

function item(reviewId: string) {
  return { reviewId } as AdminReviewItem;
}

function similarGroup(reviewQueueIds: string[]): AdminReviewSimilarGroup {
  return { reviewQueueIds, count: reviewQueueIds.length };
}

function primaryData(
  currentItem: AdminReviewItem,
  prefetchedItems: AdminReviewItem[],
  similarGroup: AdminReviewSimilarGroup | null = null
): AdminReviewPrimaryData {
  return {
    categories: [],
    item: currentItem,
    prefetchedItems,
    similarGroup,
    summary: { remaining: 8, reviewed: 2, total: 10 },
    canUndo: false,
    focusItemUnavailable: false
  };
}

async function run(name: string, test: () => void | Promise<void>) {
  try {
    await test();
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

void main();
