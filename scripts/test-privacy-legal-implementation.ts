import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { archivedAnalyticsConsents, archivedConsent } from "../src/features/privacy/consent-archive";
import { analyticsConsentText, analyticsConsentVersion } from "../src/features/privacy/consent-content";
import { privacyPolicySections } from "../src/app/privacy/policy-content";
import { PrivacyCoordinator, PrivacyRequestError, PRIVACY_INTENT_KEY, PRIVACY_OPERATION_PREFIX } from "../src/features/privacy/coordinator";
import { PRIVACY_STORAGE_KEY, twelveMonthsAfter } from "../src/features/privacy/domain";
import { fixture } from "./test-privacy-lifecycle";

const check = async (name: string, work: () => unknown, scope: "consent" | "policy" = "consent") => {
  if (scope === "policy" && process.argv.includes("--consent-only")) {
    console.log(`SKIP ${name} (--consent-only)`); return;
  }
  await work(); console.log(`PASS ${name}`);
};
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

// Outline of the current approved /privacy source, including the operator table.
// These are document regression expectations, not additional legal requirements.
const policyOutline = [
  ["Общие положения", 5],
  ["Какие данные обрабатываются", 6],
  ["Цели и основания обработки", 6],
  ["Cookie и данные в браузере", 4],
  ["Яндекс.Метрика", 5],
  ["Яндекс.Карты", 4],
  ["Получатели данных", 6],
  ["Сроки хранения и прекращение обработки", 8],
  ["Защита персональных данных", 2],
  ["Права субъектов персональных данных", 4],
  ["Изменение Политики", 2],
  ["Сведения об операторе", 8]
] as const;
const operatorDetails = [
  ["Оператор:", "индивидуальный предприниматель Корженков Владислав Евгеньевич."],
  ["ИНН:", "507800025699."],
  ["ОГРНИП:", "304501033700132."],
  ["Магазин:", "«Автозапчасти на Салтыкова-Щедрина»."],
  ["Адрес магазина и приёма письменных обращений:", "Московская область, г. Талдом, ул. Салтыкова-Щедрина, д. 19."],
  ["Телефон:", "8-496-206-33-04."],
  ["Электронная почта по вопросам персональных данных:", "auto-zapchast.taldom@rambler.ru."],
  ["Сайт:", "autozapchast-taldom.ru."]
] as const;
type Policy = typeof privacyPolicySections;
const clauseText = (clause: Policy[number]["clauses"][number]) => clause.blocks
  .map(block => block.type === "paragraph" ? block.text : block.items.join("\n")).join("\n");

function assertPolicyStructure(sections: Policy) {
  assert.deepEqual(sections.map(section => [section.number, section.title]),
    policyOutline.map(([title], index) => [index + 1, title]), "Section order and titles must match the current document");
  const ids = sections.flatMap(section => section.clauses.map(clause => clause.number));
  assert.equal(new Set(ids).size, ids.length, "Clause IDs must be unique across the document");
  for (const [index, section] of sections.entries()) {
    assert.deepEqual(section.clauses.map(clause => clause.number),
      Array.from({ length: policyOutline[index][1] }, (_, point) => `${section.number}.${point + 1}`),
      `Section ${section.number}: clause IDs must be complete, sequential and use their section prefix`);
    for (const clause of section.clauses) {
      assert.ok(clause.blocks.length > 0, `${clause.number}: content blocks must not be empty`);
      for (const block of clause.blocks) {
        const texts = block.type === "paragraph" ? [block.text] : block.items;
        assert.ok(texts.length > 0, `${clause.number}: list must not be empty`);
        for (const text of texts) {
          assert.ok(text.trim().length > 0, `${clause.number}: text must not be empty`);
          assert.equal(text, text.trim(), `${clause.number}: no stray outer whitespace`);
        }
      }
      if (section.number !== 12) {
        assert.equal(clause.blocks[0].type, "paragraph", `${clause.number}: renderer needs an opening numbered paragraph`);
        assert.doesNotMatch(clauseText(clause), new RegExp(`^${clause.number.replace(".", "\\.")}\\.\\s`),
          `${clause.number}: content must not duplicate the renderer's automatic number`);
      }
    }
  }
  // page.tsx renders only the first paragraph of each details row as label/value.
  // Extra blocks or a missing newline could otherwise silently hide operator data.
  assert.deepEqual(sections[11].clauses.map(clause => clause.blocks), operatorDetails.map(([label, value]) => [
    { type: "paragraph", text: `${label}\n${value}` }
  ]), "Operator details must preserve all eight complete label/value rows");
}

function assertPolicyReferences(sections: Policy, consent: string) {
  const bySection = new Map(sections.map(section => [section.number, section]));
  const byClause = new Map(sections.flatMap(section => section.clauses.map(clause => [clause.number, clause] as const)));
  const selfReferences = sections.flatMap(section => section.clauses.flatMap(clause =>
    [...clauseText(clause).matchAll(/в разделе (\d+)/g)].map(match => ({ from: clause.number, target: Number(match[1]) }))));
  for (const { target } of selfReferences) assert.ok(bySection.has(target), `Unknown Policy section ${target}`);
  assert.deepEqual(selfReferences, [
    { from: "1.2", target: 12 }, { from: "3.6", target: 6 }, { from: "10.3", target: 12 }
  ], "Keep operator/contact references in 1.2/10.3 and the Maps reference in 3.6");

  const consentReferences = [...consent.matchAll(/в пунктах (\d+\.\d+) и (\d+\.\d+) Политики/g)];
  assert.equal(consentReferences.length, 1, "Consent must retain its Policy basis/retention reference");
  const targets = consentReferences[0].slice(1);
  for (const target of targets) assert.ok(byClause.has(target), `Unknown Policy clause ${target}`);
  assert.deepEqual(targets, ["3.2", "8.3"], "Consent must refer to choice-processing basis and proof retention");
  assert.match(clauseText(byClause.get("3.2")!), /Данные о выборе настроек конфиденциальности/);
  assert.match(clauseText(byClause.get("8.3")!), /Сведения о предоставлении согласия, отказе или отзыве/);
  const mapReferences = [...consent.matchAll(/разделе (\d+) Политики/g)].map(match => Number(match[1]));
  for (const target of mapReferences) assert.ok(bySection.has(target), `Unknown Policy section ${target}`);
  assert.deepEqual(mapReferences, [6], "Consent must refer to the actual Maps section");
}

async function main() {
  await check("exact archived old/candidate revisions; content-addressed IDs and no fabricated validity intervals", () => {
    assert.equal(archivedAnalyticsConsents.length, 4);
    for (const entry of archivedAnalyticsConsents) {
      assert.equal(entry.version, "sha256:" + createHash("sha256").update(entry.text).digest("hex"));
      assert.equal(archivedConsent(entry.version), entry); assert.equal(entry.publicationInterval, null);
    }
    assert.equal(archivedConsent(analyticsConsentVersion).text, analyticsConsentText);
    assert.equal(archivedConsent("sha256:f801a44356ed08df59a848e25c006cd540e74efcf4a4dd08c50dd29057095d82").status, "captured-existing-local-source");
    assert.throws(() => archivedConsent("sha256:unknown"));
  });
  await check("prepared pre-editorial consent remains archived; current keeps 10 sections without public dates", async () => {
    const prepared = (await readFile("artifacts/privacy-legal-final/02-analytics-consent-final.md", "utf8"))
      .split("# СОГЛАСИЕ")[1].replace(/<a id="[^"]+"><\/a>/g, "").replace(/^## /gm, "");
    const beforeEditorial = archivedConsent("sha256:fb04265427e62aa06f973097cfce9908925a25e8c077b244be16d56724d97a19");
    assert.equal(normalize(beforeEditorial.text), normalize(("СОГЛАСИЕ" + prepared)
      .replace("в пунктах 3.5 и 8.2 Политики", "в пунктах 3.2 и 8.3 Политики")));
    assert.equal(analyticsConsentText.match(/^\d+\. /gm)?.length, 10);
    assert.doesNotMatch(analyticsConsentText, /Служебная помета|2026|Дата редакции/);
  });
  await check("approved editorial revision has its own exact hash and only the authorized replacements", () => {
    assert.equal(analyticsConsentVersion, "sha256:5223be25807dee522acde9e3ead5060d86092678ddbf6949d7eeca79e9e2a550");
    let expected = archivedConsent("sha256:fb04265427e62aa06f973097cfce9908925a25e8c077b244be16d56724d97a19").text;
    const replacements = [
      ["До предоставления согласия посетитель может открыть «Настроить» в первоначальном уведомлении, затем «Прочитать полное согласие». Документ открывается на странице /privacy/analytics-consent в новой вкладке; исходное окно настроек сохраняется.", "До предоставления согласия посетитель может ознакомиться с его полным текстом через раздел «Настройки конфиденциальности»."],
      [" Переходы с параметрами адреса, недопустимыми фрагментами или источниками перехода также могут исключать запуск.", ""],
      ["Использование браузерного расширения не является обязательным условием отказа от веб-аналитики на Сайте.\n\nПосетитель вправе в любое время отозвать согласие непосредственно через раздел «Настройки конфиденциальности» в порядке, предусмотренном разделом 8 настоящего согласия.", "Браузерное расширение является дополнительным средством ограничения веб-аналитики. Отозвать согласие можно через раздел «Настройки конфиденциальности» в порядке, предусмотренном разделом 8 настоящего согласия."],
      ["Указанные действия подтверждают согласие посетителя на использование сервиса «Яндекс.Метрика» в пределах целей, категорий данных и способов обработки, предусмотренных настоящим согласием.\n\n", ""],
      ["Согласие на веб-аналитику не является обязательным условием использования Сайта.\n\n", ""]
    ];
    for (const [before, after] of replacements) {
      assert.equal(expected.split(before).length, 2);
      expected = expected.replace(before, after);
    }
    assert.equal(analyticsConsentText, expected);
    assert.doesNotMatch(analyticsConsentText, / {2}|\n{3}/);
    assert.match(analyticsConsentText, /Предоставление Согласия не является обязательным условием использования Сайта\./);
    assert.match(analyticsConsentText, /в пунктах 3\.2 и 8\.3 Политики/);
    const clause = (number: string) => privacyPolicySections.flatMap(section => section.clauses).find(item => item.number === number)!.blocks[0];
    assert.deepEqual(clause("4.1"), { type: "paragraph", text: "Для работы отдельных функций Сайта используются файлы cookie и хранилища браузера. Они обеспечивают сохранение списка покупок, настроек конфиденциальности, возврат к ранее открытой странице и работу административной части." });
    assert.deepEqual(clause("7.6"), { type: "paragraph", text: "При сборе персональных данных граждан Российской Федерации с использованием баз данных должны соблюдаться установленные законодательством требования к их локализации на территории Российской Федерации." });
  });
  await check("current Policy: complete section outline, sequential clauses, nonempty content and operator rows", () => {
    assertPolicyStructure(privacyPolicySections);
    const numbered = privacyPolicySections.filter(section => section.number !== 12)
      .reduce((count, section) => count + section.clauses.length, 0);
    console.log(`Policy structure: ${privacyPolicySections.length} sections, ${numbered} numbered clauses, ${privacyPolicySections[11].clauses.length} operator rows`);
  }, "policy");
  await check("current Policy and consent references resolve to the actual sections and clauses", () => {
    assertPolicyReferences(privacyPolicySections, analyticsConsentText);
  }, "policy");
  await check("Policy validators reject missing/duplicate/misnumbered content, damaged details and dangling references", () => {
    const copy = () => privacyPolicySections.map(section => ({ ...section,
      clauses: section.clauses.map(clause => ({ ...clause, blocks: [...clause.blocks] })) }));
    assert.throws(() => assertPolicyStructure(privacyPolicySections.slice(1)), /Section order and titles/);
    const missing = copy(); missing[7].clauses.pop();
    assert.throws(() => assertPolicyStructure(missing), /clause IDs must be complete/);
    const duplicate = copy(); duplicate[1].clauses[1].number = "2.1";
    assert.throws(() => assertPolicyStructure(duplicate), /Clause IDs must be unique/);
    const wrongPrefix = copy(); wrongPrefix[2].clauses[0].number = "30.1";
    assert.throws(() => assertPolicyStructure(wrongPrefix), /clause IDs must be complete/);
    const empty = copy(); empty[0].clauses[0].blocks[0] = { type: "paragraph", text: "" };
    assert.throws(() => assertPolicyStructure(empty), /text must not be empty/);
    const details = copy(); details[11].clauses[6].blocks[0] = { type: "paragraph", text: "Электронная почта по вопросам персональных данных:" };
    assert.throws(() => assertPolicyStructure(details), /Operator details must preserve/);
    assert.throws(() => assertPolicyReferences(privacyPolicySections,
      analyticsConsentText.replace("в пунктах 3.2 и 8.3 Политики", "в пунктах 99.2 и 8.3 Политики")), /Unknown Policy clause 99\.2/);
  }, "policy");
  await check("grant event references exact archived candidate; changed revision cannot authorize a previous grant", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); assert.equal(await tab.save(true), true);
    const event = f.events[0]; assert.equal(archivedConsent(event.documentVersion!).text, analyticsConsentText);
    const changed = new PrivacyCoordinator({ storage: f.storage, now: Date.now, id: randomUUID, stop() {}, changed() {}, request: f.request }, "new-revision", true);
    await changed.synchronize(); assert.equal(changed.isAuthorized(), false);
    assert.equal(event.documentVersion, analyticsConsentVersion);
  });
  await check("historical reference fix is preserved; pre-editorial grants require a new explicit consent and stay immutable", async () => {
    const referenceVersion = "sha256:68c4940ac114864a8ea1c01c84a3a9a523883c91502dfe2a1e5ce914f57d774f";
    const previousVersion = "sha256:fb04265427e62aa06f973097cfce9908925a25e8c077b244be16d56724d97a19";
    const previous = archivedConsent(previousVersion);
    const from = "Основания и критерии хранения определены в пунктах 3.5 и 8.2 Политики";
    const to = "Основания и критерии хранения определены в пунктах 3.2 и 8.3 Политики";
    const referenceSource = archivedConsent(referenceVersion).text;
    assert.equal(referenceSource.split(from).length, 2);
    assert.equal(previous.text, referenceSource.replace(from, to));
    assert.notEqual(analyticsConsentVersion, previousVersion);
    assert.equal(analyticsConsentText.includes(from), false);

    const f = fixture();
    const receipt = await f.request<{ receiptId: string; expiresAt: number }>({ action: "prepare" });
    f.events.push({ receiptId: receipt.receiptId, receiptExpiresAt: receipt.expiresAt, expiresAt: receipt.expiresAt,
      operationId: randomUUID(), kind: "grant", documentVersion: previousVersion });
    const oldEvent = JSON.stringify(f.events[0]);
    f.storage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify({ version: 1, decision: "granted",
      receiptId: receipt.receiptId, expiresAt: receipt.expiresAt, documentVersion: previousVersion }));
    const tab = f.tab(); await tab.synchronize();
    assert.equal(tab.isAuthorized(), false, "Old revision must not authorize the new one");
    assert.equal(f.events.length, 1, "Synchronization must not create consent");
    assert.equal(tab.snapshot.choice!.documentVersion, previousVersion);
    await assert.rejects(f.request({ action: "grant", receiptId: receipt.receiptId,
      operationId: randomUUID(), documentVersion: previousVersion }),
    (error: unknown) => error instanceof PrivacyRequestError && error.code === "analytics_unavailable");
    assert.equal(JSON.stringify(f.events[0]), oldEvent);

    assert.equal(await tab.save(false), true);
    assert.equal(f.events.at(-1)!.kind, "revoke");
    assert.equal(f.events.at(-1)!.receiptId, receipt.receiptId);
    assert.equal(JSON.stringify(f.events[0]), oldEvent, "Withdrawal must not rewrite the old grant");
    assert.equal(await tab.save(true), true);
    const renewed = f.events.at(-1)!;
    assert.equal(renewed.kind, "grant"); assert.equal(renewed.documentVersion, analyticsConsentVersion);
    assert.notEqual(renewed.receiptId, receipt.receiptId);
    assert.equal(tab.isAuthorized(), true);
    assert.equal(archivedConsent(renewed.documentVersion!).text, analyticsConsentText);
    assert.equal(JSON.stringify(f.events[0]), oldEvent);
    assert.equal(archivedConsent(previousVersion).text, previous.text);
  });
  await check("expired blocked outbox retires both lanes; a NEW explicit grant gets a fresh receipt", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true);
    const old = f.events[0].receiptId; f.cookies.clear(); assert.equal(await tab.save(false), false);
    const key = `${PRIVACY_OPERATION_PREFIX}${old}.withdraw`;
    f.storage.setItem(key, JSON.stringify({ ...JSON.parse(f.storage.getItem(key)!), expiresAt: Date.now() - 1, blocked: true }));
    f.events[0].expiresAt = Date.now() - 1;
    assert.equal(await tab.save(true), true); assert.notEqual(f.events.at(-1)!.receiptId, old);
    assert.equal(f.storage.getItem(key), null); assert.equal(tab.hasPending(), false);
    assert.equal(tab.isAuthorized(), true);
    assert.equal(f.events.filter(event => event.receiptId === old).length, 1, "No fictitious revoke ACK or historical relabeling");
  });
  await check("expired withdrawal does not renew itself from the newer negative-choice expiry", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true); const old = f.events[0].receiptId;
    f.cookies.clear(); assert.equal(await tab.save(false), false);
    const key = `${PRIVACY_OPERATION_PREFIX}${old}.withdraw`;
    f.storage.setItem(key, JSON.stringify({ ...JSON.parse(f.storage.getItem(key)!), expiresAt: Date.now() - 1 }));
    f.events[0].expiresAt = Date.now() - 1;
    await tab.retry(); assert.equal(tab.hasPending(), false); assert.equal(tab.isAuthorized(), false);
    assert.equal(tab.snapshot.choice!.decision, "declined"); assert.notEqual(tab.snapshot.choice!.receiptId, old);
    assert.equal(f.events.at(-1)!.kind, "decline");
    const reloaded = f.tab(); await reloaded.synchronize(); assert.equal(reloaded.isAuthorized(), false);
    assert.equal(reloaded.hasPending(), false); assert.equal(f.storage.getItem(key), null);
  });
  await check("unexpired terminal withdrawal stays blocking; automatic retry never grants", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true); f.cookies.clear();
    assert.equal(await tab.save(false), false); const grantCount = f.events.filter(e => e.kind === "grant").length;
    await tab.retry(); assert.equal(await tab.save(true), false); assert.equal(tab.isAuthorized(), false);
    assert.equal(tab.hasPending(), true); assert.equal(f.events.filter(e => e.kind === "grant").length, grantCount);
    assert.equal(JSON.parse(f.storage.getItem(PRIVACY_INTENT_KEY)!).grant, true); // Explicit attempt still cannot bypass live outbox.
  });
  await check("local and server expiry never silently extend on return/offline retry", async () => {
    const f = fixture(), tab = f.tab(); await tab.synchronize(); await tab.save(true);
    const local = JSON.parse(f.storage.getItem(PRIVACY_STORAGE_KEY)!); const expiry = local.expiresAt;
    await tab.synchronize(); assert.equal(JSON.parse(f.storage.getItem(PRIVACY_STORAGE_KEY)!).expiresAt, expiry);
    local.expiresAt = Date.now() - 1; f.storage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(local)); f.outage(true);
    await tab.synchronize(); assert.equal(tab.isAuthorized(), false); await tab.retry(); assert.equal(tab.isAuthorized(), false);
    assert.equal(twelveMonthsAfter(Date.UTC(2024, 1, 29)), Date.UTC(2025, 1, 28));
  });
  console.log("Legal/content/queue checks passed. Journal is in-memory; these checks do not assert PostgreSQL behavior.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
