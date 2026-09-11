import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createVisionEngine, freshTrackingChannels, visionWorkerSource } from '../src/avatar/runtime/tracking';

let clock = 1000;
const realPerformance = globalThis.performance;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
class HardwareCanvas {
  constructor(public width: number, public height: number) {}
  getContext() { return { RENDERER: 1, getParameter: () => 'Hardware GPU', getExtension: (name: string) => name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : { loseContext() {} } }; }
}
Object.assign(globalThis, { OffscreenCanvas: HardwareCanvas });
const landmark = (x = .5) => ({ x, y: .5, z: 0, visibility: .99, presence: .99 });
const hand = { landmarks: [Array.from({ length: 21 }, () => landmark())], worldLandmarks: [Array.from({ length: 21 }, () => landmark(.01))], handedness: [[{ categoryName: 'Left', score: .97 }]] };
function mock(options: { gpuInitFail?: boolean; gpuRuntimeFail?: boolean; fullMissing?: boolean; handsMissing?: boolean; gpuCostMs?: number; startupMs?: number } = {}) {
  const creates: string[] = [], calls: string[] = [], closed: string[] = [];
  const factory = (kind: string) => ({ async createFromOptions(_files: unknown, settings: any) {
    const model = settings.baseOptions.modelAssetPath, delegate = settings.baseOptions.delegate;
    const name = `${kind}:${delegate}:${model.includes('_full') ? 'full' : model.includes('_lite') ? 'lite' : ''}`;
    creates.push(name);
    if (options.gpuInitFail && delegate === 'GPU') throw new Error('GPU unsupported');
    if (options.fullMissing && model.includes('_full')) throw new Error('model missing');
    if (options.handsMissing && kind === 'hand') throw new Error('hands missing');
    let didClose = false, detections = 0;
    return { close() { if (!didClose) closed.push(name); didClose = true; }, detectForVideo(_input: unknown, timestamp: number) {
      calls.push(`${kind}@${timestamp}`);
      clock += delegate === 'GPU' ? options.gpuCostMs ?? (kind === 'face' && detections++ === 0 ? options.startupMs ?? 0 : 0) : 0;
      if (options.gpuRuntimeFail && delegate === 'GPU') throw new Error('GPU context lost');
      if (kind === 'hand') return hand;
      if (kind === 'pose') return { landmarks: [[landmark()]], worldLandmarks: [[landmark(.01)]] };
      return { faceLandmarks: [[landmark()]], faceBlendshapes: [{ categories: [{ categoryName: 'mouthSmileLeft', score: .4 }] }], facialTransformationMatrixes: [{ data: Array.from({ length: 16 }, (_, i) => i % 5 === 0 ? 1 : 0) }] };
    } };
  } });
  return { creates, calls, closed, mp: { FilesetResolver: { forVisionTasks: async () => ({}) }, FaceLandmarker: factory('face'), PoseLandmarker: factory('pose'), HandLandmarker: factory('hand') } };
}
const checks: string[] = [];
const original = mock(); const legacy = await createVisionEngine(original.mp, '/vendor', 'original');
for (const timestamp of [1000, 1066, 1132, 1198]) await legacy.infer({ width: 640, height: 480 }, timestamp);
assert(original.creates.every(name => name.includes(':CPU:')));
assert.equal(original.creates.length, 2);
assert.equal(original.calls.filter(name => name.startsWith('face')).length, 4);
assert.equal(original.calls.filter(name => name.startsWith('pose')).length, 2);
assert.equal(legacy.describe().poseModel, 'lite'); legacy.close(); assert.equal(original.closed.length, 2);
checks.push('Original retains CPU, Lite, face every frame and pose every second frame');

const enhanced = mock(); const fast = await createVisionEngine(enhanced.mp, '/vendor', 'enhanced');
const first = await fast.infer({ width: 640, height: 480 }, 1000);
const second = await fast.infer({ width: 640, height: 480 }, 1042);
assert.equal(first.poseTimestamp, 1000); assert.equal(second.poseTimestamp, 1000);
assert.equal(second.faceTimestamp, 1042); assert.equal(second.handsTimestamp, 1042);
assert.equal(second.hands[0].timestamp, 1042); assert.equal(second.hands[0].handedness, 'Left');
assert.equal(second.hands[0].worldLandmarks.length, 21);
assert.deepEqual(enhanced.calls, ['face@1000', 'pose@1000', 'face@1042', 'hand@1042']);
fast.setHandsEnabled(false);
const disabled = await fast.infer({ width: 640, height: 480 }, 1200);
assert.equal(disabled.hands.length, 0);
fast.setHandsEnabled(true);
const again = await fast.infer({ width: 640, height: 480 }, 1242);
assert.equal(again.hands[0].timestamp, 1242); fast.close();
checks.push('Enhanced GPU/Full/hands; face priority, one auxiliary per bitmap, stable channel timestamps, live hand toggle');

for (const scenario of ['init', 'runtime'] as const) {
  const m = mock(scenario === 'init' ? { gpuInitFail: true } : { gpuRuntimeFail: true });
  const engine = await createVisionEngine(m.mp, '/vendor', 'enhanced');
  await engine.infer({ width: 640, height: 480 }, 1000);
  const output = await engine.infer({ width: 640, height: 480 }, 1042);
  assert(output.backend.includes('face CPU') && output.backend.includes('pose CPU') && output.backend.includes('hand CPU'));
  assert(output.face && output.poseWorld && output.hands.length === 1);
  engine.close();
  assert.equal(m.closed.length, scenario === 'init' ? 3 : 6, 'Every successfully created task must close');
}
checks.push('GPU initialization and runtime failure recover independently to CPU');
const unavailable = mock({ fullMissing: true, handsMissing: true });
const reduced = await createVisionEngine(unavailable.mp, '/vendor', 'enhanced');
assert.equal(reduced.describe().poseModel, 'lite'); assert.equal(reduced.describe().handsAvailable, false);
assert(reduced.describe().warning.includes('Hand model unavailable'));
assert((await reduced.infer({ width: 640, height: 480 }, 1000)).poseWorld); reduced.close();
checks.push('Missing Full falls back to Lite; missing optional hands keeps face/body active');

const slow = mock({ gpuCostMs: 300 });
const slowEngine = await createVisionEngine(slow.mp, '/vendor', 'enhanced');
for (const timestamp of [1000, 1700, 2400, 3100]) await slowEngine.infer({ width: 640, height: 480 }, timestamp);
assert(slowEngine.describe().backend.includes('face CPU') && slowEngine.describe().backend.includes('pose CPU') && slowEngine.describe().backend.includes('hand CPU'));
assert(slowEngine.describe().warning.includes('Slow')); slowEngine.close();
const warmup = mock({ startupMs: 12603 });
const warming = await createVisionEngine(warmup.mp, '/vendor', 'enhanced');
await warming.infer({ width: 640, height: 480 }, 1000);
const afterWarmup = await warming.infer({ width: 640, height: 480 }, 13650);
assert.equal(afterWarmup.handsTimestamp, 13650, 'Shader warmup must not postpone auxiliary inference for seconds');
assert(warming.describe().backend.includes('face GPU'), 'One slow shader compilation should not reject an otherwise fast hardware GPU');
warming.close();
let probeClosed = 0;
Object.assign(globalThis, { OffscreenCanvas: class {
  getContext() { return { RENDERER: 1, getParameter: () => 'ANGLE Vulkan SwiftShader Device', getExtension: (name: string) => name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : { loseContext() { probeClosed++; } } }; }
} });
const software = mock(); const softwareEngine = await createVisionEngine(software.mp, '/vendor', 'enhanced');
assert(software.creates.every(name => name.includes(':CPU:')));
assert(softwareEngine.describe().warning.includes('Software GPU')); assert.equal(probeClosed, 1); softwareEngine.close();
Object.assign(globalThis, { OffscreenCanvas: HardwareCanvas });
const forced = mock(); const forcedEngine = await createVisionEngine(forced.mp, '/vendor', 'enhanced', true, () => true, { forceCPU: true });
assert(forced.creates.every(name => name.includes(':CPU:'))); forcedEngine.close();
checks.push('Software GPU probe/context cleanup, two sustained slow GPU calls recover CPU, one-off shader warmup keeps scheduling bounded, force-CPU test option');

const stale = { timestamp: 1500, faceTimestamp: 1500, poseTimestamp: 1000, handsTimestamp: 1100,
  face: {}, faceMatrix: null, pose: [landmark()], poseWorld: [landmark()], hands: [{ ...second.hands[0], timestamp: 1100 }] };
assert(freshTrackingChannels(stale, 1400, true).handsTracked);
const channels = freshTrackingChannels(stale, 1600, true);
assert(channels.faceTracked && !channels.poseTracked && !channels.handsTracked);
assert.equal(freshTrackingChannels(stale, 1200, false).hands.length, 0);
assert(!freshTrackingChannels({ ...stale, faceTimestamp: NaN }, 1600, true).faceTracked);
checks.push('350ms hand and550ms pose expiry cannot be refreshed by newer face frames; disabled/future/nonfinite checks');

// Execute the exact emitted worker code with an injected import, comparing its
// output to the compatibility engine. This catches accidental closure captures.
const workerMock = mock(), posted: any[] = [];
const context = { self: { mp: workerMock.mp, postMessage: (data: unknown) => posted.push(data), onmessage: null as any }, performance: { now: () => 0 }, OffscreenCanvas: (globalThis as any).OffscreenCanvas };
vm.runInNewContext(visionWorkerSource.replace("const mp = await import(data.base + '/vision_bundle.mjs');", 'const mp = self.mp;'), context);
await context.self.onmessage({ data: { type: 'init', base: '/vendor', mode: 'enhanced', hands: true } });
assert.equal(posted[0].type, 'ready');
let bitmapCloses = 0;
for (const timestamp of [1000, 1042]) await context.self.onmessage({ data: { type: 'frame', timestamp, bitmap: { width: 640, height: 480, close() { bitmapCloses++; } } } });
assert.equal(bitmapCloses, 2);
const result = posted.at(-1).result;
assert.deepEqual(JSON.parse(JSON.stringify(result.hands)), JSON.parse(JSON.stringify(second.hands)));
assert.equal(result.poseTimestamp, second.poseTimestamp); assert.equal(result.faceTimestamp, second.faceTimestamp);
checks.push('Serialized production worker and compatibility engine output parity, transferred bitmap cleanup');

let release!: (value: any) => void, alive = true, lateClosed = 0;
const deferred = mock();
deferred.mp.PoseLandmarker.createFromOptions = () => new Promise(resolve => { release = resolve; });
const pending = createVisionEngine(deferred.mp, '/vendor', 'original', false, () => alive);
while (!release) await Promise.resolve();
alive = false;
release({ close() { lateClosed++; } });
await assert.rejects(pending, /cancelled/);
assert.equal(lateClosed, 1); assert.equal(deferred.closed.length, 1, 'Earlier face task must close when cancellation interrupts pose setup');
checks.push('Cancellation during model initialization releases both prior and late-arriving tasks');
const report = { status: 'passed', checks };
console.log(JSON.stringify(report, null, 2));
Object.defineProperty(globalThis, 'performance', { configurable: true, value: realPerformance });
