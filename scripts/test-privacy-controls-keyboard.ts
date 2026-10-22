import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
const base=process.env.PRIVACY_TEST_BASE_URL||"http://127.0.0.1:3109";
async function main() {
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844}}), page=await context.newPage();
  const banner=page.locator("[data-privacy-banner]"), dialog=page.getByRole("dialog"), notice=page.locator("[data-privacy-saved-notice]");
  await page.goto(base,{waitUntil:"domcontentloaded"}); await banner.waitFor();
  await banner.getByRole("button",{name:"Только необходимые",exact:true}).focus();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement!).outlineStyle),"solid");
  await page.keyboard.press("Tab"); assert.equal(await page.evaluate(()=>document.activeElement?.textContent),"Настроить");
  await page.keyboard.press("Space"); await dialog.waitFor();
  const close=dialog.getByRole("button",{name:"Закрыть настройки без сохранения"});
  const save=dialog.getByRole("button",{name:"Сохранить настройки",exact:true});
  await close.focus(); await page.keyboard.press("Shift+Tab"); assert.equal(await page.evaluate(()=>document.activeElement===document.body || !!document.activeElement?.closest("dialog")),true);
  for(let i=0;i<6;i++) { await page.keyboard.press("Tab"); assert.equal(await page.evaluate(()=>document.activeElement===document.body || !!document.activeElement?.closest("dialog")),true); }
  await dialog.locator("h2").focus();
  await dialog.getByRole("switch").evaluate(el=>(el as HTMLElement).focus());
  assert.equal(await dialog.getByRole("switch").evaluate(el=>el===document.activeElement),false);
  await page.keyboard.press("Space");
  assert.equal(await dialog.getByRole("switch").isChecked(),false);
  let release: (()=>void)|undefined; const hold=new Promise<void>(resolve=>{release=resolve;}); let writes=0;
  await page.route("**/api/privacy-consent",async route=>{
   if(route.request().method()==="GET"){await route.fulfill({json:{state:"unknown",receiptId:null,documentVersion:null,expiresAt:null,receipts:[]}});return;} const body=route.request().postDataJSON();
   if(body?.action==="decline") { writes++; await hold; await route.fulfill({json:{state:"declined",receiptId:body.receiptId, operationId: body.operationId, eventKind: body.action,documentVersion:null,expiresAt:Date.now()+86400000}}); }
   else await route.continue();
  });
  await save.focus(); const enter = page.keyboard.press("Enter");
  await page.waitForFunction(()=>document.querySelector('dialog button')?.hasAttribute('disabled'));
  await dialog.locator(".customer-reviews-action-primary").evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});
  await page.keyboard.press("Escape"); assert.ok(await dialog.isVisible()); assert.equal(await close.isDisabled(),true);
  while(!writes) await page.waitForTimeout(20);
  assert.equal(writes,1); release!(); await enter; await notice.waitFor(); assert.equal(await dialog.count(),0);
  await page.waitForTimeout(300); assert.equal(await notice.evaluate(el=>getComputedStyle(el).opacity),"1");
  await notice.waitFor({state:"detached",timeout:3500});
  await context.close();
  const fresh=await browser.newContext({viewport:{width:390,height:844}}), refusal=await fresh.newPage();
  await refusal.route("**/api/privacy-consent",async route=>{
   if(route.request().method()==="GET"){await route.fulfill({json:{state:"unknown",receiptId:null,documentVersion:null,expiresAt:null,receipts:[]}});return;} const b=route.request().postDataJSON();
   if(b?.action==="decline") await route.fulfill({json:{state:"declined",receiptId:b.receiptId, operationId: b.operationId, eventKind: b.action,documentVersion:null,expiresAt:Date.now()+86400000}});
   else await route.continue();
  });
  await refusal.goto(base,{waitUntil:"domcontentloaded"}); await refusal.locator("[data-privacy-banner]").waitFor();
  await refusal.getByRole("button",{name:"Только необходимые",exact:true}).click();
  await refusal.waitForFunction(()=>!JSON.parse(localStorage.getItem("autozap.privacy-choice.v1")!).pending);
  assert.equal(await refusal.locator("[data-privacy-saved-notice]").count(),0);
  assert.equal(await refusal.getByRole("dialog").count(),0);
  await writeFile(path.join(process.env.PRIVACY_TEST_OUTPUT_DIR || "artifacts/privacy-controls", "keyboard-report.json"),JSON.stringify({keyboard:"Tab / Shift+Tab trap and focus outlines, Space opens settings, disabled switch remains off, Enter saves",busy:"One mocked decline POST despite duplicate clicks; disabled close and Escape keep modal",toast:"Only explicit settings ACK; banner refusal ACK emits none",backend:"Negative acknowledgements mocked; real PostgreSQL not verified"},null,2));
  console.log("Privacy keyboard and repeat-click guards passed (negative API ACK mocked)");
 } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
