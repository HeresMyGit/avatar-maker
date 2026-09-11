import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { closeSync, mkdirSync, openSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.AVATAR_MAKER_URL || 'http://127.0.0.1:5187/';
const out = resolve(process.env.AVATAR_QA_OUTPUT || 'test-results/beacon-export');
mkdirSync(out, { recursive: true });

function readGLBJSON(path) {
  const fd = openSync(path, 'r');
  try {
    const header = Buffer.alloc(20);
    readSync(fd, header, 0, header.length, 0);
    assert.equal(header.readUInt32LE(0), 0x46546c67, 'File must be binary glTF');
    assert.equal(header.readUInt32LE(16), 0x4e4f534a, 'First GLB chunk must contain JSON');
    const data = Buffer.alloc(header.readUInt32LE(12));
    readSync(fd, data, 0, data.length, 20);
    return JSON.parse(data.toString('utf8'));
  } finally { closeSync(fd); }
}

const source = readGLBJSON(fileURLToPath(new URL('../public/avatar/mfermashup.glb', import.meta.url)));
const sourceClips = (source.animations || []).map(clip => clip.name);
const helper = await build({
  stdin: {
    contents: "export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'; export * as THREE from 'three';",
    resolveDir: fileURLToPath(new URL('../', import.meta.url)), sourcefile: 'beacon-qa-helper.js',
  }, bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent',
});
const browser = await chromium.launch({
  headless: true, channel: process.env.PLAYWRIGHT_CHANNEL,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  ignoreHTTPSErrors: process.env.AVATAR_QA_INSECURE_TLS === '1',
  viewport: { width: 1280, height: 1040 }, deviceScaleFactor: 1, acceptDownloads: true,
});
const helperURL = new URL('__qa_beacon_helper.mjs', url).href;
const standaloneURL = new URL('__qa_beacon_standalone.html', url).href;
const exportURL = new URL('__qa_robot_blinking.glb', url).href;
await context.route(helperURL, route => route.fulfill({ body: helper.outputFiles[0].text, contentType: 'text/javascript' }));
await context.route(standaloneURL, route => route.fulfill({
  body: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Standalone GLB beacon verification</title><style>body{margin:0;background:#12151a;display:grid;place-items:center;min-height:100vh}canvas{display:block}</style>',
  contentType: 'text/html',
}));
const errors = [], failures = [], requests = [], screenshots = [], checks = {};
let mediaRequests = 0;
await context.exposeBinding('__recordBeaconMediaRequest', () => { mediaRequests++; });
await context.addInitScript(() => {
  const qa = window.__beaconQA = { scenes: [] };
  const hook = window.__THREE_DEVTOOLS__ = new EventTarget();
  hook.addEventListener('observe', event => { if (event.detail?.isScene) qa.scenes.push(event.detail); });
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
    await window.__recordBeaconMediaRequest();
    throw new DOMException('Camera is intentionally unavailable in this export test.', 'NotAllowedError');
  };
});
context.on('request', request => requests.push(request.url()));
context.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const page = await context.newPage();
let standalone;
let report = { passed: false, url, actualCameraAccess: false };
const screenshot = async (target, name) => {
  await target.screenshot({ path: join(out, name) });
  screenshots.push(name);
};

try {
  await page.goto(url);
  await page.waitForFunction(() => window.__beaconQA.scenes.some(scene => scene.getObjectByName('mouth_robot')), null, { timeout: 90000 });
  await page.waitForTimeout(1700);
  await page.getByRole('button', { name: /Reset/ }).click();
  const robotOption = page.getByRole('button', { name: 'Robot mfer', exact: true });
  if (await robotOption.evaluate(button => button.parentElement.getBoundingClientRect().height < 5)) {
    await robotOption.locator('..').locator('..').locator(':scope > div').first().click();
  }
  await robotOption.click();
  await page.waitForFunction(() => window.__beaconQA.scenes.some(scene => scene.getObjectByName('type_robot')?.visible));
  await page.waitForTimeout(300);
  await screenshot(page, 'robot-playground.png');
  await page.getByRole('button', { name: /Export/ }).click();
  const pending = page.waitForEvent('download', { timeout: 60000 });
  await page.getByText('Animated GLB', { exact: true }).click();
  const download = await pending;
  const exportPath = join(out, 'robot-blinking.glb');
  await download.saveAs(exportPath);
  assert.equal(await download.failure(), null);

  const exportedJSON = readGLBJSON(exportPath);
  const exportedClips = (exportedJSON.animations || []).map(clip => clip.name);
  checks.animations = { original: sourceClips, exported: exportedClips };
  assert.deepEqual(exportedClips.filter(name => name !== 'Beacon Blink'), sourceClips, 'Every original clip survives export');
  assert.equal(exportedClips.filter(name => name === 'Beacon Blink').length, 1);
  assert(!(exportedJSON.extensionsUsed || []).includes('KHR_animation_pointer'), 'Blink uses standard glTF animation');
  assert(!(exportedJSON.extensionsRequired || []).includes('KHR_animation_pointer'));
  const glowNodeIndex = exportedJSON.nodes.findIndex(node => node.name === 'robot_light_glow');
  assert(glowNodeIndex >= 0, 'Export contains portable beacon glow');
  checks.standardGLTF = {
    extensionsUsed: exportedJSON.extensionsUsed || [], extensionsRequired: exportedJSON.extensionsRequired || [],
    glowNode: exportedJSON.nodes[glowNodeIndex],
    clips: exportedJSON.animations.map(animation => ({
      name: animation.name,
      glowChannels: animation.channels.filter(channel => channel.target.node === glowNodeIndex).map(channel => ({
        path: channel.target.path, interpolation: animation.samplers[channel.sampler].interpolation,
      })),
    })),
  };
  for (const clip of checks.standardGLTF.clips) {
    assert(clip.glowChannels.some(channel => channel.path === 'weights' && channel.interpolation === 'STEP'), `${clip.name} drives the beacon with ordinary STEP morph animation`);
  }
  await context.route(exportURL, route => route.fulfill({ path: exportPath, contentType: 'model/gltf-binary' }));

  // This page has no playground scripts, capture module, or avatar companion runtime.
  standalone = await context.newPage();
  await standalone.goto(standaloneURL);
  checks.standalone = await standalone.evaluate(async ({ helperURL, exportURL }) => {
    const { GLTFLoader, RoomEnvironment, THREE: T } = await import(helperURL);
    const gltf = await new GLTFLoader().loadAsync(exportURL);
    const scene = new T.Scene(); scene.background = new T.Color('#171c25'); scene.add(gltf.scene);
    scene.add(new T.HemisphereLight(0xffffff, 0x3d465b, 1));
    const key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 3); scene.add(key);
    const fill = new T.DirectionalLight(0x93b9ff, .8); fill.position.set(-2, 2, -1); scene.add(fill);
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(720, 720);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    const environment = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(renderer);
    const studioEnvironment = pmrem.fromScene(environment, .04).texture;
    environment.dispose(); pmrem.dispose();
    renderer.domElement.id = 'beacon-render'; document.body.append(renderer.domElement);
    const glow = gltf.scene.getObjectByName('robot_light_glow');
    const lamp = gltf.scene.getObjectByName('robot_light');
    const head = (() => { let result; gltf.scene.traverse(node => { if (node.isBone && /Head$/.test(node.name)) result = node; }); return result; })();
    if (!glow || !lamp || !head) throw new Error('Export is missing its glow, lamp, or head bone');
    const morphIndex = glow.morphTargetDictionary?.beaconBlink;
    if (morphIndex === undefined) throw new Error('Export lacks the named beaconBlink morph');
    const blink = gltf.animations.find(clip => clip.name === 'Beacon Blink');
    const mixer = new T.AnimationMixer(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    const updateSkeletons = () => {
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(node => { if (node.isSkinnedMesh) node.skeleton.update(); });
    };
    const bounds = mesh => {
      // Explicitly evaluate each vertex so skinned + morphed world bounds are current.
      const box = new T.Box3(), vertex = new T.Vector3();
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, vertex); vertex.applyMatrix4(mesh.matrixWorld); box.expandByPoint(vertex);
      }
      return box;
    };
    const plainBox = box => ({ min: box.min.toArray(), max: box.max.toArray(), center: box.getCenter(new T.Vector3()).toArray(), size: box.getSize(new T.Vector3()).toArray() });
    const camera = new T.PerspectiveCamera(28, 1, .001, 100);
    const full = new T.Box3().setFromObject(gltf.scene, true);
    const fullCenter = full.getCenter(new T.Vector3()), fullSize = full.getSize(new T.Vector3());
    const baseHeadQuaternion = head.quaternion.clone();
    let activeClip;
    const activate = clip => {
      mixer.stopAllAction(); head.quaternion.copy(baseHeadQuaternion);
      activeClip = clip; mixer.clipAction(clip).reset().setLoop(T.LoopRepeat, Infinity).play();
    };
    const sample = (time, kind = 'close', turnHead = false) => {
      mixer.setTime(time);
      if (turnHead) head.quaternion.copy(baseHeadQuaternion).multiply(new T.Quaternion().setFromEuler(new T.Euler(.15, .42, .2)));
      updateSkeletons();
      const lampBox = bounds(lamp), glowBox = bounds(glow), center = lampBox.getCenter(new T.Vector3());
      if (kind === 'full') {
        scene.environment = studioEnvironment;
        camera.fov = 28; camera.position.copy(fullCenter).add(new T.Vector3(fullSize.y * .12, fullSize.y * .04, fullSize.y * 2.2)); camera.lookAt(fullCenter);
      } else {
        // Keep the pixel comparison under fixed direct lights. A studio map is
        // useful for the reflective portrait, but clips the red channel here.
        scene.environment = null;
        camera.fov = 28;
        const extent = Math.max(...lampBox.getSize(new T.Vector3()).toArray());
        camera.position.copy(center).add(new T.Vector3(extent * .65, extent * .12, extent * 7)); camera.lookAt(center);
      }
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      renderer.render(scene, camera);
      const gl = renderer.getContext(), width = renderer.domElement.width, height = renderer.domElement.height;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const projected = [];
      for (const x of [lampBox.min.x, lampBox.max.x]) for (const y of [lampBox.min.y, lampBox.max.y]) for (const z of [lampBox.min.z, lampBox.max.z]) {
        const p = new T.Vector3(x, y, z).project(camera); projected.push({ x: (p.x + 1) * width / 2, y: (p.y + 1) * height / 2 });
      }
      const left = Math.max(0, Math.floor(Math.min(...projected.map(p => p.x))) - 8), right = Math.min(width - 1, Math.ceil(Math.max(...projected.map(p => p.x))) + 8);
      const bottom = Math.max(0, Math.floor(Math.min(...projected.map(p => p.y))) - 8), top = Math.min(height - 1, Math.ceil(Math.max(...projected.map(p => p.y))) + 8);
      let luminance = 0, red = 0, count = 0, brightRed = 0;
      for (let y = bottom; y <= top; y++) for (let x = left; x <= right; x++) {
        const index = (y * width + x) * 4, r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
        red += r; luminance += .2126 * r + .7152 * g + .0722 * b; count++;
        if (r > 180 && r > g * 1.4 && r > b * 1.4) brightRed++;
      }
      return { time, clip: activeClip.name, influence: glow.morphTargetInfluences[morphIndex], lamp: plainBox(lampBox), glow: plainBox(glowBox), pixels: { meanRed: red / count, meanLuminance: luminance / count, brightRed, count, region: { left, right, bottom, top } } };
    };
    window.__beaconStandalone = { gltf, mixer, glow, lamp, head, blink, activate, sample, renderer };
    activate(blink);
    return { clips: gltf.animations.map(clip => ({ name: clip.name, duration: clip.duration })), metadata: gltf.scene.userData.mferAvatar?.beaconBlink, glowSkinned: !!glow.isSkinnedMesh, lampSkinned: !!lamp.isSkinnedMesh, head: head.name, morphs: glow.morphTargetDictionary, runtimeLoaded: false };
  }, { helperURL, exportURL });
  const duration = checks.standalone.clips.find(clip => clip.name === 'Beacon Blink').duration;
  assert(duration > .7 && duration < 1.5, 'Portable blink retains a roughly one-second beacon rhythm');
  assert(Math.abs(duration - checks.standalone.metadata.periodSeconds) < 1e-5, 'Blink clip matches its documented period');
  const sample = (fraction, kind = 'close', turnHead = false) => standalone.evaluate(({ fraction, kind, turnHead }) => {
    const qa = window.__beaconStandalone;
    return qa.sample(qa.blink.duration * fraction, kind, turnHead);
  }, { fraction, kind, turnHead });
  checks.off = await sample(.05);
  await screenshot(standalone.locator('#beacon-render'), 'beacon-off-closeup.png');
  checks.on = await sample(.25);
  await screenshot(standalone.locator('#beacon-render'), 'beacon-on-closeup.png');
  checks.afterPulse = await sample(.6);
  assert.equal(checks.off.influence, 0);
  assert.equal(checks.on.influence, 1);
  assert.equal(checks.afterPulse.influence, 0);
  checks.pixelDifference = {
    red: checks.on.pixels.meanRed - checks.off.pixels.meanRed,
    luminance: checks.on.pixels.meanLuminance - checks.off.pixels.meanLuminance,
    brightRedPixels: checks.on.pixels.brightRed - checks.off.pixels.brightRed,
  };
  assert(checks.pixelDifference.red > 5, 'Blink must visibly brighten the actual rendered red lamp');
  assert(checks.pixelDifference.luminance > 1, 'Blink must increase rendered luminance');
  checks.portrait = await sample(.25, 'full');
  await screenshot(standalone.locator('#beacon-render'), 'robot-standalone-portrait.png');
  checks.rotated = await sample(.25, 'close', true);
  await screenshot(standalone.locator('#beacon-render'), 'beacon-head-turn-closeup.png');
  const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
  const lampSize = Math.hypot(...checks.on.lamp.size);
  const lampTravel = distance(checks.on.lamp.center, checks.rotated.lamp.center);
  const lampDelta = checks.rotated.lamp.center.map((value, i) => value - checks.on.lamp.center[i]);
  const glowDelta = checks.rotated.glow.center.map((value, i) => value - checks.on.glow.center[i]);
  checks.attachment = { lampTravel, glowTravel: distance(checks.on.glow.center, checks.rotated.glow.center), travelMismatch: distance(lampDelta, glowDelta), lampSize, rotatedCenterDistance: distance(checks.rotated.lamp.center, checks.rotated.glow.center) };
  assert(lampTravel > lampSize * .2, 'Head rotation genuinely moves the antenna');
  assert(checks.attachment.travelMismatch < lampSize * .15, 'Glow follows the lamp through a head turn');
  assert(checks.attachment.rotatedCenterDistance < lampSize * .15, 'Glow stays centered on the lamp after turning');
  checks.idle = await standalone.evaluate(() => {
    const qa = window.__beaconStandalone;
    const idle = qa.gltf.animations.find(clip => clip.name !== 'Beacon Blink');
    if (!idle) return null;
    qa.activate(idle);
    return { name: idle.name, off: qa.sample(qa.blink.duration * .05), on: qa.sample(qa.blink.duration * .25), afterPulse: qa.sample(qa.blink.duration * .6) };
  });
  assert(checks.idle, 'An authored idle animation is available');
  assert.equal(checks.idle.off.influence, 0);
  assert.equal(checks.idle.on.influence, 1);
  assert.equal(checks.idle.afterPulse.influence, 0);
  checks.cameraRequests = mediaRequests;
  assert.equal(mediaRequests, 0, 'Export and standalone replay never request a camera');
  assert(!requests.some(request => request.includes('/avatar/vendor/')), 'Export never starts tracking or fetches capture models');
  assert.deepEqual(errors, [], 'Neither playground export nor standalone playback raises a browser error');
  const standaloneRequests = await standalone.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  checks.standaloneRequests = standaloneRequests;
  assert(standaloneRequests.every(request => [helperURL, exportURL].includes(request) || request.startsWith('blob:')), 'Standalone renderer only loads Three.js, the downloaded GLB, and its embedded textures');
  rmSync(join(out, 'beacon-failure.png'), { force: true });
  report = { ...report, passed: true, exportPath, scope: 'Actual playground Animated GLB download, reimported with only GLTFLoader and AnimationMixer. Deterministic rendered off/on and head-turn verification, plus authored idle animation. No webcam access.', checks, screenshots, errors, failures };
} catch (error) {
  report = { ...report, error: String(error), stack: error.stack, checks, screenshots, errors, failures, cameraRequests: mediaRequests, lastUI: await page.locator('body').innerText().catch(() => '') };
  await screenshot(standalone || page, 'beacon-failure.png').catch(() => {});
  process.exitCode = 1;
} finally {
  const path = join(out, 'beacon-browser-validation.json');
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, error: report.error, report: path, screenshots }));
  await context.close(); await browser.close();
}
