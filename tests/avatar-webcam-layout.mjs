import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.AVATAR_MAKER_URL||'http://127.0.0.1:5187/';
const fixture=process.env.AVATAR_CAMERA_FIXTURE;if(!fixture)throw new Error('Set AVATAR_CAMERA_FIXTURE to a prerecorded Y4M camera fixture.');
const out=resolve(process.env.AVATAR_QA_OUTPUT||'test-results/avatar-maker');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-video-capture=${fixture}`]});
const context=await browser.newContext({viewport:{width:1280,height:1040},deviceScaleFactor:.5,permissions:['camera']});
const page=await context.newPage(),errors=[],samples=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__layoutScenes=[];const hook=window.__THREE_DEVTOOLS__=new EventTarget();hook.addEventListener('observe',e=>{if(e.detail?.isScene)window.__layoutScenes.push(e.detail);});});
let report={passed:false,url,actualCameraAccess:false};
try{
 await page.goto(url);await page.waitForFunction(()=>window.__layoutScenes.some(s=>s.getObjectByName('mouth_robot')),null,{timeout:90000});
 await page.getByTestId('webcam-controls').getByRole('button',{name:'◉ Webcam',exact:true}).click();
 await page.waitForFunction(()=>['running','error'].includes(document.querySelector('[data-testid=webcam-controls]').dataset.state),null,{timeout:90000});
 assert.equal(await page.getByTestId('webcam-controls').getAttribute('data-state'),'running');
 for(const [label,viewport] of [['desktop',{width:1280,height:1040}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(300);
  const bounds=await page.getByTestId('webcam-controls').evaluate(panel=>{
   const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
   return{panel:rect(panel),video:rect(panel.querySelector('video')),parent:rect(panel.parentElement),position:getComputedStyle(panel).position,viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth+1};
  });samples.push({label,...bounds});await page.screenshot({path:join(out,`webcam-layout-${label}.png`)});
  if(process.env.AVATAR_LAYOUT_PROBE!=='1')assert(bounds.panel.y>=0&&bounds.panel.bottom<=viewport.height&&bounds.panel.right<=viewport.width&&!bounds.overflow,`${label}: whole camera panel must fit visible viewport`);
 }
 await page.getByTestId('webcam-controls').getByRole('button',{name:'Stop webcam',exact:true}).click();
 assert.deepEqual(errors,[]);report={...report,passed:true,samples,errors};
}catch(error){report={...report,error:String(error),samples,errors};process.exitCode=1;}
finally{writeFileSync(join(out,'webcam-layout-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
