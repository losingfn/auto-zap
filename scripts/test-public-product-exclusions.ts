import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  DISPUTED_GAZ_PRODUCT_SLUGS,
  PUBLIC_BRAND_EXCLUSION_PATTERN,
  isRestrictedPublicProduct,
  publicProductExclusionCondition
} from "../src/features/catalog/public-product-exclusions";

const blocked = [
  "Каретка боковой двери Газ-2705", "Шпонка коленвала ГАЗ", "Коллектор ГАЗ53",
  "Винт коромысла Газель Бизнес дв. 4216", "Щуп масляный Газель NEXT",
  "Запчасть NAZ", "Деталь НАЗ", "Кран GAZ-3302", "Кран GАZ 3302",
  "Фара для Газели", "Бампер GAZelle", "Крыло Волга", "Ручка Соболь NN",
  "Насос ВАЛДАЙ", "Деталь ГАЗОН NEXT", "Деталь G-PART", "Деталь G PART",
  "Фара Садко", "Фара Баргузин", "Фара Сайбер", "Фара Чайка",
  "Фара Победа", "Фара Ермак", "Фара Вепрь", "Фара Земляк",
  "Фара Атаман", "Фара Трофим", "Фара Комбат", "Фара Полуторка",
  "Фара Hyundai Solaris", "Фара Хёндай", "Фара Хендэ", "Фара KIA RIO", "Фара Киа",
  "Фара КамАЗ", "Фара KAMAZ", "Тормоз WABCO", "Тормоз ВАБКО", "Фара BMW", "Фара БМВ",
  "Фара BMW3", "Фара BMWX5", "Фара Mitsubishi", "Фара Мицубиси", "Фара Митсубиши",
  "Масло Лукойл", "Масло LUKOIL", "Крыло Солярис", "Фара Рио", "Насос Спектра", "Дверь Спортейдж", "Фара Лансер",
  "Фара Аутлендер", "Прокладка L200", "Коврик Паджеро"
];
const allowed = [
  "Педаль газа", "Трос газа УАЗ", "Газонокосилка", "Магазин запчастей",
  "Название детали", "Размер 53 x 24", "Шланг 3302 мм", "Насос ЗМЗ 406",
  "Винт УМЗ 4216", "Набор Business NEXT NN", "Фара Toyota Corolla",
  "Фара Nissan", "Фара Ford", "Свеча NGK", "Деталь МАЗ", "Болт G 12"
];

for (const name of blocked) assert.equal(isRestrictedPublicProduct({ name }), true, name);
for (const name of allowed) assert.equal(isRestrictedPublicProduct({ name }), false, name);
assert.equal(DISPUTED_GAZ_PRODUCT_SLUGS.length, 21);
assert.equal(new Set(DISPUTED_GAZ_PRODUCT_SLUGS).size, 21);
for (const slug of DISPUTED_GAZ_PRODUCT_SLUGS) {
  assert.equal(isRestrictedPublicProduct({ name: "Переименованная деталь", slug }), true, slug);
}
assert.equal(isRestrictedPublicProduct({ name: "Каретка", rawName: "Деталь для ГАЗ 2705" }), true);
assert.equal(isRestrictedPublicProduct({ name: "Каретка", slug: "new-gazel-next" }), true);
assert.equal(isRestrictedPublicProduct({}), false);

const query = new PgDialect().sqlToQuery(publicProductExclusionCondition());
assert.ok(query.sql.includes('"products"."raw_name"'));
assert.ok(query.sql.includes("!~*"));
assert.equal(query.params.at(-1), PUBLIC_BRAND_EXCLUSION_PATTERN);
assert.equal(query.params.length, 22);
assert.ok(!query.sql.includes(DISPUTED_GAZ_PRODUCT_SLUGS[0]));
console.log(`Public exclusions: ${blocked.length} blocked, ${allowed.length} retained, 21 exact routes; parameterized SQL verified.`);
