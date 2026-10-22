import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import { analyticsConsentText } from "../src/features/privacy/consent-content";
const base = process.env.PRIVACY_TEST_BASE_URL || "http://127.0.0.1:3109";
const out = path.resolve(process.env.PRIVACY_TEST_OUTPUT_DIR || "artifacts/privacy-controls");
const key = "autozap.privacy-choice.v1";
const normalized = (s: string) => s.replace(/\s+/g, " ").trim();
async function stable(page: Page) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1200); }
async function watermark(page: Page, text: string) {
  await page.evaluate(text => {
    const label = document.createElement("div"); label.dataset.visualModel = "true"; label.textContent = text;
    label.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999999;background:#fff;color:#111;text-align:center;font:14px Arial;padding:8px;pointer-events:none";
    document.body.append(label);
  }, text);
}
async function main() {
  await mkdir(path.join(out, "visual-mocks"), { recursive: true });
  const browser = await chromium.launch({headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  const context = await browser.newContext({ viewport: { width:1440, height:900 }, deviceScaleFactor:1 });
  const errors: string[] = [], consoleErrors: string[] = [], sdk: string[] = [], scenarios: string[] = [], widths: unknown[] = [], posts: string[] = [];
  context.on("page", page => {
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if(m.type()==="error") consoleErrors.push(m.text()); });
    page.on("request", r => {
      if(r.frame() === page.mainFrame() && /mc\.yandex\.[^/]+\/metrika\/tag\.js/.test(r.url())) sdk.push(r.url());
      if(r.url().endsWith("/api/privacy-consent") && r.method()==="POST") posts.push(r.postDataJSON().action);
    });
  });
  const page = await context.newPage();
  const banner = page.locator("[data-privacy-banner]"), dialog = page.getByRole("dialog"), notice = page.locator("[data-privacy-saved-notice]");
  const footerSettings = page.locator('footer a[href="#privacy-settings"]');
  const save = () => dialog.getByRole("button", { name: "Сохранить настройки", exact:true });
  try {
    await context.addInitScript(origin => { if(location.origin!==origin) return; try { if(!sessionStorage.getItem("test-seeded")) { sessionStorage.setItem("autozap.privacy-banner-dismissed.v1", "1"); sessionStorage.setItem("test-seeded", "1"); sessionStorage.setItem("autozap:privacy-document-transition:v1", "unrelated-sentinel"); } } catch { /* Opaque/sandboxed documents do not have session storage. */ } },new URL(base).origin);
    await page.goto(base, {waitUntil:"domcontentloaded"}); await banner.waitFor(); await stable(page);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("autozap.privacy-banner-dismissed.v1")), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("autozap:privacy-document-transition:v1")), "unrelated-sentinel");
    for(const [width,height] of [[320,720],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[390,360],[768,360],[1440,360]]) {
      await page.setViewportSize({width,height});
      assert.equal(await page.locator(":modal").count(),0);
      assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await banner.getByRole("button").count(),3);
      assert.equal(await banner.getByRole("link").count(),1);
      assert.equal(await banner.getByRole("link").getAttribute("href"), "/privacy");
      assert.equal(await banner.getByRole("button",{name:"Принять",exact:true}).isDisabled(),true);
      const buttons = await banner.getByRole("button").allTextContents(); assert.deepEqual(buttons,["Принять","Только необходимые","Настроить"]);
      const box = await banner.boundingBox(); assert.ok(box); assert.ok(box.y>=0 && box.y+box.height<=height);
      if(width<640) {
        const a = await banner.getByRole("button",{name:"Принять",exact:true}).boundingBox();
        const b = await banner.getByRole("button",{name:"Только необходимые",exact:true}).boundingBox();
        const c = await banner.getByRole("button",{name:"Настроить",exact:true}).boundingBox();
        assert.ok(a&&b&&c&&a.y<b.y&&b.y<c.y); assert.equal(a!.width,b!.width); assert.equal(b!.width,c!.width);
      }
      // At short heights the notice itself scrolls; its last action must still be reachable.
      await banner.getByRole("button",{name:"Настроить",exact:true}).scrollIntoViewIfNeeded();
      assert.ok(await banner.getByRole("button",{name:"Настроить",exact:true}).isVisible());
      widths.push({width,height,bounds:box});
      await page.screenshot({path:path.join(out,`banner-${width}x${height}.png`)});
    }
    scenarios.push("Legacy dismissal retired; unrelated navigation key preserved; 7 widths plus short-height nonmodal layouts");
    await page.setViewportSize({width:1440,height:900});
    await page.mouse.wheel(0,500); await page.waitForTimeout(200); assert.ok(await page.evaluate(()=>scrollY)>0);
    await page.keyboard.press("Escape"); await page.mouse.click(20,200); assert.ok(await banner.isVisible());
    await banner.getByRole("link").click(); await page.waitForURL("**/privacy"); assert.ok(await banner.isVisible());
    await page.goBack(); await page.waitForURL(base+"/"); await banner.waitFor();
    scenarios.push("Scroll, outside click, Escape, policy navigation and Back retain the banner");
    await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));
    await banner.getByRole("button",{name:"Настроить",exact:true}).click(); await dialog.waitFor();
    assert.equal(await banner.count(),0); assert.equal(await page.locator(":modal").count(),1);
    assert.equal(await dialog.getByRole("switch").isDisabled(),true); assert.equal(await dialog.getByRole("switch").isChecked(),false);
    assert.equal(await dialog.locator("#privacy-analytics-state").innerText(),"Сейчас аналитика отключена");
    assert.equal(await dialog.getByText("Включение аналитики временно недоступно",{exact:true}).count(),0);
    assert.equal(await dialog.getByRole("button").count(),2); // Close + Save
    for(const [width,height] of [[1440,900],[390,844],[320,720],[375,812],[430,932],[768,1024],[1024,768],[390,360],[390,1200]]) {
      await page.setViewportSize({width,height}); await stable(page);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await save().scrollIntoViewIfNeeded(); assert.ok(await save().isVisible());
      await page.screenshot({path:path.join(out,`settings-${width}x${height}.png`)});
    }
    await page.setViewportSize({width:1440,height:900});
    const sourceChoice = await page.evaluate(key=>localStorage.getItem(key),key);
    const sourceSwitch = await dialog.getByRole("switch").isChecked();
    const postCount = posts.length;
    const popupEvent = page.waitForEvent("popup");
    await dialog.getByRole("link",{name:"Прочитать полное согласие"}).click();
    const popup = await popupEvent;
    await popup.waitForURL("**/privacy/analytics-consent");
    const doc=popup.locator("[data-consent-text]"); await doc.waitFor();
    assert.equal(await doc.locator("h2").count(),10); assert.equal(normalized(await doc.innerText()),normalized(analyticsConsentText));
    assert.equal(await popup.locator(":modal").count(),0);
    assert.equal(await popup.evaluate(()=>window.opener===null),true);
    await popup.close(); await page.bringToFront();
    assert.equal(await dialog.isVisible(),true); assert.equal(await dialog.getByRole("switch").isChecked(),sourceSwitch);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),sourceChoice); assert.equal(posts.length,postCount);
    await page.keyboard.press("Escape"); await banner.waitFor();
    scenarios.push("Settings unchanged; full ten-section consent opens separate tab with noopener, no registration and source switch/choice preserved");

    // Hold the real prepare request to prove dismissal/local persistence occur before a network response.
    let release: (()=>void) | undefined;
    const held = new Promise<void>(resolve=>{release=resolve;});
    await page.route("**/api/privacy-consent",async route=>{ if(route.request().postDataJSON()?.action === "prepare") await held; await route.continue(); });
    const failure = page.waitForResponse(r=>r.url().endsWith("/api/privacy-consent")&&r.status()===503);
    await banner.getByRole("button",{name:"Только необходимые",exact:true}).click();
    assert.equal(await banner.count(),0);
    const pendingBefore = await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
    assert.equal(pendingBefore.decision,"declined"); assert.ok(pendingBefore.pending); assert.equal(pendingBefore.receiptId,null);
    release!(); await failure; await page.waitForTimeout(100);
    assert.equal(await dialog.count(),0); assert.equal(await notice.count(),0);
    await page.unroute("**/api/privacy-consent");
    await page.reload({waitUntil:"domcontentloaded"}); await stable(page); assert.equal(await banner.count(),0);
    scenarios.push("Real DB 503: banner refusal hides/persists BEFORE response, no error modal/toast, remains hidden after reload");

    await footerSettings.click(); await dialog.waitFor();
    await save().click(); await dialog.getByText("Не удалось сохранить настройки. Попробуйте ещё раз.",{exact:true}).waitFor();
    assert.equal(await save().isEnabled(),true); assert.equal(await notice.count(),0); assert.ok(await dialog.isVisible());
    await page.screenshot({path:path.join(out,"settings-error-real-503.png")});
    scenarios.push("Real explicit settings save 503 keeps modal with readable error and enabled retry, no toast");

    // No database write is represented as real: only negative ACKs are intercepted.
    const mockedOperations: string[]=[];
    await page.route("**/api/privacy-consent",async route=>{
      if(route.request().method()==="GET"){await route.fulfill({json:{state:"unknown",receiptId:null,documentVersion:null,expiresAt:null,receipts:[]}});return;} const body=route.request().postDataJSON();
      if(body?.action==="decline"||body?.action==="revoke") {
        mockedOperations.push(body.operationId);
        await route.fulfill({json:{state:body.action==="revoke"?"revoked":"declined",receiptId:body.receiptId, operationId: body.operationId, eventKind: body.action,expiresAt:Date.now()+86400000,documentVersion:null}});
      } else await route.continue();
    });
    await watermark(page,"Визуальная проверка: ответ API подменён; запись в PostgreSQL не проверена");
    await save().click(); await notice.waitFor();
    assert.equal(await dialog.count(),0); assert.equal(await banner.count(),0); assert.equal(await notice.innerText(),"Настройки сохранены");
    assert.equal(await notice.locator("svg").count(),1); assert.equal(await notice.evaluate(el=>getComputedStyle(el).pointerEvents),"none");
    await page.waitForTimeout(220);
    assert.equal(await notice.evaluate(el=>getComputedStyle(el).opacity),"1");
    await page.screenshot({path:path.join(out,"visual-mocks/settings-saved-toast-desktop.png")});
    await page.waitForTimeout(2300);
    assert.ok(Number(await notice.evaluate(el=>getComputedStyle(el).opacity)) < 1, "Exit fades before removal");
    await notice.waitFor({state:"detached",timeout:3500});
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).pending??null,key),null);
    await footerSettings.click(); assert.equal(await dialog.getByRole("alert").count(),0);
    await page.setViewportSize({width:390,height:844}); await save().click(); await notice.waitFor();
    await page.waitForTimeout(220);
    await page.screenshot({path:path.join(out,"visual-mocks/settings-saved-toast-mobile.png")});
    await notice.waitFor({state:"detached",timeout:3500});
    await footerSettings.click(); await save().click(); await notice.waitFor();
    await page.goto(base+"/privacy", {waitUntil:"domcontentloaded"}); await stable(page); assert.equal(await notice.count(),0); assert.equal(await dialog.count(),0);
    scenarios.push("MOCK negative ACK only: explicit success closes modal, one real glass notice/SVG, auto-removal, repeat success, route cleanup; no reload notice");
    await page.evaluate(()=>document.querySelector('[data-visual-model]')?.remove());

    // Clearly watermarked future-ready VISUAL MODELS, not a live counter or registered grant.
    await page.setViewportSize({width:1440,height:900}); await footerSettings.click();
    await watermark(page,"Визуальная модель статуса — backend и включение Метрики не проверены");
    for(const [name,state,text,checked] of [
      ["off","off","Сейчас аналитика отключена",false],
      ["pending-on","pending","Аналитика будет включена после сохранения",true],
      ["on","on","Сейчас аналитика включена",true],
      ["pending-off","pending","Аналитика будет отключена после сохранения",false]
    ] as const) {
      await page.evaluate(({state,text,checked})=>{
        const badge=document.querySelector<HTMLElement>("#privacy-analytics-state")!; badge.dataset.state=state; badge.textContent=text;
        const input=document.querySelector<HTMLInputElement>('input[role="switch"]')!; input.checked=checked;
      },{state,text,checked});
      await page.waitForTimeout(220);
      await page.screenshot({path:path.join(out,`visual-mocks/status-${name}.png`)});
    }
    await page.reload({waitUntil:"domcontentloaded"}); await stable(page); assert.equal(await notice.count(),0);
    await footerSettings.click(); assert.equal(await dialog.getByRole("switch").isDisabled(),true);
    await page.keyboard.press("Escape");
    // Pending automatic retry never mounts a success notice and preserves idempotency key.
    await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,decision:"declined",receiptId:"a".repeat(64),documentVersion:null,expiresAt:Date.now()+86400000,pending:"decline",operationId:"12345678-1234-1234-1234-123456789abc"})),key);
    await page.reload({waitUntil:"domcontentloaded"}); await stable(page); await page.evaluate(()=>dispatchEvent(new Event("online")));
    await page.waitForFunction(key=>!JSON.parse(localStorage.getItem(key)!).pending,key);
    assert.equal(await notice.count(),0); assert.equal(mockedOperations.at(-1),"12345678-1234-1234-1234-123456789abc");
    scenarios.push("MOCK automatic outbox ACK preserves operation UUID and emits no toast");
    await page.emulateMedia({reducedMotion:"reduce"}); await footerSettings.click(); await save().click(); await notice.waitFor();
    assert.equal(await notice.evaluate(el=>getComputedStyle(el).animationName),"none");
    assert.ok(await notice.evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<0.001));
    await notice.waitFor({state:"detached",timeout:3500});
    await writeFile(path.join(out,"runtime-errors.json"),JSON.stringify(errors,null,2));
    assert.equal(sdk.length,0); assert.equal(errors.length,0);
    scenarios.push("Reduced motion has no movement; own Metрика SDK requests = 0; JavaScript page errors = 0");
    await writeFile(path.join(out,"report.json"),JSON.stringify({base,widths,scenarios,errors,consoleErrors,ownSdk:sdk,mockedOperations,limitations:["PostgreSQL unavailable: real negative saves return 503", "Success ACKs explicitly mocked", "Counter ID/settings absent; positive grant runtime not tested", "Real touch devices/Safari not tested"]},null,2));
    console.log(JSON.stringify({scenarios:scenarios.length,widths:widths.length,pageErrors:errors.length,ownSdk:sdk.length,output:out}));
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
