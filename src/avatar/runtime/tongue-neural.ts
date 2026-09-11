import type { TongueObservation } from './tongue-types';

/** Browser-only inference using the pinned MIT-era ExVR tongue-tip network.
 * Self-contained for the same code to run in the capture worker or fallback.
 * The network predicts presence and a 2D tip, not anatomical extension/depth.
 */
export function createNeuralTongueDetector(base = '/vendor', alive: () => boolean = () => true, runtime?: any) {
  let enabled = false, closed = false, revision = 0, session: any, ort: any;
  let loading: Promise<void> | undefined, loadError = '', previousTime = -1, confirmations = 0, showing = false;
  let canvas: any, context: any;
  let lastPositive: TongueObservation | undefined;
  const clamp = (v: number, lo = 0, hi = 1) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
  const clear = () => { confirmations = 0; showing = false; lastPositive = undefined; };
  const observe = (timestamp: number, state: TongueObservation['state'], reason: string, confidence = 0, x = 0, y = 0): TongueObservation => ({
    timestamp, state, reason, confidence: clamp(confidence), calibrated: !!session, calibrationId: 0,
    // Keep a stable display length: presence confidence is not tongue depth.
    amount: state === 'detected' ? .72 : 0, x: state === 'detected' ? clamp(x, -1, 1) : 0,
    y: state === 'detected' ? clamp(y, -1, 1) : 0,
  });
  const uncertain = (timestamp: number, state: 'unknown' | 'not-detected', reason: string, confidence: number) => {
    // A short weak observation may bridge a blink in evidence. Never refresh
    // its timestamp or present a cached tip as a new neural measurement.
    if (showing && lastPositive && timestamp > lastPositive.timestamp && timestamp - lastPositive.timestamp <= 180) {
      return { ...lastPositive, tip: undefined, held: true, confidence: clamp(confidence), reason: 'Briefly holding the last clear tongue position.' };
    }
    clear(); return observe(timestamp, state, reason, confidence);
  };
  async function load() {
    if (session || loadError || closed) return;
    if (!loading) loading = (async () => {
      try {
        // Import at the caller boundary: bundler preload helpers cannot be
        // captured by this function when serialized into the classic worker.
        ort = typeof runtime === 'function' ? await runtime(`${base}/onnxruntime/ort.wasm.min.mjs`) : runtime;
        if (!ort) throw new Error('Tongue runtime loader unavailable');
        if (closed || !alive()) return;
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = `${base}/onnxruntime/`;
        const created = await ort.InferenceSession.create(`${base}/tongue/tongue-keypoint.onnx`, { executionProviders: ['wasm'] });
        if (closed || !alive()) { await created.release(); return; }
        session = created;
      } catch (error) {
        console.warn('Tongue model initialization failed:', error);
        loadError = 'Tongue model could not load. Restart webcam control to retry; face and body tracking continue.';
      }
    })();
    await loading;
  }
  return {
    setEnabled(value: boolean) { if (enabled !== value) { enabled = value; revision++; clear(); previousTime = -1; } },
    close() {
      closed = true; enabled = false; revision++; clear();
      const active = session; session = undefined;
      if (active) void active.release().catch(() => {});
      if (context) { context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, 32, 32); }
      canvas = context = undefined;
    },
    async process(input: any, landmarks: any[] | undefined, timestamp: number): Promise<TongueObservation> {
      const generation = revision;
      if (!enabled || closed || !alive()) return observe(timestamp, 'unknown', 'Webcam tongue tracking is off.');
      if (!Number.isFinite(timestamp) || timestamp <= previousTime) { clear(); return observe(timestamp, 'unknown', 'Waiting for a fresh camera frame.'); }
      if (timestamp - previousTime >= 500) clear();
      previousTime = timestamp;
      const width = input?.videoWidth || input?.width, height = input?.videoHeight || input?.height;
      const ids = [57, 287, 164, 18, 61, 291, 13, 14, 33, 263];
      if (!width || !height || !landmarks || ids.some(i => !landmarks[i] || !Number.isFinite(landmarks[i].x) || !Number.isFinite(landmarks[i].y))) {
        clear(); return observe(timestamp, 'unknown', 'Keep your face in view for tongue tracking.');
      }
      const point = (i: number) => ({ x: landmarks[i].x * width, y: landmarks[i].y * height });
      const lipL = point(61), lipR = point(291), upper = point(13), lower = point(14);
      const mouthWidth = Math.hypot(lipR.x - lipL.x, lipR.y - lipL.y);
      if (mouthWidth < 16) { clear(); return observe(timestamp, 'unknown', 'Move a little closer so your mouth is clear.'); }
      const aperture = ((lower.x - upper.x) * -(lipR.y - lipL.y) + (lower.y - upper.y) * (lipR.x - lipL.x)) / (mouthWidth * mouthWidth);
      if (aperture < .025) { clear(); return observe(timestamp, 'not-detected', 'Ready · stick your tongue out.'); }
      const eyeL = landmarks[33], eyeR = landmarks[263], eyeLPixels = point(33), eyeRPixels = point(263);
      const eyeDX = eyeRPixels.x - eyeLPixels.x, eyeDY = eyeRPixels.y - eyeLPixels.y, eyeSpan = Math.hypot(eyeDX, eyeDY);
      if (eyeSpan < 16) { clear(); return observe(timestamp, 'unknown', 'Keep your face clearly in view.'); }
      const yaw = Math.abs((eyeR.z ?? 0) - (eyeL.z ?? 0)) / Math.max(.001, Math.hypot(eyeR.x - eyeL.x, (eyeR.y - eyeL.y) * height / width));
      if (yaw > .7) { clear(); return observe(timestamp, 'unknown', 'Face the camera for tongue tracking.'); }
      // Do not retain a camera bitmap or stall face/body tracking during download.
      // Infer only on a subsequent fresh frame once the model is ready.
      if (!session) { void load(); clear(); return observe(timestamp, 'unknown', loadError || 'Loading tongue tracking…'); }
      const points = [57, 287, 164, 18].map(point);
      const angle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x), c = Math.cos(angle), s = Math.sin(angle);
      // Match the network's training crop, then compensate for camera roll.
      const x0 = Math.floor(Math.min(...points.map(p => p.x))), x1 = Math.floor(Math.max(...points.map(p => p.x)));
      const y0 = Math.floor(Math.min(...points.map(p => p.y))), y1 = Math.floor(Math.max(...points.map(p => p.y)));
      if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height || x1 - x0 < 8 || y1 - y0 < 8) {
        clear(); return observe(timestamp, 'unknown', 'Keep your whole mouth inside the camera view.');
      }
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({ x: c * x + s * y, y: -s * x + c * y }));
      const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y));
      const roiWidth = Math.max(...corners.map(p => p.x)) - minX, roiHeight = Math.max(...corners.map(p => p.y)) - minY;
      let rgba: Uint8ClampedArray | undefined, values: Float32Array | undefined, tensor: any, outputs: any;
      try {
        if (!canvas) {
          canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(32, 32) : document.createElement('canvas');
          canvas.width = canvas.height = 32; context = canvas.getContext('2d', { willReadFrequently: true });
        }
        context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, 32, 32);
        context.setTransform(32 / roiWidth * c, -32 / roiHeight * s, 32 / roiWidth * s, 32 / roiHeight * c, -minX * 32 / roiWidth, -minY * 32 / roiHeight);
        context.drawImage(input, 0, 0);
        rgba = context.getImageData(0, 0, 32, 32).data;
        values = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) values[i] = Math.round(.299 * rgba![i * 4] + .587 * rgba![i * 4 + 1] + .114 * rgba![i * 4 + 2]) / 255;
        tensor = new ort.Tensor('float32', values, [1, 1, 32, 32]);
        outputs = await session.run({ mouth: tensor });
        if (!enabled || closed || !alive() || generation !== revision) { clear(); return observe(timestamp, 'unknown', 'Tongue tracking stopped.'); }
        const confidence = Number(outputs.presence?.data[0]), heat = outputs.heatmap?.data;
        if (!Number.isFinite(confidence) || !heat || heat.length !== 1024 || !heat.every(Number.isFinite)) throw new Error('Invalid tongue model output');
        if (confidence <= .20) { clear(); return observe(timestamp, 'not-detected', 'Ready · stick your tongue out.', confidence); }
        if (confidence < (showing ? .55 : .75)) return uncertain(timestamp, 'not-detected', 'Ready · stick your tongue out.', confidence);
        // Average a small neighborhood to reduce single-pixel tip jitter.
        const reflect = (v: number) => v < 0 ? -v - 1 : v >= 32 ? 63 - v : v;
        let best = -Infinity, bx = 0, by = 0;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
          let sum = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sum += heat[reflect(y + dy) * 32 + reflect(x + dx)];
          if (sum > best) { best = sum; bx = x; by = y; }
        }
        if (best / 25 < .025 || bx < 1 || bx > 30 || by < 1 || by > 30) return uncertain(timestamp, 'unknown', 'Tongue tip is unclear · face the camera.', confidence);
        let sum = 0, wx = 0, wy = 0;
        for (let y = Math.max(0, by - 2); y <= Math.min(31, by + 2); y++) for (let x = Math.max(0, bx - 2); x <= Math.min(31, bx + 2); x++) {
          const weight = Math.max(0, heat[y * 32 + x]); sum += weight; wx += x * weight; wy += y * weight;
        }
        const tipX = (sum ? wx / sum : bx) / 32, tipY = (sum ? wy / sum : by) / 32;
        // Undo the crop transform before interpreting movement. The mouth ROI
        // changes with jaw shape, so its normalized midpoint is not a stable
        // origin for avatar direction.
        const rotatedX = minX + tipX * roiWidth, rotatedY = minY + tipY * roiHeight;
        const cameraX = c * rotatedX - s * rotatedY, cameraY = s * rotatedX + c * rotatedY;
        if (cameraX < 0 || cameraX >= width || cameraY < 0 || cameraY >= height) {
          clear(); return observe(timestamp, 'unknown', 'Keep your tongue inside the camera view.', confidence);
        }
        const dx = cameraX - (lipL.x + lipR.x) / 2, dy = cameraY - (lipL.y + lipR.y) / 2;
        // Eye span and axes resist mouth-width/crop changes while preserving
        // camera scale and roll. The resting tip is slightly below the lips.
        const directionX = (dx * eyeDX + dy * eyeDY) / (eyeSpan * eyeSpan) * 4.7;
        const directionY = ((-dx * eyeDY + dy * eyeDX) / (eyeSpan * eyeSpan) - .19) * 5.3;
        confirmations++;
        if (confirmations < 2) return observe(timestamp, 'unknown', 'Confirming tongue tip…', confidence);
        showing = true;
        // Image-right / image-down; the controller applies Mirror exactly once.
        const result = { ...observe(timestamp, 'detected', 'Following tongue tip · webcam', confidence, directionX, directionY),
          tip: { x: cameraX / width, y: cameraY / height }, held: false };
        lastPositive = result;
        return result;
      } catch { clear(); return observe(timestamp, 'unknown', 'Tongue tracking missed this frame. Keep your mouth clear.'); }
      finally {
        rgba?.fill(0); values?.fill(0); tensor?.dispose();
        if (outputs) for (const value of Object.values(outputs) as any[]) value.dispose();
        if (context) { context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, 32, 32); }
      }
    },
  };
}
