import assert from "node:assert/strict";
import {
  hasLegacyPurchaseList,
  normalizePurchaseListIdentityIds,
  parseLegacyPurchaseListStorage,
  parsePurchaseListStorage,
  PURCHASE_LIST_STORAGE_KEY
} from "../src/features/purchase-list/storage";

const firstIdentity = "11111111-1111-4111-8111-111111111111";
const secondIdentity = "22222222-2222-4222-8222-222222222222";

run("uses the v2 storage key and keeps valid identity UUIDs in saved order", () => {
  assert.equal(PURCHASE_LIST_STORAGE_KEY, "autozap.purchase-list.v2");
  assert.deepEqual(
    normalizePurchaseListIdentityIds([
      ` ${firstIdentity.toUpperCase()} `,
      secondIdentity,
      firstIdentity,
      "not-a-uuid",
      "00000000-0000-0000-0000-000000000000",
      null
    ]),
    [firstIdentity, secondIdentity]
  );
});

run("safely handles damaged v2 JSON and invalid v2 values", () => {
  assert.deepEqual(parsePurchaseListStorage(null), []);
  assert.deepEqual(parsePurchaseListStorage("not-json"), []);
  assert.deepEqual(parsePurchaseListStorage('{"productIdentityIds":["' + firstIdentity + '"]}'), []);
  assert.deepEqual(parsePurchaseListStorage('["A-1", null, "' + firstIdentity + '"]'), [firstIdentity]);
});

run("never treats legacy v1 shopCodes as product identity UUIDs", () => {
  const legacy = '[" A-1 ", "B-2", "A-1"]';
  assert.deepEqual(parseLegacyPurchaseListStorage(legacy), ["A-1", "B-2"]);
  assert.deepEqual(parsePurchaseListStorage(legacy), []);
  assert.equal(hasLegacyPurchaseList(legacy, null, null), true);
  assert.equal(hasLegacyPurchaseList(legacy, "[]", null), false);
  assert.equal(hasLegacyPurchaseList(legacy, `["${firstIdentity}"]`, null), false);
  assert.equal(hasLegacyPurchaseList(legacy, "damaged-json", null), true);
  assert.equal(hasLegacyPurchaseList(legacy, null, "1"), false);
});

run("does not show a legacy notice for invalid or empty v1 data", () => {
  assert.deepEqual(parseLegacyPurchaseListStorage("not-json"), []);
  assert.equal(hasLegacyPurchaseList("not-json", null, null), false);
  assert.equal(hasLegacyPurchaseList("[]", null, null), false);
});

function run(name: string, test: () => void) {
  test();
  console.log(`✓ ${name}`);
}
