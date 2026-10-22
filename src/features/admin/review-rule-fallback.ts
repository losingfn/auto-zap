/**
 * A categorization decision must still be staged when optional rule learning
 * is rejected by its safety checks. The caller decides which error is a safe
 * fallback; all other failures remain visible to the normal error handling.
 */
export async function applyReviewActionWithOptionalRule<T>(
  learnRule: boolean,
  apply: (learnRule: boolean) => Promise<T>,
  isRuleBlocked: (error: unknown) => boolean
) {
  try {
    return await apply(learnRule);
  } catch (error) {
    if (!learnRule || !isRuleBlocked(error)) throw error;
    return apply(false);
  }
}
