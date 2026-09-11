import assert from 'node:assert/strict';
import { CaptureTracker } from '../src/avatar/runtime/tracking';

const workers: FakeWorker[] = [];
class FakeWorker {
  onerror: any; onmessage: any; terminated = false; messages: any[] = [];
  constructor(_url: string) { workers.push(this); }
  terminate() { this.terminated = true; }
  postMessage(message: any) { this.messages.push(message); }
}
let resolveBitmap!: (bitmap: any) => void, bitmapRequests = 0, stoppedTracks = 0, bitmapCloses = 0;
Object.assign(globalThis, { Worker: FakeWorker, location: { href: 'https://localhost:5443/' }, window: { setTimeout },
  requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
  createImageBitmap: () => { bitmapRequests++; return new Promise(resolve => { resolveBitmap = resolve; }); } });
const video = { muted: false, playsInline: false, autoplay: false, srcObject: null, readyState: 2, currentTime: 1,
  pause() {}, play: async () => {} } as unknown as HTMLVideoElement;
const frames: any[] = [];
const tracker = new CaptureTracker({ video, onFrame: frame => frames.push(frame), onStatus() {} });
const internal = tracker as any;
assert.equal(internal.calibrateTongue, undefined, 'Automatic tongue capture exposes no pixel calibration step');
assert.equal(internal.setTongueMode, undefined, 'The retired detector cannot be selected');
assert.equal(tracker.metrics.mode, 'enhanced', 'A new capture client defaults to Enhanced');
assert.equal(tracker.metrics.poseModel, 'full');
internal.handsEnabled = false;
internal.epoch = 1;
const previous = internal.initializeVision(1);
internal.epoch = 2;
const current = internal.initializeVision(2);
assert.equal(workers.length, 2);
assert(workers.every(worker => worker.messages.find(m => m.type === 'init')?.mode === 'enhanced'), 'Worker startup inherits the Enhanced default');
assert(workers.every(worker => !('tongueMode' in worker.messages.find(m => m.type === 'init'))), 'Worker startup has no detector comparison option');
tracker.setHandsEnabled(true);
tracker.setTongueEnabled(true);
const previousRejection = assert.rejects(previous, /old initialization/);
workers[0].onerror({ message: 'old initialization failed' });
workers[1].onmessage({ data: { type: 'ready', backend: 'Local face CPU / pose CPU', poseModel: 'lite', handsAvailable: false } });
await previousRejection; await current;
assert(workers[0].terminated);
assert(!workers[1].terminated, 'A cancelled earlier init must never terminate the new worker');
assert.equal(internal.worker, workers[1]);
assert.deepEqual(workers[1].messages.filter(m => m.type === 'hands').at(-1), { type: 'hands', enabled: true }, 'Latest hand preference must be replayed after model loading');
assert.deepEqual(workers[1].messages.filter(m => m.type === 'tongue').at(-1), { type: 'tongue', enabled: true, revision: 1 }, 'Latest tongue preference and revision must be replayed after model loading');
internal.active = true;
const stream = { getTracks: () => [{ stop() { stoppedTracks++; } }] };
internal.stream = stream; video.srcObject = stream as any;
const result = (tongue?: any, tongueRevision = internal.tongueRevision) => {
  const timestamp = performance.now();
  return { timestamp, faceTimestamp: timestamp, face: { jawOpen: .2 },
    faceMatrix: null, faceLandmarks: null, pose: null, poseWorld: null, hands: [], tongue, tongueRevision, inferenceMs: 20,
    backend: 'CPU', poseModel: 'lite', handsAvailable: false };
};
const positive = () => ({ calibrationId: 0, state: 'detected', calibrated: true, amount: .72, confidence: .98, timestamp: performance.now() });
internal.acceptVision(result(positive()));
assert.equal(internal.vision.tongue.amount, .72, 'Ready neural evidence is usable without calibration');
const originalRevision = internal.tongueRevision;
tracker.setTongueEnabled(false);
assert.equal(internal.vision.tongue, undefined, 'Off clears the current observation immediately');
const lateDisabled = result(positive(), originalRevision);
internal.acceptVision(lateDisabled);
assert.equal(internal.vision.tongue, undefined, 'An in-flight result cannot restore disabled tongue tracking');
assert.equal(lateDisabled.tongue!.amount, .72, 'Sanitization must not mutate a shared engine snapshot');
tracker.setTongueEnabled(true);
internal.acceptVision(result(positive(), originalRevision));
assert.equal(internal.vision.tongue, undefined, 'Re-enabling cannot revive a pre-toggle result');
internal.acceptVision(result(positive()));
assert.equal(internal.vision.tongue.amount, .72, 'A fresh observation recovers after re-enabling');
internal.emitFrame(internal.vision.timestamp + 500);
assert.equal(frames.at(-1).tongue, undefined, 'New render frames cannot renew stale tongue evidence');

// General neutral-face/body calibration is independent of tongue detection.
const calibrationSource = { ...result(), faceMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
internal.acceptVision(calibrationSource);
assert(tracker.calibrate());
assert.notEqual(internal.calibration.faceMatrix, calibrationSource.faceMatrix);
assert.notEqual(internal.calibration.face, calibrationSource.face);
calibrationSource.faceMatrix[0] = 9; calibrationSource.face.jawOpen = .9;
assert.equal(internal.calibration.faceMatrix[0], 1); assert.equal(internal.calibration.face.jawOpen, .2);
const now = performance.now() + 1000;
internal.captureMetrics.inferenceMs = 12603;
internal.lastSent = now - 101;
internal.tick(now); internal.tick(now + 100);
assert.equal(bitmapRequests, 1, 'Long shader warmup must not turn the next camera interval into a multi-second wait');
assert.equal(bitmapRequests, 1, 'Only one bitmap may be pending across camera ticks');
tracker.stop();
resolveBitmap({ close() { bitmapCloses++; } });
await Promise.resolve(); await Promise.resolve();
assert.equal(bitmapCloses, 1, 'Late bitmap must close after stop');
assert.equal(stoppedTracks, 1); assert(workers[1].terminated);
assert.equal(video.srcObject, null); assert.equal(tracker.running, false);
assert.equal(workers[1].messages.filter(m => m.type === 'frame').length, 0);
assert.deepEqual(frames.at(-1).hands, []); assert.equal(frames.at(-1).handsTracked, false);
assert.equal(frames.at(-1).tongue, undefined); assert.equal(internal.calibration, undefined);

const fallbackCalls: { enabled: boolean; revision: number }[] = [];
let fallbackClosed = 0;
const fallbackVideo = { ...video, srcObject: stream } as unknown as HTMLVideoElement;
const fallbackFrames: any[] = [];
const compatible = new CaptureTracker({ video: fallbackVideo, onFrame(frame) { fallbackFrames.push(frame); }, onStatus() {} }), compat = compatible as any;
compat.active = true; compat.fallback = { setTongueEnabled(enabled: boolean, revision: number) { fallbackCalls.push({ enabled, revision }); }, close() { fallbackClosed++; } };
compatible.setTongueEnabled(true); compat.acceptVision(result(positive(), 1));
assert.deepEqual(fallbackCalls.at(-1), { enabled: true, revision: 1 });
assert.equal(compat.vision.tongue.amount, .72);
compatible.setTongueEnabled(false); assert.equal(compat.vision.tongue, undefined);
compatible.setTongueEnabled(true); compat.acceptVision(result(positive(), 1));
assert.equal(compat.vision.tongue, undefined, 'Compatibility mode rejects the same stale revision as the worker client');
compat.acceptVision(result(positive(), 3)); assert.equal(compat.vision.tongue.amount, .72);
assert.deepEqual(fallbackCalls, [{ enabled: true, revision: 1 }, { enabled: false, revision: 2 }, { enabled: true, revision: 3 }]);
compatible.stop(); assert.equal(fallbackClosed, 1); assert.equal(fallbackFrames.at(-1).tongue, undefined);
console.log('PASS: overlapping-init ownership, live hands/tongue startup preferences, automatic tongue observation delivery, off/on revision cancellation and freshness in worker/compatibility clients, retained neutral calibration, one pending bitmap, late bitmap cleanup, tracks/worker stop');
