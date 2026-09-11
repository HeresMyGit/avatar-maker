import type { TongueObservation } from "./tongue-types";
import { createNeuralTongueDetector } from './tongue-neural';
/** Camera pixels and audio stay in this browser. Models and WASM are served locally. */
export interface Landmark { x: number; y: number; z: number; visibility?: number; presence?: number }
/**
 * Lip measurements in a head-local plane. Distances use the outer-eye span as
 * one unit. Left/right always mean the actor's anatomical sides; up is positive.
 * These are raw geometry, not smile scores: opening the jaw can raise both
 * corners relative to the lip midpoint. Interpret corners together with opening.
 */
export interface MouthGeometry {
  width: number;
  opening: number;
  leftCorner: number;
  rightCorner: number;
  centerX: number;
  /** (leftCorner - rightCorner) / width; positive means actor-left corner higher. */
  tilt: number;
  quality: number;
}
export type TrackingMode = "original" | "enhanced";
type TongueDetectorFactory = (base: string, alive: () => boolean) => {
  setEnabled(value: boolean): void; close(): void;
  process(input: any, landmarks: any[] | undefined, timestamp: number): TongueObservation | Promise<TongueObservation>;
};
export interface TrackedHand {
  /** MediaPipe label on the unmirrored camera image; pose wrists can disambiguate sides. */
  handedness: "Left" | "Right";
  score: number;
  landmarks: Landmark[];
  worldLandmarks: Landmark[];
  timestamp: number;
}
export interface CaptureMetrics {
  mode: TrackingMode;
  backend: string;
  inferenceMs: number;
  updateHz: number;
  faceHz: number;
  poseHz: number;
  handsHz: number;
  handsAvailable: boolean;
  poseModel: "lite" | "full";
  warning: string;
}
export interface TrackingFrame {
  tongue?: TongueObservation;
  mode?: TrackingMode;
  /** Actual channel inference timestamps, stable between render frames. */
  faceTimestamp?: number;
  poseTimestamp?: number;
  hands?: TrackedHand[];
  handsTracked?: boolean;
  timestamp: number;
  face: Record<string, number> | null;
  faceMatrix: number[] | null;
  mouthGeometry?: MouthGeometry | null;
  pose: Landmark[] | null;
  poseWorld: Landmark[] | null;
  audioLevel: number;
  faceTracked: boolean;
  poseTracked: boolean;
  calibrated: boolean;
  calibration?: { id: number; faceMatrix: number[] | null; face: Record<string, number> | null; mouthGeometry?: MouthGeometry | null };
}
export interface TrackingStatus extends Partial<CaptureMetrics> {
  handsTracked?: boolean;
  state: "idle" | "loading" | "running" | "error";
  message: string;
  faceTracked: boolean;
  poseTracked: boolean;
  backend?: string;
}
interface VisionResult {
  /** Internal toggle revision, never a public avatar-frame field. */
  bodyRevision?: number;
  tongueRevision?: number;
  tongue?: TongueObservation;
  faceTimestamp?: number;
  poseTimestamp?: number;
  handsTimestamp?: number;
  hands?: TrackedHand[];
  inferenceMs?: number;
  backend?: string;
  poseModel?: "lite" | "full";
  handsAvailable?: boolean;
  warning?: string;
  timestamp: number;
  face: Record<string, number> | null;
  faceMatrix: number[] | null;
  faceLandmarks?: Landmark[] | null;
  imageWidth?: number;
  imageHeight?: number;
  mouthGeometry?: MouthGeometry | null;
  pose: Landmark[] | null;
  poseWorld: Landmark[] | null;
}

/** A self-contained engine shared by the worker and compatibility path. */
export async function createVisionEngine(mp: any, base: string, mode: TrackingMode, handsEnabled = true,
  alive: () => boolean = () => true, testOptions: { forceCPU?: boolean } = {}, tongueFactory?: TongueDetectorFactory) {
  const files = await mp.FilesetResolver.forVisionTasks(`${base}/wasm`);
  const tongue = tongueFactory?.(base, alive);
  const tasks: Record<string, any> = {};
  const delegates: Record<string, string> = {};
  let poseModel: 'full' | 'lite' = mode === 'enhanced' ? 'full' : 'lite';
  let warning = '', stopped = false, frameNumber = 0, inferenceMs = 0;
  let gpuAllowed = mode === 'enhanced' && !testOptions.forceCPU;
  const slowGpuCalls: Record<string, number> = {};
  // Headless/software WebGL may initialize successfully yet take seconds per
  // frame. Probe a disposable context once; each task owns its actual canvas.
  if (gpuAllowed) {
    let gl: any;
    try {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1)
        : typeof document !== 'undefined' ? document.createElement('canvas') : null;
      gl = canvas?.getContext('webgl2');
      if (!gl) throw new Error('No WebGL2 context');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      if (/swiftshader|llvmpipe|softpipe|software|swrast/i.test(renderer)) {
        gpuAllowed = false; warning = 'Software GPU detected; using CPU';
      }
    } catch { gpuAllowed = false; warning = 'GPU unavailable; using CPU'; }
    finally { try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} }
  }
  let poseTimestamp = 0, handsTimestamp = 0;
  let bodyEnabled = true, bodyRevision = 0, handRevision = 0, tongueEnabled = false, tongueRevision = 0;
  let previousPose: any = null, previousWorld: any = null, previousHands: any[] = [];
  const closeTask = (task: any) => { try { task?.close(); } catch {} };
  const close = () => { stopped = true; tongue?.close(); for (const task of Object.values(tasks)) closeTask(task); };
  const current = () => !stopped && alive();
  const settings = (kind: string) => kind === 'face' ? {
    runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: .55, minFacePresenceConfidence: .55,
  } : kind === 'pose' ? { runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
    minPoseDetectionConfidence: .55, minPosePresenceConfidence: .55,
  } : { runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .55, minTrackingConfidence: .55 };
  const construct = async (kind: string, delegate: 'GPU' | 'CPU') => {
    const model = kind === 'pose' ? `pose_landmarker_${poseModel}.task` : `${kind}_landmarker.task`;
    const factory = kind === 'face' ? mp.FaceLandmarker : kind === 'pose' ? mp.PoseLandmarker : mp.HandLandmarker;
    const options: any = { ...settings(kind), baseOptions: { modelAssetPath: `${base}/${model}`, delegate } };
    if (delegate === 'GPU') {
      if (typeof OffscreenCanvas !== 'undefined') options.canvas = new OffscreenCanvas(1, 1);
      else if (typeof document !== 'undefined') options.canvas = document.createElement('canvas');
      else throw new Error('GPU canvas is unavailable');
    }
    const task = await factory.createFromOptions(files, options);
    if (!current()) { closeTask(task); throw new Error('Capture cancelled'); }
    tasks[kind] = task; delegates[kind] = delegate;
    return task;
  };
  const load = async (kind: string, gpu = gpuAllowed) => {
    if (gpu) {
      try { return await construct(kind, 'GPU'); }
      catch (error) { if (!current()) throw error; }
    }
    try { return await construct(kind, 'CPU'); }
    catch (error) {
      if (!current()) throw error;
      if (kind === 'pose' && poseModel === 'full') {
        poseModel = 'lite'; warning = 'Pose Full unavailable; using Pose Lite';
        return construct(kind, 'CPU');
      }
      throw error;
    }
  };
  try {
    await load('face'); await load('pose');
    if (mode === 'enhanced') {
      try { await load('hand'); }
      catch (error) { if (!current()) throw error; warning += `${warning ? ' · ' : ''}Hand model unavailable`; }
    }
  } catch (error) { close(); throw error; }
  const describe = () => ({ poseModel, handsAvailable: !!tasks.hand, warning,
    backend: `Local ${Object.entries(delegates).map(([kind, delegate]) => `${kind} ${delegate}`).join(' / ')} · Pose ${poseModel}` });
  const detect = async (kind: string, input: any, timestamp: number): Promise<any> => {
    try {
      const started = performance.now();
      const result = tasks[kind].detectForVideo(input, timestamp);
      const duration = performance.now() - started;
      slowGpuCalls[kind] = delegates[kind] === 'GPU' && duration > 250 ? (slowGpuCalls[kind] ?? 0) + 1 : 0;
      if (slowGpuCalls[kind] >= 2 && current()) {
        closeTask(tasks[kind]); delete tasks[kind];
        await load(kind, false);
        warning = `Slow ${kind} GPU; using CPU`;
        return tasks[kind].detectForVideo(input, timestamp);
      }
      return result;
    }
    catch (error) {
      if (delegates[kind] === 'GPU' && current()) {
        closeTask(tasks[kind]); delete tasks[kind];
        await load(kind, false);
        return tasks[kind].detectForVideo(input, timestamp);
      }
      throw error;
    }
  };
  return {
    close, describe,
    setTongueEnabled(value: boolean, revision?: number) {
      if (tongueEnabled !== value || revision !== undefined && revision !== tongueRevision) {
        tongueRevision = revision ?? tongueRevision + 1;
      }
      tongueEnabled = value; tongue?.setEnabled(value);
    },
    setBodyEnabled(value: boolean, revision?: number) {
      if (bodyEnabled !== value || revision !== undefined && revision !== bodyRevision) {
        bodyRevision = revision ?? bodyRevision + 1;
        previousPose = previousWorld = null; poseTimestamp = 0;
      }
      bodyEnabled = value;
    },
    setHandsEnabled(value: boolean) {
      const enabled = value && mode === 'enhanced';
      if (handsEnabled !== enabled) handRevision++;
      handsEnabled = enabled; if (!handsEnabled) { previousHands = []; handsTimestamp = 0; }
    },
    async infer(input: any, timestamp: number, publishFace?: (result: VisionResult) => void,
      beforeAuxiliary?: () => void | Promise<void>) {
      if (!current()) throw new Error('Capture cancelled');
      const started = performance.now();
      // Face always goes first. Enhanced adds at most one auxiliary detector per
      // bitmap, alternating due pose/hand work rather than blocking face on both.
      const f = await detect('face', input, timestamp);
      if (!current()) throw new Error('Capture cancelled');
      const tongueSampleRevision = tongueRevision;
      const tongueObservation = await tongue?.process(input, f.faceLandmarks[0], timestamp);
      if (!current()) throw new Error('Capture cancelled');
      const facial = {
        timestamp, faceTimestamp: timestamp, tongueRevision: tongueSampleRevision,
        tongue: tongueSampleRevision === tongueRevision ? tongueObservation : undefined,
        face: f.faceLandmarks.length ? Object.fromEntries((f.faceBlendshapes[0]?.categories ?? []).map((c: any) => [c.categoryName, c.score])) : null,
        faceMatrix: f.facialTransformationMatrixes[0]?.data ?? null, faceLandmarks: f.faceLandmarks[0] ?? null,
        imageWidth: input.videoWidth || input.width, imageHeight: input.videoHeight || input.height,
      };
      const snapshot = () => ({ ...facial, poseTimestamp, handsTimestamp, bodyRevision,
        pose: bodyEnabled ? previousPose : null, poseWorld: bodyEnabled ? previousWorld : null,
        hands: handsEnabled ? previousHands : [], inferenceMs, ...describe() });
      publishFace?.(snapshot());
      if (!current()) throw new Error('Capture cancelled');
      const poseInterval = Math.min(150, Math.max(80, inferenceMs * 1.3));
      const handInterval = Math.min(150, Math.max(80, inferenceMs * 1.3));
      const duePose = () => bodyEnabled && (mode === 'original' ? frameNumber % 2 === 0 || !poseTimestamp : timestamp - poseTimestamp >= poseInterval);
      const dueHand = () => mode === 'enhanced' && handsEnabled && !!tasks.hand && timestamp - handsTimestamp >= handInterval;
      let publicationPause = 0;
      if (beforeAuxiliary && (duePose() || dueHand())) {
        const paused = performance.now();
        // Compatibility yields through paint only if auxiliary work is due.
        // Recheck toggles afterward: the user can disable Body during the yield.
        await beforeAuxiliary(); publicationPause = performance.now() - paused;
        if (!current()) throw new Error('Capture cancelled');
      }
      const poseDue = duePose(), handDue = dueHand();
      const useHand = handDue && (!poseDue || handsTimestamp < poseTimestamp);
      if (useHand) {
        const revision = handRevision;
        try {
          const h = await detect('hand', input, timestamp);
          if (!current()) throw new Error('Capture cancelled');
          if (handsEnabled && revision === handRevision) {
            handsTimestamp = timestamp;
            previousHands = (h.landmarks ?? []).flatMap((landmarks: any[], index: number) => {
            const category = (h.handedness ?? h.handednesses)?.[index]?.[0];
            if (!category || !['Left', 'Right'].includes(category.categoryName) || landmarks.length !== 21) return [];
            return [{ handedness: category.categoryName, score: category.score, landmarks,
              worldLandmarks: h.worldLandmarks?.[index] ?? [], timestamp }];
            });
          }
        } catch (error) {
          if (!current()) throw error;
          // Hands are optional. Preserve working face/body tracking if their
          // model cannot run on this browser, even after the CPU retry.
          closeTask(tasks.hand); delete tasks.hand; delete delegates.hand;
          previousHands = []; warning = 'Hand tracking unavailable; face and body remain active';
        }
      } else if (poseDue) {
        const revision = bodyRevision;
        const p = await detect('pose', input, timestamp);
        if (!current()) throw new Error('Capture cancelled');
        if (bodyEnabled && revision === bodyRevision) {
          poseTimestamp = timestamp; previousPose = p.landmarks[0] ?? null; previousWorld = p.worldLandmarks[0] ?? null;
        }
      }
      frameNumber++;
      const cost = Math.max(0, performance.now() - started - publicationPause);
      inferenceMs = inferenceMs ? inferenceMs * .8 + cost * .2 : cost;
      return snapshot();
    },
  };
}

// A classic worker permits MediaPipe 0.10.x's WASM loader to use importScripts.
// The exact same engine runs on the main thread only as a compatibility fallback.
export const visionWorkerSource = `const createVisionEngine = ${createVisionEngine.toString()};\nconst makeNeuralTongue = ${createNeuralTongueDetector.toString()};\n` + String.raw`
let engine;
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      const mp = await import(data.base + '/vision_bundle.mjs');
      engine = await createVisionEngine(mp, data.base, data.mode, data.hands, () => true, {},
        (base, alive) => makeNeuralTongue(base, alive, url => import(url)));
      engine.setBodyEnabled(data.body !== false, data.bodyRevision ?? 0);
      self.postMessage({type: 'ready', ...engine.describe()});
    } catch (error) { self.postMessage({type: 'error', error: String(error)}); }
    return;
  }
  if (data.type === 'tongue') { engine?.setTongueEnabled(data.enabled, data.revision); return; }
  if (data.type === 'hands') { engine?.setHandsEnabled(data.enabled); return; }
  if (data.type === 'body') { engine?.setBodyEnabled(data.enabled, data.revision); return; }
  if (data.type !== 'frame') return;
  try { self.postMessage({type: 'result', result: await engine.infer(data.bitmap, data.timestamp,
    result => self.postMessage({type: 'face-result', result}))}); }
  catch (error) { self.postMessage({type: 'frame-error', timestamp: data.timestamp, error: String(error)}); }
  finally { data.bitmap.close(); }
};
`;

/**
 * MediaPipe x/z use image-width units; y uses image-height units. Reconcile
 * aspect before projecting onto a rigid eye/forehead frame. Applying the metric
 * face transform directly to normalized screen coordinates would mix scales.
 * References: outer eyes33/263, bridge168, forehead10, lip corners61/291, lips13/14.
 */
export function measureMouthGeometry(
  landmarks: readonly Landmark[] | null | undefined,
  imageWidth: number,
  imageHeight: number,
): MouthGeometry | null {
  if (!landmarks || !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) return null;
  const ids = [33, 263, 168, 10, 61, 291, 13, 14];
  if (ids.some(id => !landmarks[id] || ![landmarks[id].x, landmarks[id].y, landmarks[id].z].every(Number.isFinite))) return null;
  const aspect = imageHeight / imageWidth;
  type V = [number, number, number];
  const point = (id: number): V => { const p = landmarks[id]; return [p.x, -p.y * aspect, -p.z]; };
  const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const length = (v: V) => Math.sqrt(dot(v, v));
  const times = (v: V, scale: number): V => [v[0] * scale, v[1] * scale, v[2] * scale];
  const midpoint = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const rightEye = point(33), leftEye = point(263);
  const eyeVector = sub(leftEye, rightEye), eyeSpan = length(eyeVector);
  if (eyeSpan < .02) return null;
  const x = times(eyeVector, 1 / eyeSpan);
  const roughUp = sub(point(10), point(168));
  const upVector = sub(roughUp, times(x, dot(roughUp, x)));
  const upLength = length(upVector);
  if (upLength < eyeSpan * .12) return null;
  const up = times(upVector, 1 / upLength);
  // x × up points toward the camera for a front-facing head. Geometry becomes
  // unreliable near profile, so let the mapper fall back to bilateral scores.
  const facing = x[0] * up[1] - x[1] * up[0];
  const sizeQuality = clamp01((eyeSpan - .025) / .055);
  const quality = clamp01((facing - .35) / .45) * sizeQuality;
  if (quality < .1 || ids.some(id => landmarks[id].x < -.05 || landmarks[id].x > 1.05 || landmarks[id].y < -.05 || landmarks[id].y > 1.05)) return null;
  const left = point(291), right = point(61), upper = point(13), lower = point(14);
  const center = midpoint(upper, lower);
  const width = dot(sub(left, right), x) / eyeSpan;
  const opening = Math.max(0, dot(sub(upper, lower), up) / eyeSpan);
  const leftCorner = dot(sub(left, center), up) / eyeSpan;
  const rightCorner = dot(sub(right, center), up) / eyeSpan;
  const centerX = dot(sub(center, midpoint(leftEye, rightEye)), x) / eyeSpan;
  if (width < .08 || width > 1.6 || opening > 1 || Math.abs(leftCorner) > .8 || Math.abs(rightCorner) > .8) return null;
  return { width, opening, leftCorner, rightCorner, centerX, tilt: (leftCorner - rightCorner) / width, quality };
}

export function microphoneLevel(samples: Float32Array, noiseGate = .012, gain = 8): number {
  if (!samples.length) return 0;
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  let power = 0;
  for (const sample of samples) power += (sample - mean) ** 2;
  return Math.min(1, Math.max(0, (Math.sqrt(power / samples.length) - noiseGate) * gain));
}

/** A cached pose/hand result must expire independently of fresh face frames. */
export function freshTrackingChannels(result: VisionResult | null, now: number, handsEnabled: boolean) {
  const faceTimestamp = result?.faceTimestamp ?? result?.timestamp ?? 0;
  const poseTimestamp = result?.poseTimestamp ?? result?.timestamp ?? 0;
  const recent = (stamp: number, ttl: number) => Number.isFinite(stamp) && now >= stamp && now - stamp < ttl;
  const faceTracked = !!result?.face && recent(faceTimestamp, 700);
  const poseTracked = !!result?.poseWorld && recent(poseTimestamp, 550);
  const hands = handsEnabled ? (result?.hands ?? []).filter(hand => recent(hand.timestamp, 350) && hand.score >= .5) : [];
  return { faceTimestamp, poseTimestamp, faceTracked, poseTracked, hands, handsTracked: hands.length > 0 };
}

/** An rAF followed by a task lets the published face reach rendering first. */
export function capturePaintOpportunity(): Promise<void> {
  return new Promise(resolve => {
    let finished = false, frame = 0;
    const done = () => {
      if (finished) return;
      finished = true; clearTimeout(timeout);
      if (frame) cancelAnimationFrame(frame);
      resolve();
    };
    // Hidden/throttled tabs must not strand an in-flight compatibility call.
    const timeout = setTimeout(done, 100);
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(() => { setTimeout(done, 0); });
    else setTimeout(done, 0);
  });
}

export class CaptureTracker {
  readonly video: HTMLVideoElement;
  private vendorBase: string;
  private options: { onFrame(frame: TrackingFrame): void; onStatus(status: TrackingStatus): void };
  private stream?: MediaStream;
  private audio?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(1024);
  private worker?: Worker;
  private workerURL?: string;
  private rejectInit?: (error: Error) => void;
  private fallback?: Awaited<ReturnType<typeof createVisionEngine>>;
  private mode: TrackingMode = "enhanced";
  private handsEnabled = false;
  private bodyEnabled = true;
  private bodyRevision = 0;
  private tongueEnabled = false;
  private tongueRevision = 0;
  private captureMetrics: CaptureMetrics = { mode: "enhanced", backend: "", inferenceMs: 0, updateHz: 0,
    faceHz: 0, poseHz: 0, handsHz: 0, handsAvailable: false, poseModel: "full", warning: "" };
  private rateStart = 0;
  private rates = { frames: 0, face: 0, pose: 0, hands: 0 };
  private statusTime = 0;
  private backend = "";
  private raf = 0;
  private epoch = 0;
  private active = false;
  private busy = false;
  private lastSent = 0;
  private lastVideoTime = -1;
  private errors = 0;
  private vision: VisionResult | null = null;
  private lastCompletedTimestamp = -Infinity;
  private calibration?: TrackingFrame["calibration"];
  private calibrationId = 0;
  private gain = 8;
  private gate = .012;
  private lastStatus = "";

  constructor(options: { video?: HTMLVideoElement; vendorBase?: string; onFrame(frame: TrackingFrame): void; onStatus(status: TrackingStatus): void }) {
    this.options = options;
    // Resolve against the application base, including a subdirectory deployment.
    // No model requests or device access occur until start() is called.
    const appBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    this.vendorBase = options.vendorBase ?? `${appBase.replace(/\/$/, '')}/avatar/vendor`;
    this.video = options.video ?? document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
  }
  get running() { return this.active; }
  get metrics(): Readonly<CaptureMetrics> { return this.captureMetrics; }

  private status(state: TrackingStatus["state"], message: string, faceTracked = false, poseTracked = false, handsTracked = false) {
    const signature = `${state}:${message}:${faceTracked}:${poseTracked}:${handsTracked}:${this.backend}`;
    const now = performance.now();
    if (signature === this.lastStatus && now - this.statusTime < 1000) return;
    this.lastStatus = signature; this.statusTime = now;
    this.options.onStatus({ state, message, faceTracked, poseTracked, handsTracked, ...this.captureMetrics, backend: this.backend });
  }

  async start({ camera, microphone, mode = "enhanced", hands = true }: { camera: boolean; microphone: boolean; mode?: TrackingMode; hands?: boolean }) {
    this.stop();
    this.mode = mode; this.handsEnabled = hands && mode === "enhanced";
    this.captureMetrics.mode = mode; this.captureMetrics.poseModel = mode === "enhanced" ? "full" : "lite";
    if (!camera && !microphone) throw new Error("Choose camera or microphone before starting.");
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const message = "Webcam control needs HTTPS or localhost. Open this app at a secure address and try again.";
      this.status("error", message);
      throw new Error(message);
    }
    const epoch = ++this.epoch;
    this.status("loading", "Requesting camera / microphone permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camera ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 }, facingMode: "user" } : false,
        audio: microphone ? { echoCancellation: true, noiseSuppression: true, autoGainControl: false } : false,
      });
      if (epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      for (const track of stream.getTracks()) track.addEventListener("ended", () => {
        if (epoch !== this.epoch) return;
        this.stop();
        this.status("error", "Capture ended. Check the camera or microphone, then press Start again.");
      });
      if (microphone) {
        this.audio = new AudioContext();
        this.source = this.audio.createMediaStreamSource(stream);
        this.analyser = this.audio.createAnalyser();
        this.analyser.fftSize = 1024;
        this.source.connect(this.analyser); // No output connection: no microphone feedback.
        await this.audio.resume();
      }
      if (epoch !== this.epoch) return;
      if (camera) {
        this.video.srcObject = stream;
        await this.video.play();
        if (epoch !== this.epoch) return;
        this.status("loading", "Loading local face and body tracking…");
        await this.initializeVision(epoch);
      }
      if (epoch !== this.epoch) return;
      this.active = true;
      this.lastSent = 0;
      this.lastVideoTime = -1;
      this.rateStart = performance.now(); this.rates = { frames: 0, face: 0, pose: 0, hands: 0 };
      this.tick(performance.now());
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.stop();
      const name = error instanceof Error ? error.name : "";
      const message = name === "NotAllowedError" ? "Permission was denied. Allow the selected camera / microphone in this browser, then press Start again."
        : name === "NotFoundError" ? "No matching camera or microphone was found. Connect one or turn that input off."
        : name === "NotReadableError" ? "The camera or microphone is busy. Close other apps using it, then try again."
        : `Could not start tracking: ${error instanceof Error ? error.message : String(error)}`;
      this.status("error", message);
      throw new Error(message);
    }
  }

  private async initializeVision(epoch: number) {
    const base = new URL(this.vendorBase.replace(/\/$/, ''), location.href).href;
    let ownedWorker: Worker | undefined, ownedURL: string | undefined;
    try {
      if (!globalThis.Worker || !globalThis.createImageBitmap) throw new Error("Worker unavailable");
      ownedURL = this.workerURL = URL.createObjectURL(new Blob([visionWorkerSource], { type: "text/javascript" }));
      const worker = ownedWorker = this.worker = new Worker(ownedURL);
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Local models took too long to load")), 60000);
        const fail = (error: Error) => { clearTimeout(timer); this.rejectInit = undefined; reject(error); };
        this.rejectInit = fail;
        worker.onerror = event => fail(new Error(event.message || "Tracking worker failed"));
        worker.onmessage = ({ data }) => {
          if (epoch !== this.epoch) return;
          if (data.type === "ready") {
            clearTimeout(timer); this.rejectInit = undefined;
            this.updateEngineMetrics(data, "worker");
            // A user can toggle Hands while models load; replay the current
            // preference after the worker has an engine to receive it.
            worker.postMessage({ type: "hands", enabled: this.handsEnabled });
            worker.postMessage({ type: "body", enabled: this.bodyEnabled, revision: this.bodyRevision });
            worker.postMessage({ type: "tongue", enabled: this.tongueEnabled, revision: this.tongueRevision });
            worker.onerror = event => this.captureError(event.message || "Tracking worker failed");
            resolve();
          } else if (data.type === "error") fail(new Error(data.error));
          else if (data.type === "face-result") {
            if (data.result?.timestamp !== this.lastSent) return;
            if (this.acceptVision(data.result, "face")) this.emitFrame(performance.now());
          } else if (data.type === "result") {
            if (data.result?.timestamp !== this.lastSent) return;
            this.busy = false; this.errors = 0; this.acceptVision(data.result);
          } else if (data.type === "frame-error") {
            if (data.timestamp !== undefined && data.timestamp !== this.lastSent) return;
            this.busy = false; this.captureError(data.error);
          }
        };
        worker.postMessage({ type: "init", base, mode: this.mode, hands: this.handsEnabled, body: this.bodyEnabled, bodyRevision: this.bodyRevision });
      });
    } catch (error) {
      ownedWorker?.terminate();
      if (this.worker === ownedWorker) this.worker = undefined;
      if (ownedURL) URL.revokeObjectURL(ownedURL);
      if (this.workerURL === ownedURL) this.workerURL = undefined;
      if (epoch !== this.epoch) throw error;
      this.status("loading", "Using browser compatibility mode for local tracking…");
      // Keep the compatibility loader at a stable URL. A tab may remain open
      // while the local app is rebuilt; hashed lazy chunks can disappear then.
      const mp = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`);
      const engine = await createVisionEngine(mp, base, this.mode, this.handsEnabled, () => epoch === this.epoch, {},
        (vendor, alive) => createNeuralTongueDetector(vendor, alive, (url: string) => import(/* @vite-ignore */ url)));
      if (epoch !== this.epoch) { engine.close(); return; }
      this.fallback = engine;
      engine.setHandsEnabled(this.handsEnabled);
      engine.setBodyEnabled(this.bodyEnabled, this.bodyRevision);
      engine.setTongueEnabled(this.tongueEnabled, this.tongueRevision);
      this.updateEngineMetrics(engine.describe(), "compatibility mode");
    }
  }

  private updateEngineMetrics(result: Partial<CaptureMetrics>, environment = this.worker ? "worker" : "compatibility mode") {
    for (const name of ["inferenceMs", "handsAvailable", "poseModel", "warning"] as const) {
      if (result[name] !== undefined) (this.captureMetrics as any)[name] = result[name];
    }
    if (result.backend) this.backend = this.captureMetrics.backend = `${result.backend} · ${environment}`;
  }
  private acceptVision(result: VisionResult, stage: "face" | "complete" = "complete") {
    if (!Number.isFinite(result.timestamp) || this.vision && result.timestamp < this.vision.timestamp
      || stage === "face" && result.timestamp <= this.lastCompletedTimestamp
      || stage === "complete" && result.timestamp === this.lastCompletedTimestamp) return false;
    // Own the envelope so disabled-channel sanitization
    // cannot mutate the engine's early snapshot or the eventual complete result.
    result = { ...result };
    if (!this.bodyEnabled || result.bodyRevision !== undefined && result.bodyRevision !== this.bodyRevision) {
      result.pose = result.poseWorld = null; result.poseTimestamp = 0;
    }
    if (!this.handsEnabled) result.hands = [];
    if (!this.tongueEnabled || result.tongueRevision !== undefined && result.tongueRevision !== this.tongueRevision) result.tongue = undefined;
    // One measurement path guarantees worker/main-thread parity and keeps
    // landmark processing out of the stringified worker implementation.
    result.mouthGeometry = measureMouthGeometry(result.faceLandmarks, result.imageWidth ?? 0, result.imageHeight ?? 0);
    const previous = this.vision;
    this.updateEngineMetrics(result);
    if (stage === "complete") { this.rates.frames++; this.lastCompletedTimestamp = result.timestamp; }
    if ((result.faceTimestamp ?? result.timestamp) !== (previous?.faceTimestamp ?? previous?.timestamp)) this.rates.face++;
    if (result.poseTimestamp && result.poseTimestamp !== previous?.poseTimestamp) this.rates.pose++;
    if (result.handsTimestamp && result.handsTimestamp !== previous?.handsTimestamp) this.rates.hands++;
    const now = performance.now(), elapsed = (now - this.rateStart) / 1000;
    if (elapsed >= 1) {
      this.captureMetrics.updateHz = this.rates.frames / elapsed; this.captureMetrics.faceHz = this.rates.face / elapsed;
      this.captureMetrics.poseHz = this.rates.pose / elapsed; this.captureMetrics.handsHz = this.rates.hands / elapsed;
      this.rateStart = now; this.rates = { frames: 0, face: 0, pose: 0, hands: 0 };
    }
    this.vision = result;
    if (!this.calibration && result.faceMatrix) this.calibrate();
    return true;
  }
  private captureError(message: string) {
    if (++this.errors < 3) return;
    this.stop();
    this.status("error", `Tracking stopped: ${message}. Press Start to reload the local models.`);
  }
  private tick = (now: number) => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.busy && now - this.lastSent > 15000) {
      this.errors = 2;
      this.captureError("Local camera inference timed out");
      return;
    }
    const interval = this.mode === "original" ? (this.worker ? 66 : 120)
      : Math.min(this.worker ? 100 : 160, Math.max(this.worker ? 1000 / 24 : 1000 / 12, this.captureMetrics.inferenceMs * 1.1));
    if (this.video.srcObject && this.video.readyState >= 2 && !this.busy
      && now - this.lastSent >= interval && this.video.currentTime !== this.lastVideoTime) {
      this.lastSent = now;
      this.lastVideoTime = this.video.currentTime;
      if (this.worker) {
        this.busy = true;
        const epoch = this.epoch;
        createImageBitmap(this.video).then(bitmap => {
          if (epoch !== this.epoch || !this.worker) { bitmap.close(); return; }
          this.worker.postMessage({ type: "frame", bitmap, timestamp: now }, [bitmap]);
        }).catch(error => { if (epoch === this.epoch) { this.busy = false; this.captureError(String(error)); } });
      } else if (this.fallback) {
        this.busy = true;
        const epoch = this.epoch;
        this.fallback.infer(this.video, now, result => {
          if (epoch !== this.epoch || !this.active) return;
          if (this.acceptVision(result, "face")) this.emitFrame(performance.now());
        }, capturePaintOpportunity).then(result => {
          if (epoch !== this.epoch) return;
          this.acceptVision(result); this.errors = 0;
        }).catch(error => { if (epoch === this.epoch) this.captureError(String(error)); })
          .finally(() => { if (epoch === this.epoch) this.busy = false; });
      }
    }
    this.emitFrame(now);
  };

  private emitFrame(now: number) {
    if (!this.active) return;
    const channels = freshTrackingChannels(this.vision, now, this.handsEnabled);
    const { faceTracked, poseTracked, handsTracked, hands } = channels;
    let audioLevel = 0;
    if (this.analyser) { this.analyser.getFloatTimeDomainData(this.samples); audioLevel = microphoneLevel(this.samples, this.gate, this.gain); }
    this.options.onFrame({ timestamp: now, mode: this.mode, faceTimestamp: channels.faceTimestamp, poseTimestamp: channels.poseTimestamp,
      hands, handsTracked, tongue: this.tongueEnabled && this.vision?.tongue && now - this.vision.tongue.timestamp < 450 ? this.vision.tongue : undefined,
      face: faceTracked ? this.vision!.face : null,
      faceMatrix: faceTracked ? this.vision!.faceMatrix : null, pose: poseTracked ? this.vision!.pose : null,
      mouthGeometry: faceTracked ? this.vision!.mouthGeometry ?? null : null,
      poseWorld: poseTracked ? this.vision!.poseWorld : null, audioLevel, faceTracked, poseTracked,
      calibrated: !!this.calibration, calibration: this.calibration,
    });
    this.status("running", !this.video.srcObject ? "Microphone active · speak to move the mouth"
      : !this.vision ? "Warming up local tracking…"
      : faceTracked ? "Tracking live · face, head, and visible body joints"
      : "Camera active · move your face into view", faceTracked, poseTracked, handsTracked);
  }

  /** Look forward with relaxed eyes and a closed mouth, then call this. */
  calibrate() {
    if (!this.vision?.faceMatrix) return false;
    this.calibration = { id: ++this.calibrationId, faceMatrix: [...this.vision.faceMatrix], face: { ...this.vision.face },
      mouthGeometry: this.vision.mouthGeometry ? { ...this.vision.mouthGeometry } : null };
    return true;
  }
  /** Automatic inference; no pixel selection or tongue calibration step. */
  setTongueEnabled(enabled: boolean) {
    if (this.tongueEnabled !== enabled) {
      this.tongueRevision++;
      if (this.vision) this.vision = { ...this.vision, tongue: undefined };
    }
    this.tongueEnabled = enabled;
    this.worker?.postMessage({ type: "tongue", enabled, revision: this.tongueRevision });
    this.fallback?.setTongueEnabled(enabled, this.tongueRevision);
  }
  setHandsEnabled(enabled: boolean) {
    this.handsEnabled = enabled && this.mode === "enhanced";
    this.worker?.postMessage({ type: "hands", enabled: this.handsEnabled });
    this.fallback?.setHandsEnabled(this.handsEnabled);
    if (!this.handsEnabled && this.vision) this.vision.hands = [];
  }
  /** Stop pose inference as well as avatar motion; the next enabled sample is fresh. */
  setBodyEnabled(enabled: boolean) {
    if (this.bodyEnabled !== enabled) this.bodyRevision++;
    this.bodyEnabled = enabled;
    this.worker?.postMessage({ type: "body", enabled, revision: this.bodyRevision });
    this.fallback?.setBodyEnabled(enabled, this.bodyRevision);
    if (this.vision) this.vision = { ...this.vision, pose: null, poseWorld: null, poseTimestamp: 0 };
  }
  setAudioOptions(options: { gain?: number; noiseGate?: number }) {
    if (Number.isFinite(options.gain)) this.gain = Math.min(40, Math.max(0, options.gain!));
    if (Number.isFinite(options.noiseGate)) this.gate = Math.min(.25, Math.max(0, options.noiseGate!));
  }
  stop() {
    ++this.epoch;
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
    this.video.pause(); this.video.srcObject = null;
    this.source?.disconnect(); this.source = undefined;
    this.analyser?.disconnect(); this.analyser = undefined;
    void this.audio?.close().catch(() => {}); this.audio = undefined;
    this.rejectInit?.(new Error("Capture cancelled")); this.rejectInit = undefined;
    this.worker?.terminate(); this.worker = undefined;
    if (this.workerURL) URL.revokeObjectURL(this.workerURL); this.workerURL = undefined;
    this.fallback?.close(); this.fallback = undefined;
    this.vision = null; this.calibration = undefined; this.busy = false; this.errors = 0; this.backend = "";
    this.lastCompletedTimestamp = -Infinity;
    this.captureMetrics = { mode: this.mode, backend: "", inferenceMs: 0, updateHz: 0, faceHz: 0, poseHz: 0, handsHz: 0,
      handsAvailable: false, poseModel: this.mode === "enhanced" ? "full" : "lite", warning: "" };
    this.options.onFrame({ timestamp: performance.now(), mode: this.mode, faceTimestamp: 0, poseTimestamp: 0, hands: [], handsTracked: false, face: null, faceMatrix: null, mouthGeometry: null, pose: null, poseWorld: null,
      audioLevel: 0, faceTracked: false, poseTracked: false, calibrated: false });
    this.status("idle", "Camera and microphone are off");
  }
}
