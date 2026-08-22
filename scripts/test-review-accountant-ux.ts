import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appendTemporarilySkippedReviewId,
  createIsolatedReviewFormState,
  shouldApplyReviewActionResponse
} from "../src/features/admin/review-form-state";
import { applyReviewActionWithOptionalRule } from "../src/features/admin/review-rule-fallback";
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
    assert.match(workflowSource, /Подтвердить все найденные \{similarCount\}/);
    assert.match(workflowSource, /Запомнить это решение для похожих товаров/);
    assert.doesNotMatch(workflowSource, /Шаблон правила/);
    assert.doesNotMatch(workflowSource, /window\.location|router\.refresh/);
    assert.match(workflowSource, /Этот товар уже обработан или больше не требует проверки/);
    assert.match(actionsSource, /applyReviewActionWithOptionalRule\(input\.learnRule, apply, isRuleBlocked\)/);
    assert.match(actionsSource, /Данные товара изменились\. Мы обновили карточку/);
    assert.match(reviewSource, /eq\(reviewQueue\.catalogVersionId, activeVersionId\)/);
    assert.match(reviewSource, /focusItemUnavailable/);
    assert.match(reviewSource, /getReviewPageWindow\(params\.page, params\.pageSize\)/);
  });

  console.log("ok - accountant review workflow regression coverage passed");
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
