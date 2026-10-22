import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright-core";
const before=process.env.PRIVACY_SPACING_PHASE==="before";
const base=process.env.PRIVACY_TEST_BASE_URL||(before?"http://127.0.0.1:3111":"http://127.0.0.1:3113");
const out=path.resolve("artifacts/privacy-final-spacing");
async function main(){
 await mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  const errors:string[]=[],sdk:string[]=[],measurements:unknown[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>{if(r.frame()===page.mainFrame()&&/mc\.yandex\.[^/]+\/metrika\/tag\.js/.test(r.url()))sdk.push(r.url());});
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator("[data-privacy-banner]").waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
  const cases=before?[[1440,900],[390,844]]:[[1440,900],[390,844],[320,720],[375,812],[430,932],[768,1024],[1024,768],[390,360],[1440,500]];
  const prior=before?null:JSON.parse(await readFile(path.join(out,"before.json"),"utf8"));
  for(const [width,height] of cases){
   await page.setViewportSize({width,height});await page.locator('[data-privacy-settings]').click();const dialog=page.getByRole("dialog");await dialog.waitFor();
   const m=await dialog.evaluate(el=>{
    const title=el.querySelector("h2")!,desc=el.querySelector("#privacy-dialog-description")!,required=el.querySelector('section[aria-labelledby="privacy-required-title"]')!,card=el.querySelector('section[aria-labelledby="privacy-analytics-title"]')!,toggle=card.querySelector("label")!,status=card.querySelector('[role="status"]')!,maps=card.nextElementSibling!,save=el.querySelector('.customer-reviews-action-primary')!,close=el.querySelector("button")!;
    const [windowRect,titleRect,closeRect,cardRect,saveRect,toggleRect,statusRect]=[el,title,close,card,save,toggle,status].map(e=>e.getBoundingClientRect().toJSON());
    const range=document.createRange();range.selectNodeContents(title);
    return{window:windowRect,title:titleRect,titleLines:[...range.getClientRects()].map(r=>r.toJSON()),close:closeRect,card:cardRect,save:saveRect,toggle:toggleRect,status:statusRect,gaps:{titleDescription:desc.getBoundingClientRect().top-title.getBoundingClientRect().bottom,requiredCard:card.getBoundingClientRect().top-required.querySelector("p")!.getBoundingClientRect().bottom,descriptionToggle:toggle.getBoundingClientRect().top-card.querySelector("p")!.getBoundingClientRect().bottom,toggleStatus:status.getBoundingClientRect().top-toggle.getBoundingClientRect().bottom,cardMaps:maps.querySelector("h3")!.getBoundingClientRect().top-card.getBoundingClientRect().bottom,saveMargin:parseFloat(getComputedStyle(save.parentElement!).marginTop)},padding:{top:getComputedStyle(card).paddingTop,bottom:getComputedStyle(card).paddingBottom,inline:getComputedStyle(card).paddingLeft},mapBorder:getComputedStyle(maps).borderTopWidth,titleFont:getComputedStyle(title).fontSize,scroll:{client:(el.firstElementChild!.nextElementSibling as HTMLElement).clientHeight,full:(el.firstElementChild!.nextElementSibling as HTMLElement).scrollHeight}};
   });
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await dialog.getByRole("switch").isDisabled(),true);assert.equal(m.mapBorder,"0px");
   assert.ok(Math.abs(m.title.x+m.title.width/2-m.window.x-m.window.width/2)<1);
   for(const r of m.titleLines){assert.ok(!(r.x<m.close.right&&r.right>m.close.x&&r.y<m.close.bottom&&r.bottom>m.close.y));}
   if(width>=640)assert.equal(m.window.width,520);
   if(!before&&width===1440&&height===900){assert.deepEqual(m.gaps,{titleDescription:20,requiredCard:20,descriptionToggle:22,toggleStatus:12,cardMaps:22,saveMargin:22});assert.equal(m.padding.top,"21px");assert.equal(m.padding.bottom,"21px");}
   if(!before&&width===390&&height===844){const old=prior.measurements.find((v:{width:number;height:number})=>v.width===width&&v.height===height);assert.deepEqual(m.gaps,old.values.gaps);assert.deepEqual(m.padding,old.values.padding);assert.equal(m.window.height,old.values.window.height);}
   await page.screenshot({path:path.join(out,`${before?"before":"after"}-settings-${width}x${height}.png`)});
   if(!before&&width===1440&&height===900)await dialog.locator('section[aria-labelledby="privacy-analytics-title"]').screenshot({path:path.join(out,"after-analytics-card.png")});
   if(!before&&width<640&&height>=700){await page.setViewportSize({width,height:1100});await page.waitForTimeout(200);await page.screenshot({path:path.join(out,`after-settings-${width}-full.png`)});await page.setViewportSize({width,height});}
   const save=dialog.getByRole("button",{name:"Сохранить настройки",exact:true});await save.scrollIntoViewIfNeeded();assert.ok(await save.isVisible());
   // All lower content is reachable in the existing scroll container at short heights.
   await dialog.locator('section[aria-labelledby="privacy-maps-title"]').scrollIntoViewIfNeeded();
   if(!before&&(height<600||width===320))await page.screenshot({path:path.join(out,`after-settings-${width}x${height}-scrolled.png`)});
   measurements.push({width,height,values:m});
   await page.keyboard.press("Escape");await page.locator("[data-privacy-banner]").waitFor();await page.waitForTimeout(200);
  }
  const accept=page.getByRole("button",{name:"Принять",exact:true});assert.equal(await accept.isDisabled(),true);
  const button=await accept.evaluate(el=>({disabled:(el as HTMLButtonElement).disabled,opacity:getComputedStyle(el).opacity,background:getComputedStyle(el).backgroundImage}));
  if(!before){
   // Actual component, negative API ACK mocked only for appearance. No counter/config changes.
   await page.route("**/api/privacy-consent",async route=>{if(route.request().method()==="GET"){await route.fulfill({json:{state:"unknown",receiptId:null,documentVersion:null,expiresAt:null,receipts:[]}});return;} const b=route.request().postDataJSON();if(b?.action==="decline"||b?.action==="revoke")await route.fulfill({json:{state:b.action==="revoke"?"revoked":"declined",receiptId:b.receiptId, operationId: b.operationId, eventKind: b.action,expiresAt:Date.now()+86400000,documentVersion:null}});else await route.continue();});
   await page.setViewportSize({width:1440,height:900});await page.locator('[data-privacy-settings]').click();await page.getByRole("button",{name:"Сохранить настройки",exact:true}).click();await page.locator('[data-privacy-saved-notice]').waitFor();await page.waitForTimeout(2800);
   for(const surface of ["dark","light"]){
    await page.locator('footer a[href="#privacy-settings"]').click();await page.getByRole("button",{name:"Сохранить настройки",exact:true}).click();const notice=page.locator('[data-privacy-saved-notice]');await notice.waitFor();
    await page.evaluate(surface=>{const mark=document.createElement("div");mark.dataset.mockLabel="";mark.textContent=surface==="light"?"Визуальный тест: светлая подложка, ACK подменён; PostgreSQL не проверен":"Визуальный тест: ACK подменён; PostgreSQL не проверен";mark.style.cssText="position:fixed;top:0;left:0;right:0;z-index:999999;background:white;color:black;padding:8px;font:14px Arial;text-align:center;pointer-events:none";document.body.append(mark);if(surface==="light"){const panel=document.createElement("div");panel.dataset.lightFixture="";panel.style.cssText="position:fixed;bottom:0;left:0;right:0;height:180px;background:#f1f4f7;z-index:109;pointer-events:none";document.body.append(panel);}},surface);
    await page.waitForTimeout(260);const box=await notice.boundingBox();assert.ok(box);
    const css=await notice.evaluate(el=>({background:getComputedStyle(el).backgroundImage,blur:getComputedStyle(el).backdropFilter,border:getComputedStyle(el).borderTopColor,opacity:getComputedStyle(el).opacity}));assert.equal(css.blur,"blur(22px) saturate(1.45)");assert.equal(css.opacity,"1");
    await page.screenshot({path:path.join(out,`toast-${surface}-mock-full.png`)});
    await page.screenshot({path:path.join(out,`toast-${surface}-mock-closeup.png`),clip:{x:box!.x-50,y:box!.y-45,width:box!.width+100,height:box!.height+65},scale:"device"});
    await writeFile(path.join(out,`toast-${surface}-computed.json`),JSON.stringify({css,box,backend:"Negative acknowledgement mocked; no real PostgreSQL success"},null,2));
    await notice.waitFor({state:"detached",timeout:3500});await page.evaluate(()=>{document.querySelector('[data-mock-label]')?.remove();document.querySelector('[data-light-fixture]')?.remove();});
   }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(sdk,[]);
  await writeFile(path.join(out,before?"before.json":"after.json"),JSON.stringify({base,measurements,button,errors,ownSdk:sdk},null,2));
  console.log(`${before?"Before":"After"}: measured ${cases.length} viewports; no JS errors or own Metrika SDK loads`);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
