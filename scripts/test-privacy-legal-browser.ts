import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import postgres from "postgres";
import { availablePort } from "./helpers/privacy-next-environment";
import { privacyDisposableDb } from "./helpers/privacy-disposable-db";
import { analyticsConsentText, analyticsConsentVersion } from "../src/features/privacy/consent-content";
import { privacyPolicySections } from "../src/app/privacy/policy-content";
import { createPrivacyReceipt, proofCookieName } from "../src/features/privacy/receipt";
import { PRIVACY_COOKIE, PRIVACY_STORAGE_KEY } from "../src/features/privacy/domain";

const output = "artifacts/privacy-legal-final/implementation/evidence";
const normalize = (value: string) => value.replace(/\s+/g," ").trim();
async function main() {
  await mkdir(output,{recursive:true});
  const fixture=await privacyDisposableDb(), db=fixture.connection;
  const controlUrl=new URL(fixture.url);controlUrl.pathname='/postgres';
  const control=postgres(controlUrl.href,{max:1,connect_timeout:2,onnotice:()=>{}});
  const port=await availablePort(), base=`http://127.0.0.1:${port}`;
  const secret=randomBytes(32).toString("hex"); process.env.PRIVACY_CONSENT_SECRET=secret;
  let server:ChildProcess|undefined, browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  const results:string[]=[], sdk:string[]=[], errors:string[]=[], widths:unknown[]=[];
  let log="";
  const check=async(name:string,work:()=>Promise<void>)=>{await work();results.push(name);console.log(`PASS ${name}`);};
  try {
    server=spawn(process.execPath,[".next/standalone/server.js"],{env:{...process.env,NODE_ENV:"production",HOSTNAME:"127.0.0.1",PORT:String(port),APP_URL:base,
      DATABASE_URL:fixture.url,SESSION_SECRET:randomBytes(32).toString("hex"),PRIVACY_CONSENT_SECRET:secret,
      MEILI_HOST:"http://127.0.0.1:1",MEILI_MASTER_KEY:randomBytes(32).toString("hex"),MEILI_SEARCH_KEY:"",YANDEX_MAPS_API_KEY:"",
      YANDEX_METRIKA_COUNTER_ID:"113668070",YANDEX_METRIKA_CONFIGURATION_VERIFIED:"false",BACKGROUND_JOBS_ENABLED:"false",IMPORT_WORKER_ENABLED:"false",NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});
    for(const stream of [server.stdout,server.stderr]) stream!.on("data",(chunk:Buffer)=>{log+=chunk.toString();});
    let ready=false;
    for(let i=0;i<80;i++) {try{if((await fetch(base+"/api/privacy-consent")).ok){ready=true;break;}}catch{ /* Local server startup. */ } await new Promise(resolve=>setTimeout(resolve,200));}
    assert.equal(ready,true,"isolated standalone server must start");
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const mapRequests:string[]=[];
    await context.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===base){await route.continue();return;}
      if(/mc\.yandex\.[^/]+/.test(url.hostname)&&url.pathname==="/metrika/tag.js")sdk.push(url.origin+url.pathname);
      if(url.hostname==="yandex.ru"&&url.pathname.startsWith("/map-widget/")){
        mapRequests.push(url.pathname); await route.fulfill({contentType:"text/html",body:"<!doctype html><title>Map isolated for local QA</title>"});
      }else await route.abort();
    });
    context.on("page",page=>page.on("pageerror",error=>errors.push(error.message)));
    const page=await context.newPage();
    if(process.argv.includes('--links-only')){
      for(const route of ['/privacy','/privacy/analytics-consent']){
        assert.equal((await page.goto(base+route))!.status(),200);
        const links=await page.locator('main article a').evaluateAll(anchors=>anchors.map(anchor=>anchor.getAttribute('href')!));
        for(const link of links)if(/^https?:/.test(link))assert.doesNotMatch(link,/[.;,]$/);
        if(route.endsWith('analytics-consent')){
          assert.ok(links.includes('https://yandex.ru/legal/metrica_termsofuse/ru/'));
          assert.ok(links.includes('https://yandex.ru/legal/confidential/ru/'));
          assert.equal(normalize(await page.locator('main article').innerText()),normalize(analyticsConsentText));
        }
      }
      assert.deepEqual(errors,[]);assert.deepEqual(sdk,[]);
      await writeFile(output+'/browser-links.json',JSON.stringify({routes:2,cleanExternalHrefs:true,exactArchivedText:true,pageErrors:errors,ownSdk:sdk,configurationVerified:false},null,2)+'\n');
      console.log('PASS final built legal routes: exact archived text and correct external link boundaries; SDK off');
      return;
    }
    const dialog=page.getByRole("dialog");
    const noPending=()=>page.waitForFunction(key=>{const choice=JSON.parse(localStorage.getItem(key)||"null");return choice&&!choice.pending&&!Object.keys(localStorage).some(key=>key.startsWith("autozap.privacy-operation.v2."));},PRIVACY_STORAGE_KEY,{timeout:15000});
    const settings=async()=>{await page.locator('footer a[href="#privacy-settings"]').click();await dialog.waitFor();};
    await check("real standalone: first-visit banner, accept disabled, map independent before choice",async()=>{
      await page.goto(base);await page.locator('[data-privacy-banner]').waitFor();
      assert.equal(await page.getByRole('button',{name:'Принять',exact:true}).isDisabled(),true);
      await page.screenshot({path:output+'/banner-desktop.png'});
      await page.locator('.home-about-media > div').last().scrollIntoViewIfNeeded();
      await page.locator('iframe[title="Карта проезда к магазину автозапчастей"]').waitFor({state:'attached'});
      assert.ok(mapRequests.length>0);assert.equal(sdk.length,0);
    });
    await check("full consent opens new tab; source dialog, scroll, switch and choice remain unchanged",async()=>{
      await page.getByRole('button',{name:'Настроить',exact:true}).click();await dialog.waitFor();
      const link=dialog.getByRole('link',{name:'Прочитать полное согласие'});
      assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
      const before=await page.evaluate(key=>({choice:localStorage.getItem(key),scroll:scrollY,checked:(document.querySelector('[role=switch]') as HTMLInputElement).checked}),PRIVACY_STORAGE_KEY);
      const popupEvent=page.waitForEvent('popup');await link.click();const popup=await popupEvent;
      await popup.waitForURL('**/privacy/analytics-consent');assert.equal(await popup.evaluate(()=>opener===null),true);
      assert.equal(normalize(await popup.locator('[data-consent-text]').innerText()),normalize(analyticsConsentText));await popup.close();
      assert.equal(await dialog.isVisible(),true);
      assert.deepEqual(await page.evaluate(key=>({choice:localStorage.getItem(key),scroll:scrollY,checked:(document.querySelector('[role=switch]') as HTMLInputElement).checked}),PRIVACY_STORAGE_KEY),before);
      await page.screenshot({path:output+'/settings-desktop.png'});
      await dialog.getByRole('button',{name:'Закрыть настройки без сохранения'}).click();
    });
    await check("real API/PostgreSQL: refusal persists across reload; reading pages creates no grants",async()=>{
      await page.getByRole('button',{name:'Только необходимые',exact:true}).click();await noPending();
      assert.equal((await db`SELECT count(*)::int AS n FROM privacy_consent_events WHERE kind='decline'`)[0].n,1);
      await page.reload();assert.equal(await page.locator('[data-privacy-banner]').count(),0);
      const before=mapRequests.length;await page.locator('.home-about-media > div').last().scrollIntoViewIfNeeded();await page.waitForTimeout(300);
      assert.ok(mapRequests.length>before);assert.equal(sdk.length,0);
      assert.equal((await db`SELECT count(*)::int AS n FROM privacy_consent_events WHERE kind='grant'`)[0].n,0);
    });
    await check("actual legal routes and internal links; full text and no clipping at eight desktop/tablet/mobile widths",async()=>{
      const document=await context.newPage();
      for(const [width,height] of [[1440,1000],[1280,800],[1024,768],[768,1024],[430,932],[390,844],[375,812],[320,700]]){
        await document.setViewportSize({width,height});
        for(const route of ['/privacy','/privacy/analytics-consent']){
          const response=await document.goto(base+route);assert.equal(response!.status(),200);await document.evaluate(()=>window.document.fonts.ready);
          const article=document.locator('main article');assert.equal(await article.locator('h2').count(),route==='/privacy'?12:10);
          assert.equal(await document.evaluate(()=>window.document.documentElement.scrollWidth>innerWidth),false);
          const text=await article.innerText();assert.doesNotMatch(text,/Служебная помета|Дата редакции|19\.10\.2026/);
          if(route==='/privacy'){
            assert.equal(await article.locator('[data-policy-clause]').count(),114);
            for(const section of privacyPolicySections)for(const clause of section.clauses){
              const actual=await article.locator(`[data-policy-clause="${clause.number}"]`).innerText();
              for(const block of clause.blocks)for(const item of block.type==='paragraph'?[block.text]:block.items)assert.ok(normalize(actual).includes(normalize(item)),clause.number);
            }
          }else assert.equal(normalize(text),normalize(analyticsConsentText));
          await document.screenshot({path:`${output}/${route==='/privacy'?'policy':'consent'}-${width}.png`});
          if(width===1440||width===390)await document.screenshot({path:`${output}/${route==='/privacy'?'policy':'consent'}-${width}-full.png`,fullPage:true});
          await article.locator('section').last().scrollIntoViewIfNeeded();assert.ok(await document.evaluate(()=>scrollY)>0);
          for(const href of await article.locator('a').evaluateAll(links=>links.map(link=>link.getAttribute('href')!))){
            const target=new URL(href,base);if(target.pathname.startsWith('/privacy')&&target.hostname==='autozapchast-taldom.ru')assert.equal((await fetch(base+target.pathname)).status,200);
          }
          widths.push({route,width,height,overflow:false,sections:route==='/privacy'?12:10});
        }
      }
      await document.close();
    });
    await check("mobile banner and settings remain scrollable; mobile new-tab link preserves the dialog",async()=>{
      const mobileContext=await browser!.newContext({viewport:{width:320,height:700}});
      await mobileContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      const mobile=await mobileContext.newPage();await mobile.goto(base+'/privacy');await mobile.locator('[data-privacy-banner]').waitFor();
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      for(const name of ['Принять','Только необходимые','Настроить'])assert.ok(await mobile.getByRole('button',{name,exact:true}).isVisible());
      await mobile.screenshot({path:output+'/banner-mobile-320.png'});
      await mobile.getByRole('button',{name:'Настроить',exact:true}).click();const modal=mobile.getByRole('dialog');await modal.waitFor();
      const popupEvent=mobile.waitForEvent('popup');await modal.getByRole('link',{name:'Прочитать полное согласие'}).click();const popup=await popupEvent;await popup.waitForURL('**/privacy/analytics-consent');await popup.close();
      assert.equal(await modal.isVisible(),true);await mobile.screenshot({path:output+'/settings-mobile-320.png'});
      await mobileContext.close();
    });
    async function syntheticGrant(version=analyticsConsentVersion){
      const receipt=createPrivacyReceipt();
      await db`INSERT INTO privacy_consent_events(receipt_hash,operation_id,kind,document_version,expires_at)
        VALUES(${receipt.receiptId},${randomUUID()},'grant',${version},${new Date(receipt.expiresAt)})`;
      await context.clearCookies();
      await context.addCookies([PRIVACY_COOKIE,proofCookieName(receipt.receiptId)].map(name=>({name,value:receipt.value,domain:'127.0.0.1',path:'/api/privacy-consent',httpOnly:true,sameSite:'Strict' as const,expires:receipt.expiresAt/1000})));
      await page.evaluate(({key,receipt,version})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify({version:1,decision:'granted',receiptId:receipt.receiptId,documentVersion:version,expiresAt:receipt.expiresAt}));},{key:PRIVACY_STORAGE_KEY,receipt,version});
      await page.reload();return receipt;
    }
    await check("real PostgreSQL withdrawal of a synthetic prior grant; verified=false keeps own SDK off throughout",async()=>{
      const receipt=await syntheticGrant();await settings();await dialog.getByRole('button',{name:'Сохранить настройки'}).click();await noPending();
      await page.locator('[data-privacy-saved-notice]').waitFor();
      const rows=await db`SELECT kind,document_version FROM privacy_consent_events WHERE receipt_hash=${receipt.receiptId}`;
      assert.equal(rows.length,2);assert.ok(rows.some(row=>row.kind==='revoke'));assert.equal(rows.find(row=>row.kind==='grant')!.document_version,analyticsConsentVersion);
      assert.equal(sdk.length,0);
    });
    await check("offline refusal remains off and pending; reconnect safely delivers the original revoke",async()=>{
      const receipt=await syntheticGrant();await settings();await context.setOffline(true);
      await dialog.getByRole('button',{name:'Сохранить настройки'}).click();await dialog.getByRole('alert').waitFor();
      assert.equal(await dialog.isVisible(),true);assert.equal(sdk.length,0);
      assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).decision,PRIVACY_STORAGE_KEY),'declined');
      await context.setOffline(false);await noPending();
      assert.equal((await db`SELECT kind FROM privacy_consent_events WHERE receipt_hash=${receipt.receiptId} AND kind='revoke'`).length,1);
      await dialog.getByRole('button',{name:'Закрыть настройки без сохранения'}).click();
    });
    await check("real API 503 cannot acknowledge settings; service recovery preserves refusal",async()=>{
      await syntheticGrant();await settings();
      const [{pid:fixturePid}]=await db`SELECT pg_backend_pid() AS pid`;
      await control.unsafe(`ALTER DATABASE ${fixture.database} ALLOW_CONNECTIONS false`);
      await control`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${fixture.database} AND pid<>${fixturePid}`;
      try{
        await dialog.getByRole('button',{name:'Сохранить настройки'}).click();await dialog.getByRole('alert').waitFor({timeout:15000});
        assert.equal(await dialog.isVisible(),true);assert.equal(sdk.length,0);
      }finally{await control.unsafe(`ALTER DATABASE ${fixture.database} ALLOW_CONNECTIONS true`);}
      await page.evaluate(()=>dispatchEvent(new Event('online')));await noPending();
      await dialog.getByRole('button',{name:'Закрыть настройки без сохранения'}).click();
    });
    await check("expired blocked queue on real revisit clears without inventing an ACK or renewing an old grant",async()=>{
      const old='8'.repeat(64),id=randomUUID();await context.clearCookies();
      await page.evaluate(({key,old,id})=>{localStorage.clear();localStorage.setItem('autozap.privacy-intent.v2',JSON.stringify({id,grant:false}));
        localStorage.setItem(key,JSON.stringify({version:1,decision:'declined',receiptId:old,documentVersion:null,expiresAt:Date.now()+86400000,pending:'revoke',operationId:id,intentId:id}));
        localStorage.setItem('autozap.privacy-operation.v2.'+old+'.withdraw',JSON.stringify({id,receiptId:old,action:'revoke',documentVersion:null,expiresAt:Date.now()-1,blocked:true}));},{key:PRIVACY_STORAGE_KEY,old,id});
      await page.reload();await noPending();assert.equal(sdk.length,0);
      assert.equal((await db`SELECT * FROM privacy_consent_events WHERE receipt_hash=${old}`).length,0);
    });
    await check("expired and old-revision local choices do not grant or extend permission on reload",async()=>{
      const receipt=await syntheticGrant('sha256:f801a44356ed08df59a848e25c006cd540e74efcf4a4dd08c50dd29057095d82');
      assert.equal(sdk.length,0);await page.evaluate(key=>{const choice=JSON.parse(localStorage.getItem(key)!);choice.expiresAt=Date.now()-1;localStorage.setItem(key,JSON.stringify(choice));},PRIVACY_STORAGE_KEY);
      await page.reload();await page.locator('[data-privacy-banner]').waitFor();assert.equal(sdk.length,0);
      assert.equal((await db`SELECT count(*)::int AS n FROM privacy_consent_events WHERE receipt_hash=${receipt.receiptId}`)[0].n,1);
    });
    assert.deepEqual(errors,[]);assert.deepEqual(sdk,[]);await context.close();
    await writeFile(output+'/browser.json',JSON.stringify({isolation:fixture.isolation,results,widths,pageErrors:errors,ownSdk:sdk,counterId:113668070,configurationVerified:false,
      externalMap:'Request observed; vendor frame isolated, no assertion about live vendor response',limitations:['Chromium only; physical Safari/iOS/Android not tested','Prior grants are explicitly synthetic in disposable PostgreSQL; no counter activation']},null,2)+'\n');
  }finally{
    await browser?.close();
    if(server&&server.exitCode===null){const stopped=new Promise<void>(resolve=>server!.once('exit',()=>resolve()));server.kill('SIGTERM');await stopped;}
    await control.end({timeout:2});await fixture.cleanup();
    log=log.replaceAll(fixture.password,'[redacted]').replaceAll(secret,'[redacted]').replace(/postgres(?:ql)?:\/\/\S+/g,'[connection redacted]');
    await writeFile(output+'/standalone.log',log);
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[connection redacted]'):'Local browser test failed');process.exitCode=1;});
