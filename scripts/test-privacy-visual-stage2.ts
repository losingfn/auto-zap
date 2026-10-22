import assert from "node:assert/strict";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright-core";
const base=process.env.PRIVACY_TEST_BASE_URL||"http://127.0.0.1:3111";
const out=path.resolve("artifacts/privacy-visual-stage2");
async function main(){
 await mkdir(out,{recursive:true});
 const prior=JSON.parse(await readFile("artifacts/privacy-controls/report.json","utf8"));
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const page=await context.newPage();
  const errors:string[]=[],consoleErrors:string[]=[],sdk:string[]=[],measurements:unknown[]=[],collisions:unknown[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text());});
  page.on("request",r=>{if(r.frame()===page.mainFrame()&&/mc\.yandex\.[^/]+\/metrika\/tag\.js/.test(r.url()))sdk.push(r.url());});
  const banner=page.locator("[data-privacy-banner]"),dialog=page.getByRole("dialog");
  await page.goto(base,{waitUntil:"domcontentloaded"});await banner.waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
  for(const [width,height] of [[1440,900],[390,844],[320,720],[375,812],[430,932],[768,1024],[1024,768]]){
   await page.setViewportSize({width,height});
   const buttons=await banner.getByRole("button").all();const first=await buttons[0].boundingBox(),last=await buttons[2].boundingBox(),b=await banner.boundingBox();assert.ok(first&&last&&b);
   const previous=prior.widths.find((v:{width:number;height:number})=>v.width===width&&v.height===height);
   if(previous){assert.ok(Math.abs(b!.width-previous.bounds.width)<1);assert.ok(Math.abs(b!.height-previous.bounds.height)<1);}
   if(width>=1024) assert.ok(Math.abs((first!.x+last!.x+last!.width)/2-(b!.x+b!.width/2))<1);
   if(width<640){const middle=await buttons[1].boundingBox();assert.equal(first!.width,last!.width);assert.ok(first!.y<middle!.y&&middle!.y<last!.y);}
   assert.equal(await page.locator(":modal").count(),0);
   await page.screenshot({path:path.join(out,`banner-${width}.png`)});
   await banner.getByRole("button",{name:"Настроить",exact:true}).click();await dialog.waitFor();
   const box=await dialog.boundingBox();assert.ok(box);if(width>=640)assert.equal(box!.width,520);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await dialog.getByRole("switch").isDisabled(),true);
   assert.equal(await dialog.locator("#privacy-analytics-unavailable").count(),0);
   assert.equal(await dialog.locator("#privacy-analytics-state").innerText(),"Сейчас аналитика отключена");
   const geometry=await dialog.evaluate(el=>{
    const title=el.querySelector("h2")!, close=el.querySelector("button")!, card=el.querySelector<HTMLElement>('section[aria-labelledby="privacy-analytics-title"]')!, map=card.nextElementSibling!,link=card.querySelector("a")!;
    const r=document.createRange();r.selectNodeContents(title);
    return {window:el.getBoundingClientRect().toJSON(),title:title.getBoundingClientRect().toJSON(),titleLines:[...r.getClientRects()].map(r=>r.toJSON()),close:close.getBoundingClientRect().toJSON(),card:card.getBoundingClientRect().toJSON(),link:link.getBoundingClientRect().toJSON(),linkParent:link.parentElement!.tagName,mapBorder:getComputedStyle(map).borderTopWidth,cardBorder:getComputedStyle(card).borderBottomWidth,titleFont:getComputedStyle(title).fontSize};
   });
   assert.ok(Math.abs(geometry.title.x+geometry.title.width/2-(box!.x+box!.width/2))<1);
   for(const line of geometry.titleLines){assert.ok(Math.abs(line.x+line.width/2-(box!.x+box!.width/2))<1);if(line.x<geometry.close.x+geometry.close.width&&line.x+line.width>geometry.close.x&&line.y<geometry.close.y+geometry.close.height&&line.y+line.height>geometry.close.y)collisions.push({width,line,close:geometry.close});}
   assert.equal(geometry.mapBorder,"0px");assert.equal(geometry.cardBorder,"1px");assert.equal(geometry.linkParent,"P");
   await page.screenshot({path:path.join(out,`settings-${width}.png`)});measurements.push({width,height,banner:b,settings:geometry});
   if(width===1440){
    await dialog.locator('section[aria-labelledby="privacy-analytics-title"]').screenshot({path:path.join(out,"analytics-card.png")});
    const h=await dialog.locator("h2").boundingBox();await page.screenshot({path:path.join(out,"settings-heading-close.png"),clip:{x:box!.x,y:box!.y,width:box!.width,height:h!.y+h!.height-box!.y+8}});
    await dialog.locator('section[aria-labelledby="privacy-analytics-title"] p').first().screenshot({path:path.join(out,"consent-link-inline.png")});
    const card=await dialog.locator('section[aria-labelledby="privacy-analytics-title"]').boundingBox(),map=await dialog.locator('section[aria-labelledby="privacy-maps-title"]').boundingBox();
    await page.screenshot({path:path.join(out,"analytics-maps-no-divider.png"),clip:{x:card!.x,y:card!.y+card!.height-24,width:card!.width,height:map!.y+map!.height-card!.y-card!.height+24}});
   }
   if(width===320 || width===390){await page.setViewportSize({width,height:1100});await page.screenshot({path:path.join(out,`settings-${width}-full.png`)});await page.setViewportSize({width,height});}
   await dialog.getByRole("button",{name:"Закрыть настройки без сохранения"}).click();await banner.waitFor();await page.waitForTimeout(200);
  }
  // Existing acknowledgement only, mocked for appearance; no production gates changed.
  await page.route("**/api/privacy-consent",async route=>{
   if(route.request().method()==="GET"){await route.fulfill({json:{state:"unknown",receiptId:null,documentVersion:null,expiresAt:null,receipts:[]}});return;} const body=route.request().postDataJSON();
   if(body?.action==="decline"||body?.action==="revoke")await route.fulfill({json:{state:body.action==="revoke"?"revoked":"declined",receiptId:body.receiptId, operationId: body.operationId, eventKind: body.action,documentVersion:null,expiresAt:Date.now()+86400000}});
   else await route.continue();
  });
  await page.setViewportSize({width:1440,height:900});await banner.getByRole("button",{name:"Настроить",exact:true}).click();
  await dialog.getByRole("button",{name:"Сохранить настройки",exact:true}).click();await page.locator("[data-privacy-saved-notice]").waitFor();await page.waitForTimeout(2800);
  for(const surface of ["dark-footer","light-fixture","photo"]){
   await page.locator('footer a[href="#privacy-settings"]').click();
   await dialog.getByRole("button",{name:"Сохранить настройки",exact:true}).click();const notice=page.locator("[data-privacy-saved-notice]");await notice.waitFor();
   await page.evaluate(surface=>{
    const label=document.createElement("div");label.dataset.visualModel="";label.textContent=surface==="light-fixture"?"ВИЗУАЛЬНЫЙ ТЕСТ: светлый тестовый фон, ACK подменён; PostgreSQL не проверен":"ВИЗУАЛЬНЫЙ ТЕСТ: ACK подменён; PostgreSQL не проверен";
    label.style.cssText="position:fixed;top:0;left:0;right:0;z-index:999999;padding:8px;background:white;color:black;font:14px Arial;text-align:center;pointer-events:none";document.body.append(label);
    if(surface==="light-fixture") {const bg=document.createElement("div");bg.dataset.lightFixture="";bg.style.cssText="position:fixed;bottom:0;left:0;right:0;height:160px;background:#f1f4f7;z-index:109;pointer-events:none";document.body.append(bg);}
    if(surface==="photo") {scrollTo({top:0,behavior:"instant"});}
   },surface);
   if(surface==="photo") await page.setViewportSize({width:390,height:430});
   await page.waitForTimeout(260);
   assert.equal(await notice.evaluate(el=>getComputedStyle(el).opacity),"1");
   await page.screenshot({path:path.join(out,`toast-${surface}-mock.png`)});
   await notice.waitFor({state:"detached",timeout:3500});
   await page.evaluate(()=>{document.querySelector('[data-visual-model]')?.remove();document.querySelector('[data-light-fixture]')?.remove();});
   await page.setViewportSize({width:1440,height:900});
  }
  assert.equal(errors.length,0);assert.equal(sdk.length,0);
  await writeFile(path.join(out,"visual-report.json"),JSON.stringify({measurements,collisions,errors,consoleErrors,ownSdk:sdk,limits:["Toast negative ACK mocked", "Light background is an explicitly labelled visual fixture: no broad light section exists in the approved navy site", "Real PostgreSQL and physical devices unverified"]},null,2));
  assert.deepEqual(collisions,[]);
  console.log("Stage 2: widths, exact 520px, centered headings/actions, inline link, no divider, 3 marked toast backgrounds passed");
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
