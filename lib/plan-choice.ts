// The plan the founder picks on the Plan screen: the recommended one, or paying on the due date. Both are plans the
// engine already worked out (`recommended` and `duePlan`), so choosing one changes no number: it only decides which of
// the two the later screens (Approve, Results) use. Plain TypeScript, no AI.

import type { EngineResult, ViewResult } from "./engine";

export type PlanChoice = "recommended" | "due_date";
export const PLAN_CHOICES: PlanChoice[] = ["recommended", "due_date"];

/** Is "Pay on the due date" a real alternative? Only when the recommendation pays early, and the due-date plan is covered. */
export function canChooseDueDate(view: ViewResult): boolean {
  return view.recommended.timing === "pay_early_for_discount" && view.duePlan.fullyCovered;
}

/**
 * The view as it is if the founder pays on the due date: the same view, with the due-date plan as the plan, no discount
 * taken, and the cash gap measured on the due date. The recommended choice returns the view untouched.
 */
export function pickPlan(view: ViewResult, choice: PlanChoice | undefined): ViewResult {
  if (choice !== "due_date" || !canChooseDueDate(view)) return view;
  return {
    ...view,
    recommended: { timing: "on_due_date", plan: view.duePlan },
    focusGap: view.gap,
    loan: view.duePlan.borrowed,
    discount: { ...view.discount, discountAmount: 0, extraFundingCost: 0, netSaving: 0, worthIt: false },
  };
}

/** The whole engine result with the choice applied to the recommended view, for screens that read `result`. */
export function pickResult(result: EngineResult, choice: PlanChoice | undefined): EngineResult {
  if (choice !== "due_date" || !canChooseDueDate(result.recommended)) return result;
  const picked = pickPlan(result.recommended, choice);
  return {
    ...result,
    recommended: picked,
    views: { ...result.views, [result.recommendedView === "right_sized" ? "rightSized" : "keepFull"]: picked },
  };
}
