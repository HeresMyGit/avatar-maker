import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const mode = process.env.AVATAR_QA_MODE || 'all';
if (!['all', 'exports', 'capture'].includes(mode)) throw new Error('AVATAR_QA_MODE must be all, exports, or capture.');
const url = process.env.AVATAR_MAKER_URL || 'http://127.0.0.1:5187/';
const fixture = process.env.AVATAR_CAMERA_FIXTURE;
if (!fixture) throw new Error('Set AVATAR_CAMERA_FIXTURE to a prerecorded tongue-positive Y4M video; physical devices are never used.');
const out = resolve(process.env.AVATAR_QA_OUTPUT || 'test-results/avatar-maker');
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
  `--use-file-for-fake-video-capture=${fixture}`, '--autoplay-policy=no-user-gesture-required']});
const context = await browser.newContext({ignoreHTTPSErrors:process.env.AVATAR_QA_INSECURE_TLS==='1',permissions:['camera'],viewport:{width:1280,height:1040},deviceScaleFactor:.5,acceptDownloads:true});
const helperURL = new URL('__qa_render_helper.mjs', url).href;
const helper = await build({ stdin: { contents: "export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; export * as THREE from 'three';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), sourcefile: 'qa-render-helper.js' }, bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' });
await context.route(helperURL, route => route.fulfill({ body: helper.outputFiles[0].text, contentType: 'text/javascript' }));
const page = await context.newPage();
const errors=[], failures=[], requests=[], diagnostics=[], checks={}, screenshots=[];
let report={passed:false,url,fixture,mode,actualCameraAccess:false};
page.on('pageerror',e=>errors.push(e.message));
context.on('request',r=>requests.push(r.url()));
context.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
page.on('console',m=>{if(m.type()==='error'||/Tongue model|tracking.*failed/i.test(m.text()))diagnostics.push(m.text());});
await page.addInitScript(()=>{
  if (window.top !== window || !navigator.mediaDevices) return;
  const qa=window.__avatarQA={scenes:[],mediaRequests:[],tracks:[],stops:0,workers:[],mediaMode:'normal'};
  const hook=window.__THREE_DEVTOOLS__=new EventTarget();
  hook.addEventListener('observe',e=>{if(e.detail?.isScene)qa.scenes.push(e.detail);});
  const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const record=async constraints=>{const stream=await native(constraints);for(const track of stream.getTracks()){
    qa.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{qa.stops++;return stop();};}return stream;};
  navigator.mediaDevices.getUserMedia=constraints=>{
    qa.mediaRequests.push(constraints);
    if(qa.mediaMode==='denied')return Promise.reject(new DOMException('QA denied permission','NotAllowedError'));
    if(qa.mediaMode==='deferred')return new Promise(resolve=>{qa.releaseMedia=async()=>resolve(await record(constraints));});
    return record(constraints);
  };
  const Worker=window.Worker;
  window.Worker=class extends Worker{constructor(...args){super(...args);const entry={url:args[0],messages:[],terminated:false};qa.workers.push(entry);
    const post=this.postMessage.bind(this);this.postMessage=(message,...rest)=>{if(message.type!=='frame')entry.messages.push(message);if(message.type==='init'&&qa.deferCaptureInit){qa.captureInitDeferred=true;return;}return post(message,...rest);};
    const terminate=this.terminate.bind(this);this.terminate=()=>{entry.terminated=true;return terminate();};}};
});
const panel=()=>page.getByTestId('webcam-controls');
const state=()=>panel().getAttribute('data-state');
const live=()=>page.evaluate(()=>{
  const scene=window.__avatarQA.scenes.find(s=>s.getObjectByName('mouth_robot'));
  const visible=[],morphs={},materials={};
  scene?.traverse(o=>{if(o.isMesh&&o.visible){visible.push(o.name);if(o.morphTargetDictionary)morphs[o.name]=Object.fromEntries(Object.entries(o.morphTargetDictionary).map(([k,i])=>[k,o.morphTargetInfluences[i]]));
    materials[o.name]=[].concat(o.material).map(m=>({color:m.color?.getHexString(),map:!!m.map,image:m.map?.image?{width:m.map.image.width,height:m.map.image.height}:null}));}});
  return {visible,morphs,materials,tracks:window.__avatarQA.tracks.map(t=>t.readyState),requests:window.__avatarQA.mediaRequests.length};
});
const screenshot=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,name)});screenshots.push(name);};
const select=async(category,label)=>{
  const option=page.getByRole('button',{name:label,exact:true});
  const collapsed=await option.evaluate(button=>button.parentElement.getBoundingClientRect().height<5);
  if(collapsed)await option.locator('..').locator('..').locator(':scope > div').first().click();
  await option.click();
  await page.waitForTimeout(180);
  await option.locator('..').locator('..').locator(':scope > div').first().click();
};
const reset=()=>page.getByRole('button',{name:/Reset/}).click();
const exportAndReload=async(label,kind)=>{
  await page.getByRole('button',{name:/Export/}).click();
  const pending=page.waitForEvent('download',{timeout:60000});
  await page.getByText(kind==='animated'?'Animated GLB':'T-Pose GLB',{exact:true}).click();
  const download=await pending,path=join(out,`${label}-${kind}.glb`);
  await download.saveAs(path);
  assert.equal(await download.failure(),null);
  const exportURL=new URL(`__qa_${label}_${kind}.glb`,url).href;
  await context.route(exportURL,r=>r.fulfill({path,contentType:'model/gltf-binary'}));
  const result=await page.evaluate(async({exportURL,kind,helperURL})=>{
    const {GLTFLoader,THREE:T}=await import(helperURL);
    const gltf=await new GLTFLoader().loadAsync(exportURL),materials=[],meshes=[];
    gltf.scene.traverse(o=>{if(o.isMesh){meshes.push(o.name);for(const m of [].concat(o.material))if(m.map){
      const image=m.map.image,canvas=document.createElement('canvas');canvas.width=canvas.height=8;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,8,8);
      const pixels=[...ctx.getImageData(0,0,8,8).data];materials.push({name:m.name,width:image.width,height:image.height,colors:new Set(pixels.filter((_,i)=>i%4!==3)).size});}}});
    const renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setSize(480,540);renderer.setPixelRatio(1);
    const scene=new T.Scene();scene.background=new T.Color('#1b2028');scene.add(gltf.scene,new T.HemisphereLight(0xffffff,0x777777,2));const light=new T.DirectionalLight(0xffffff,3);light.position.set(2,4,3);scene.add(light);
    gltf.scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(gltf.scene),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
    const camera=new T.PerspectiveCamera(32,480/540,.01,1000);camera.position.copy(center).add(new T.Vector3(size.y*.2,size.y*.12,size.y*2.2));camera.lookAt(center);
    renderer.render(scene,camera);renderer.domElement.id='qa-export-render';renderer.domElement.style='position:fixed;top:50px;left:20px;z-index:99999;border:2px solid white';document.body.append(renderer.domElement);
    window.__avatarQA.exportCleanup=()=>{renderer.domElement.remove();renderer.dispose();gltf.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();[].concat(o.material).forEach(m=>{m.map?.dispose();m.dispose();});}});};
    return {meshes,materials,bounds:{min:box.min.toArray(),max:box.max.toArray(),size:size.toArray()},animations:gltf.animations.length,kind,referenceData:!!gltf.scene.userData.mferRuntimeReferences};
  },{exportURL,kind,helperURL});
  checks.exportInspection??=[];checks.exportInspection.push(result);
  assert(result.materials.length>0&&result.materials.every(m=>m.width>=1&&m.height>=1)&&result.materials.some(m=>m.colors>1),'Reimported texture pixels decode and retain color');
  assert.equal(result.animations>0,kind==='animated');
  assert(result.bounds.size[1]>.5&&result.bounds.size[1]<3,'Export preserves avatar world height and vertical orientation');
  await page.locator('#qa-export-render').screenshot({path:join(out,`${label}-${kind}-reimport.png`)});screenshots.push(`${label}-${kind}-reimport.png`);
  await page.evaluate(()=>window.__avatarQA.exportCleanup());
  return {file:path,...result};
};
try{
  await page.goto(url);
  checks.origin=await page.evaluate(()=>({origin:location.origin,secure:isSecureContext}));
  assert(checks.origin.secure,'Webcam origin must be a secure context');
  await page.waitForFunction(()=>window.__avatarQA.scenes.some(s=>s.getObjectByName('mouth_robot')),null,{timeout:90000});
  await page.waitForTimeout(1200);
  checks.initial=await live();assert(checks.initial.visible.length>3);assert.equal(checks.initial.requests,0);
  assert(!requests.some(u=>u.includes('/avatar/vendor/')),'Models must not load before webcam click');
  assert.equal(await page.getByRole('link',{name:'Home',exact:true}).count(),0,'Standalone playground has no extra navigation header');
  if(mode!=='capture'){
  await reset();checks.reset=await live();assert.equal(checks.reset.requests,0);
  await page.getByRole('button',{name:/Random/}).click();checks.random=await live();assert(checks.random.visible.length>3);
  await reset();
  await select('Type','Robot mfer');
  checks.robot=await live();for(const name of ['type_robot','eyes_robot','mouth_robot','robot_light'])assert(checks.robot.visible.includes(name),name);
  await select('Long Hair','Black Long Hair');await select('Chain','Gold Chain');await select('Shirt','Gray Hoodie Down');
  await screenshot('robot-maker.png');
  for (const label of ['Portrait','Viewfinder']) {
    await page.getByRole('button',{name:/Photo/}).click();
    const pending=page.waitForEvent('download',{timeout:30000});
    await page.getByText(label,{exact:true}).click();
    const download=await pending;
    await download.saveAs(join(out,`robot-${label.toLowerCase()}.png`));
    assert.equal(await download.failure(),null);
  }
  checks.photos=true;
  checks.robotExport=await exportAndReload('robot','animated');
  assert(checks.robotExport.meshes.includes('mouth_robot'));assert(!checks.robotExport.meshes.some(n=>/^mouth_(smile|flat)/.test(n)));
  await reset();await select('Type','Metal mfer');await select('Mouth','Flat');await select('Eyes','Metal eyes');await select('Shirt','Blue Collared Shirt');await select('Long Hair','Black Long Hair');await select('Chain','Gold Chain');
  checks.metalFlat=await live();assert(checks.metalFlat.visible.includes('mouth_flat_metal'));assert.deepEqual(checks.metalFlat.materials.mouth_flat_metal,checks.metalFlat.materials.type_metal,'Metal lips keep the same material color as the body');
  await screenshot('metal-flat-maker.png');
  checks.flatExport=await exportAndReload('flat-metal','t-pose');assert(checks.flatExport.meshes.includes('mouth_flat_metal'));assert(!checks.flatExport.meshes.includes('mouth_smile'));
  console.log('Visual trait and both GLB export/reimport checks passed');
  } else { await reset();await select('Type','Metal mfer');await select('Mouth','Flat');await select('Eyes','Metal eyes'); }
  if(mode!=='exports'){
  console.log('Starting real fake-camera inference');
  await panel().getByRole('button',{name:'◉ Webcam',exact:true}).click();
  await page.waitForFunction(()=>['running','error'].includes(document.querySelector('[data-testid="webcam-controls"]').dataset.state),null,{timeout:90000});
  assert.equal(await state(),'running',await panel().innerText());
  await page.waitForFunction(()=>{const scene=window.__avatarQA.scenes.find(s=>s.getObjectByName('mouth_robot'));return scene?.getObjectByName('tongue')?.visible;},null,{timeout:60000});
  checks.capture=await live();assert(checks.capture.visible.includes('tongue'));
  assert(checks.capture.morphs.mouth_flat_metal.mouthOpenExtra>.1);
  await panel().getByRole('button',{name:'Calibrate',exact:true}).click();
  await select('Type','Robot mfer');
  await page.waitForFunction(()=>{const scene=window.__avatarQA.scenes.find(s=>s.getObjectByName('mouth_robot'));const m=scene?.getObjectByName('mouth_robot');return m?.visible&&m.morphTargetInfluences[m.morphTargetDictionary.robotGrilleOpen]>.1&&scene.getObjectByName('tongue').visible;},null,{timeout:20000});
  checks.robotCapture=await live();
  await screenshot('robot-webcam-fake-fixture.png');
  await page.setViewportSize({width:390,height:844});
  await panel().scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  checks.mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,width:innerWidth,controls:!!document.querySelector('[data-testid=webcam-controls] video')?.srcObject}));
  assert(!checks.mobile.overflow&&checks.mobile.controls,'Mobile keeps webcam controls and avoids horizontal overflow');
  await page.screenshot({path:join(out,'mobile-webcam-fake-fixture.png')});screenshots.push('mobile-webcam-fake-fixture.png');
  await page.setViewportSize({width:1280,height:1040});
  checks.worker=await page.evaluate(()=>window.__avatarQA.workers.map(w=>({terminated:w.terminated,messages:w.messages})));
  assert(checks.worker.some(w=>w.messages.some(m=>m.type==='init'&&m.mode==='enhanced'&&m.hands===true)));
  assert(requests.some(u=>u.endsWith('/avatar/vendor/tongue/tongue-keypoint.onnx')));
  await panel().getByRole('button',{name:'Stop webcam',exact:true}).click();
  await page.waitForTimeout(500);checks.stopped=await live();assert(checks.stopped.tracks.every(s=>s==='ended'));assert(!checks.stopped.visible.includes('tongue'));
  assert.equal(await page.locator('video[aria-label="Your webcam preview"]').evaluate(v=>v.srcObject===null),true);
  if(mode==='all'){
  await page.evaluate(()=>window.__avatarQA.mediaMode='denied');
  await panel().getByRole('button',{name:'◉ Webcam',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="webcam-controls"]').dataset.state==='error');
  checks.permissionError=await panel().innerText();assert.match(checks.permissionError,/Permission was denied/i);
  await page.evaluate(()=>window.__avatarQA.mediaMode='deferred');
  await panel().getByRole('button',{name:'◉ Webcam',exact:true}).click();
  await panel().getByRole('button',{name:'Cancel camera',exact:true}).click();
  await page.evaluate(()=>window.__avatarQA.releaseMedia());
  await page.waitForFunction(()=>window.__avatarQA.tracks.every(t=>t.readyState==='ended'));
  checks.cancel={state:await state(),...(await live())};assert.equal(checks.cancel.state,'off');
  await page.evaluate(()=>{window.__avatarQA.mediaMode='normal';window.__avatarQA.deferCaptureInit=true;});
  await panel().getByRole('button',{name:'◉ Webcam',exact:true}).click();
  await page.waitForFunction(()=>window.__avatarQA.captureInitDeferred);
  await page.evaluate(()=>{const track=window.__avatarQA.tracks.at(-1);track.stop();track.dispatchEvent(new Event('ended'));});
  await page.waitForFunction(()=>document.querySelector('[data-testid="webcam-controls"]').dataset.state==='error');
  await page.waitForTimeout(1000);
  checks.startupDisconnect={state:await state(),...(await live())};
  assert.equal(checks.startupDisconnect.state,'error');assert(checks.startupDisconnect.tracks.every(s=>s==='ended'));
  await page.evaluate(()=>window.__avatarQA.deferCaptureInit=false);
  await page.evaluate(()=>window.__avatarQA.mediaMode='normal');
  await panel().getByRole('button',{name:'◉ Webcam',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="webcam-controls"]').dataset.state==='running',null,{timeout:90000});
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(()=>window.__avatarQA.tracks.every(t=>t.readyState==='ended'));
  checks.unmount=await page.evaluate(()=>({tracks:window.__avatarQA.tracks.map(t=>t.readyState),liveCaptureWorkers:window.__avatarQA.workers.filter(w=>w.messages.some(m=>m.type==='init')&&!w.terminated).length,requests:window.__avatarQA.mediaRequests}));
  assert.equal(checks.unmount.liveCaptureWorkers,0);assert(checks.unmount.requests.every(r=>r.audio===false));
  }
  }
  assert.deepEqual(errors,[]);
  checks.localhostDependencies=requests.filter(value=>{try{const request=new URL(value),pageOrigin=new URL(url);return !['localhost','127.0.0.1','[::1]'].includes(pageOrigin.hostname)&&['localhost','127.0.0.1','[::1]'].includes(request.hostname);}catch{return false;}});
  assert.deepEqual(checks.localhostDependencies,[],'A LAN browser must not depend on this computer\'s localhost');
  const failedRuntime=failures.filter(f=>f.url.includes('/avatar/vendor/'));
  assert.deepEqual(failedRuntime,[]);
  rmSync(join(out,'failure.png'),{force:true});
  report={...report,passed:true,scope:'Local app with real Chromium texture decoding/export and MediaPipe + neural tongue on prerecorded virtual camera; does not establish live-user accuracy.',checks,screenshots,errors,failures,diagnostics,modelRequests:[...new Set(requests.filter(u=>u.includes('/avatar/vendor/')))]};
}catch(error){report={...report,error:String(error),checks,screenshots,errors,failures,diagnostics,lastUI:await page.locator('body').innerText().catch(()=>''),modelRequests:[...new Set(requests.filter(u=>u.includes('/avatar/vendor/')))]};await screenshot('failure.png').catch(()=>{});process.exitCode=1;}
finally{writeFileSync(join(out,`browser-${mode}-validation.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,error:report.error,report:join(out,`browser-${mode}-validation.json`),screenshots}));await context.close();await browser.close();}
