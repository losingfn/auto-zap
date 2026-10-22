import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {chromium,type Page} from "playwright-core";
import {analyticsConsentText,analyticsConsentVersion} from "../src/features/privacy/consent-content";
const base=process.env.PRIVACY_TEST_BASE_URL||"http://127.0.0.1:3115";
const out=path.resolve("artifacts/privacy-analytics-consent-page");
const route="/privacy/analytics-consent",key="autozap.privacy-choice.v1";
const normalized=(text:string)=>text.replace(/\s+/g," ").trim();
async function stable(page:Page){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);}
async function main(){
 await mkdir(out,{recursive:true});
 const hash=createHash("sha256").update(analyticsConsentText).digest("hex");
 assert.equal(hash,"5223be25807dee522acde9e3ead5060d86092678ddbf6949d7eeca79e9e2a550");assert.equal(analyticsConsentVersion,"sha256:"+hash);
 if(process.env.APPROVED_CONSENT_SOURCE)assert.equal(analyticsConsentText,await readFile(process.env.APPROVED_CONSENT_SOURCE,"utf8"));
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const errors:string[]=[],sdk:string[]=[],posts:string[]=[],widths:unknown[]=[],scenarios:string[]=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  context.on("page",page=>{page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>{
   if(r.frame()===page.mainFrame()&&/mc\.yandex\.[^/]+\/metrika\/tag\.js/.test(r.url()))sdk.push(r.url());
   if(r.url().endsWith("/api/privacy-consent")&&r.method()==="POST")posts.push(r.postDataJSON().action);
  });});
  const source=await context.newPage();await source.goto(base,{waitUntil:"domcontentloaded"});await source.locator('[data-privacy-banner]').waitFor();await stable(source);
  await source.screenshot({path:path.join(out,"banner-unchanged.png")});
  await source.getByRole("button",{name:"Настроить",exact:true}).click();const dialog=source.getByRole("dialog");await dialog.waitFor();
  const link=dialog.getByRole("link",{name:"Прочитать полное согласие",exact:true});
  assert.equal(await link.getAttribute("href"),route);assert.equal(await link.getAttribute("target"),"_blank");assert.equal(await link.getAttribute("rel"),"noopener noreferrer");
  const snapshot=await source.evaluate(key=>({choice:localStorage.getItem(key),switch:(document.querySelector('input[role="switch"]') as HTMLInputElement).checked,scroll:document.querySelector('dialog > div')!.scrollTop}),key);
  await source.waitForTimeout(200);await source.screenshot({path:path.join(out,"settings-desktop-initial.png")});
  const postCount=posts.length;
  const popupEvent=source.waitForEvent("popup");await link.click();const popup=await popupEvent;await popup.waitForURL("**"+route);await popup.locator("[data-consent-text]").waitFor();
  assert.equal(await popup.evaluate(()=>window.opener===null),true);assert.equal(await popup.locator(":modal").count(),0);
  assert.equal(normalized(await popup.locator("[data-consent-text]").innerText()),normalized(analyticsConsentText));
  await popup.reload({waitUntil:"domcontentloaded"});await popup.locator("[data-consent-text]").waitFor();
  await popup.close();await source.bringToFront();assert.ok(await dialog.isVisible());
  assert.deepEqual(await source.evaluate(key=>({choice:localStorage.getItem(key),switch:(document.querySelector('input[role="switch"]') as HTMLInputElement).checked,scroll:document.querySelector('dialog > div')!.scrollTop}),key),snapshot);
  assert.equal(posts.length,postCount);await source.screenshot({path:path.join(out,"settings-desktop-link.png")});
  await dialog.getByRole("button",{name:"Сохранить настройки",exact:true}).focus();await source.keyboard.press("Shift+Tab");assert.equal(await link.evaluate(el=>el===document.activeElement),true);assert.equal(await link.evaluate(el=>getComputedStyle(el).outlineStyle),"solid");
  const keyboardPopupEvent=source.waitForEvent("popup");await source.keyboard.press("Enter");const keyboardPopup=await keyboardPopupEvent;await keyboardPopup.waitForURL("**"+route);await keyboardPopup.close();await source.bringToFront();
  assert.ok(await dialog.isVisible());assert.equal(posts.length,postCount);
  scenarios.push("Click/Enter open noopener+noreferrer tab; original settings, switch, scroll and local choice preserved; no consent POST or SDK load; URL survives reload");
  await dialog.getByRole("button",{name:"Закрыть настройки без сохранения"}).click();
  await source.getByRole("button",{name:"Только необходимые",exact:true}).click();await source.locator('[data-privacy-banner]').waitFor({state:"detached"});
  const page=await context.newPage();
  for(const [width,height] of [[1440,900],[1280,800],[1024,768],[768,1024],[430,932],[390,844],[375,812],[320,700]]){
   await page.setViewportSize({width,height});const response=await page.goto(base+route,{waitUntil:"domcontentloaded"});assert.equal(response?.status(),200);await stable(page);
   const doc=page.locator('[data-consent-text]');assert.equal(await doc.locator("h1").count(),1);assert.equal(await doc.locator("h2").count(),10);assert.equal(await page.locator(":modal").count(),0);
   assert.equal(normalized(await doc.innerText()),normalized(analyticsConsentText));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),"");
   assert.equal(await page.locator("header").count(),1);assert.equal(await page.locator("footer").count(),1);
   assert.match(await page.title(),/Согласие на Яндекс.Метрику/);assert.equal(await page.locator('meta[name="description"]').count(),1);
   const metrics=await doc.evaluate(el=>({bounds:el.getBoundingClientRect().toJSON(),font:getComputedStyle(el).fontFamily,fontSize:getComputedStyle(el).fontSize,lineHeight:getComputedStyle(el).lineHeight,h1:getComputedStyle(el.querySelector("h1")!).fontSize,h2:getComputedStyle(el.querySelector("h2")!).fontSize,scrollHeight:document.documentElement.scrollHeight}));
   assert.ok(metrics.bounds.x>=16&&metrics.bounds.right<=width-16);assert.equal(metrics.fontSize,"16px");
   if(width===320)assert.equal(await doc.locator("h1").evaluate(el=>["ИСПОЛЬЗОВАНИЕМ","«ЯНДЕКС.МЕТРИКА»"].every(word=>{const start=el.textContent!.indexOf(word),range=document.createRange();range.setStart(el.firstChild!,start);range.setEnd(el.firstChild!,start+word.length);return range.getClientRects().length===1;})),true);
   await page.screenshot({path:path.join(out,`page-${width}x${height}.png`)});
   if(width===1440||width===390){await page.screenshot({path:path.join(out,`page-${width}-full.png`),fullPage:true});}
   await page.keyboard.press("PageDown");await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>scrollY)>0);
   await page.keyboard.press("Tab");assert.equal(await page.locator(":modal").count(),0);
   widths.push({width,height,...metrics});
  }
  scenarios.push("Direct page, 10 sections/exact original text, ordinary keyboard/page scrolling, header/footer, metadata and no horizontal overflow at 8 widths");
  // On mobile the source settings stay open after the same real new-tab action.
  await source.setViewportSize({width:390,height:844});await source.locator('footer a[href="#privacy-settings"]').click();await dialog.waitFor();await stable(source);
  const mobilePopupEvent=source.waitForEvent("popup");await dialog.getByRole("link",{name:"Прочитать полное согласие"}).click();const mobilePopup=await mobilePopupEvent;await mobilePopup.waitForURL("**"+route);await mobilePopup.close();await source.bringToFront();assert.ok(await dialog.isVisible());await source.screenshot({path:path.join(out,"settings-mobile-link.png")});
  await page.setViewportSize({width:1440,height:900});await page.goto(base+"/privacy",{waitUntil:"domcontentloaded"});await stable(page);await page.screenshot({path:path.join(out,"policy-unchanged.png")});
  scenarios.push("Mobile new-tab flow preserves native settings; frozen policy captured as control");
  assert.deepEqual(errors,[]);assert.deepEqual(sdk,[]);
  await writeFile(path.join(out,"report.json"),JSON.stringify({base,approvedTextSha256:hash,exactOriginal:true,version:analyticsConsentVersion,widths,scenarios,errors,ownSdk:sdk,posts,limitations:["Existing counter unavailable: positive on-draft not enabled or simulated", "No real PostgreSQL success verified; existing refusal test returns 503", "Physical Safari/iPhone/Android not tested"]},null,2));
  console.log(JSON.stringify({widths:widths.length,sections:10,textSha256:hash,scenarios:scenarios.length,pageErrors:errors.length,ownSdk:sdk.length,output:out}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
