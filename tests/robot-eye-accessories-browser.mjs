import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.AVATAR_MAKER_URL||'http://127.0.0.1:5187/';
const out=resolve(process.env.AVATAR_QA_OUTPUT||'test-results/robot-eye-accessories');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL});
const context=await browser.newContext({ignoreHTTPSErrors:process.env.AVATAR_QA_INSECURE_TLS==='1',viewport:{width:1280,height:1040},deviceScaleFactor:.75});
const page=await context.newPage(),errors=[],failures=[],cases=[];
page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
await page.addInitScript(()=>{if(window.top!==window||!navigator.mediaDevices)return;const qa=window.__robotEyeQA={scenes:[],captures:[]};const hook=window.__THREE_DEVTOOLS__=new EventTarget();hook.addEventListener('observe',e=>{if(e.detail?.isScene)qa.scenes.push(e.detail);});navigator.mediaDevices.getUserMedia=async options=>{qa.captures.push(options);throw new Error('No camera access in trait-only QA');};});
const select=async label=>{const option=page.getByRole('button',{name:label,exact:true});const header=option.locator('..').locator('..').locator(':scope > div').first();
 if(await option.evaluate(o=>o.parentElement.getBoundingClientRect().height<5))await header.click();await option.click();await header.click();await page.waitForTimeout(350);};
const snapshot=()=>page.evaluate(()=>{const scene=window.__robotEyeQA.scenes.find(s=>s.getObjectByName('type_robot')),visible=[],positions={};scene.traverse(o=>{if(o.isMesh&&o.visible){visible.push(o.name);if(o.name.startsWith('eyes_'))positions[o.name]={vertices:o.geometry.attributes.position.count,worldMatrix:o.matrixWorld.elements.every(Number.isFinite)};}});return{visible,positions,captures:window.__robotEyeQA.captures};});
let report={passed:false,url,actualCameraAccess:false};
try{
 await page.goto(url);await page.waitForFunction(()=>window.__robotEyeQA.scenes.some(s=>s.getObjectByName('mouth_robot')),null,{timeout:90000});await page.waitForTimeout(700);
 await page.getByRole('button',{name:/Reset/}).click();await select('Robot mfer');
 for(const[label,choose,expected]of[['default',null,['eyes_robot']],['nerd','Nerd glasses',['eyes_normal','eyes_glasses','eyes_glasses_nerd']],['mask','Eye mask',['eyes_normal','eyes_eye_mask']],['restored','Robot visor',['eyes_robot']]]){
  if(choose)await select(choose);const state=await snapshot();const eyes=state.visible.filter(n=>n.startsWith('eyes_')).sort();assert.deepEqual(eyes,[...expected].sort(),label);assert(state.visible.includes('type_robot')&&state.visible.includes('mouth_robot'));assert(Object.values(state.positions).every(p=>p.vertices>0&&p.worldMatrix));assert.deepEqual(state.captures,[]);
  await page.evaluate(()=>scrollTo(0,0));const screenshot=`robot-eyes-${label}.png`;await page.screenshot({path:join(out,screenshot)});cases.push({label,...state,screenshot});
 }
 for(const[label,mouth,unrelated,expected]of[['smile','Smile','White headphones','mouth_smile'],['flat','Flat','Gold Chain','mouth_flat'],['checkerboard-restored','Robot checkerboard',null,'mouth_robot']]){
  await select(mouth);if(unrelated)await select(unrelated);const state=await snapshot();assert(state.visible.includes('type_robot'));assert.deepEqual(state.visible.filter(n=>n.startsWith('mouth_')),[expected],`${label}: chosen mouth persists through unrelated trait changes`);assert.deepEqual(state.captures,[]);
  await page.evaluate(()=>scrollTo(0,0));const screenshot=`robot-mouth-${label}.png`;await page.screenshot({path:join(out,screenshot)});cases.push({label,...state,screenshot});
 }
 assert.deepEqual(errors,[]);report={...report,passed:true,cases,errors,failures};
}catch(error){report={...report,error:String(error),cases,errors,failures};await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{writeFileSync(join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,report:join(out,'validation.json')}));await browser.close();}
