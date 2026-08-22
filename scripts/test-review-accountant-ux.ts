import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createIsolatedReviewFormState } from "../src/features/admin/review-form-state";

const first = createIsolatedReviewFormState({
  reviewId: "review-gubka",
  suggestedCategoryId: "accessories",
  suggestedSubcategoryId: "car-care",
  currentCategoryId: null,
  currentSubcategoryId: null
});
const next = createIsolatedReviewFormState({
  reviewId: "review-air-intake",
  suggestedCategoryId: null,
  suggestedSubcategoryId: null,
  currentCategoryId: null,
  currentSubcategoryId: null
});

assert.deepEqual(first, {
  reviewId: "review-gubka",
  categoryId: "accessories",
  subcategoryId: "car-care",
  learnRule: false,
  identityDecision: null
});
assert.deepEqual(next, {
  reviewId: "review-air-intake",
  categoryId: "",
  subcategoryId: "",
  learnRule: false,
  identityDecision: null
});
assert.notEqual(first.reviewId, next.reviewId);

const workflowSource = readFileSync("src/app/admin/(panel)/review/review-workflow.tsx", "utf8");
const actionsSource = readFileSync("src/app/admin/(panel)/review/actions.ts", "utf8");
const reviewSource = readFileSync("src/features/admin/review.ts", "utf8");

assert.match(workflowSource, /key=\{data\.item\.reviewId\}/);
assert.match(workflowSource, /const prefetchedItem = data\.prefetchedItems\[0\]/);
assert.match(workflowSource, /Запомнить это решение для похожих товаров/);
assert.doesNotMatch(workflowSource, /Шаблон правила/);
assert.doesNotMatch(workflowSource, /window\.location|router\.refresh/);
assert.match(actionsSource, /export async function confirmReviewItemInlineAction/);
assert.match(actionsSource, /export async function confirmReviewGroupInlineAction/);
assert.match(actionsSource, /Данные товара изменились\. Мы обновили карточку/);
assert.match(reviewSource, /const REVIEW_PRIMARY_PREFETCH_SIZE = 5/);
assert.match(reviewSource, /primary_review_rows_enrichment/);

const inlineItemAction = between(
  actionsSource,
  "export async function confirmReviewItemInlineAction",
  "export async function confirmReviewGroupInlineAction"
);
assert.doesNotMatch(inlineItemAction, /redirect\(/);

console.log("ok - review form state is isolated and inline review flow stays lightweight");

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}
