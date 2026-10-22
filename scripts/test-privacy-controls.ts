import assert from "node:assert/strict";
import { analyticsPresentation } from "../src/features/privacy/analytics-presentation";
const cases = [
  [false, false, "off", "Сейчас аналитика отключена"],
  [false, true, "pending", "Аналитика будет включена после сохранения"],
  [true, true, "on", "Сейчас аналитика включена"],
  [true, false, "pending", "Аналитика будет отключена после сохранения"]
] as const;
for (const [saved, draft, state, text] of cases) {
  assert.deepEqual(analyticsPresentation(saved, draft, true), { checked: draft, state, text });
  assert.deepEqual(analyticsPresentation(saved, draft, false), { checked: false, state: "off", text: "Сейчас аналитика отключена" });
}
console.log("Privacy controls: four saved/draft states and unavailable counter passed");
