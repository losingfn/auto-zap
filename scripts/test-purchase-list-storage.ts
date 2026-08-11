import assert from "node:assert/strict";
import {
  normalizePurchaseListCodes,
  parsePurchaseListStorage
} from "../src/features/purchase-list/storage";

run("keeps valid product codes in their saved order and removes duplicates", () => {
  assert.deepEqual(
    normalizePurchaseListCodes([" A-1 ", "B-2", "A-1", "", 12, "C-3"]),
    ["A-1", "B-2", "C-3"]
  );
});

run("safely handles invalid and legacy storage values", () => {
  assert.deepEqual(parsePurchaseListStorage(null), []);
  assert.deepEqual(parsePurchaseListStorage("not-json"), []);
  assert.deepEqual(parsePurchaseListStorage('{"shopCodes":["A-1"]}'), []);
  assert.deepEqual(parsePurchaseListStorage('["A-1", "A-1", null, " B-2 "]'), ["A-1", "B-2"]);
});

function run(name: string, test: () => void) {
  test();
  console.log(`✓ ${name}`);
}
