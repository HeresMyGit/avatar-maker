import { Matrix4, Quaternion } from "three";
import type { Landmark, MouthGeometry, TrackingFrame } from "./tracking";

export interface AdaptiveSettings { minCutoff: number; beta: number; derivativeCutoff?: number; }
const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

/** One Euro low-pass: stable at rest, higher cutoff during deliberate movement. */
export class AdaptiveScalar {
  private time = -Infinity;
  private raw = 0;
  private value = 0;
  private speed = 0;
  samples = 0;
  constructor(private settings: AdaptiveSettings) {}
  reset() { this.time = -Infinity; this.speed = 0; this.samples = 0; }
  update(value: number, timestamp: number) {
    if (!Number.isFinite(value) || !Number.isFinite(timestamp)) return this.value;
    if (timestamp <= this.time) return this.value;
    const dt = (timestamp - this.time) / 1000;
    if (!Number.isFinite(this.time) || dt > .4) {
      this.value = this.raw = value; this.speed = 0;
    } else {
      const derivative = (value - this.raw) / Math.max(.001, dt);
      this.speed += (derivative - this.speed) * alpha(this.settings.derivativeCutoff ?? 1, dt);
      const cutoff = this.settings.minCutoff + this.settings.beta * Math.abs(this.speed);
      this.value += (value - this.value) * alpha(cutoff, dt);
      this.raw = value;
    }
    this.time = timestamp; this.samples++;
    return this.value;
  }
}

/** Geodesic equivalent: filter angular speed and slerp, never quaternion components. */
export class AdaptiveRotation {
  private time = -Infinity;
  private raw = new Quaternion();
  private value = new Quaternion();
  private speed = 0;
  samples = 0;
  constructor(private settings: AdaptiveSettings = { minCutoff: 2, beta: 1.5 }) {}
  reset() { this.time = -Infinity; this.speed = 0; this.samples = 0; }
  update(value: Quaternion, timestamp: number) {
    if (![value.x, value.y, value.z, value.w, timestamp].every(Number.isFinite) || value.lengthSq() < .5) return this.value.clone();
    if (timestamp <= this.time) return this.value.clone();
    const dt = (timestamp - this.time) / 1000;
    if (!Number.isFinite(this.time) || dt > .4) { this.value.copy(value).normalize(); this.speed = 0; }
    else {
      const velocity = this.raw.angleTo(value) / Math.max(.001, dt);
      this.speed += (velocity - this.speed) * alpha(this.settings.derivativeCutoff ?? 1, dt);
      this.value.slerp(value, alpha(this.settings.minCutoff + this.settings.beta * this.speed, dt)).normalize();
    }
    this.raw.copy(value); this.time = timestamp; this.samples++;
    return this.value.clone();
  }
}

export function createTrackingSmoother() {
  const faceFilters = new Map<string, AdaptiveScalar>(), poseFilters = new Map<string, AdaptiveScalar>();
  const rotation = new AdaptiveRotation({ minCutoff: 2, beta: 1.5 });
  const metrics = { faceSamples: 0, poseSamples: 0 };
  let faceTime = -Infinity, poseTime = -Infinity;
  let cachedFace: TrackingFrame["face"] = null, cachedMatrix: number[] | null = null;
  let cachedGeometry: MouthGeometry | null = null, cachedPose: Landmark[] | null = null;
  function filter(bank: Map<string, AdaptiveScalar>, key: string, value: number, time: number, settings: AdaptiveSettings) {
    let f = bank.get(key); if (!f) bank.set(key, f = new AdaptiveScalar(settings));
    return f.update(value, time);
  }
  const resetFace = () => { faceFilters.clear(); rotation.reset(); faceTime = -Infinity; cachedFace = null; cachedGeometry = null; cachedMatrix = null; };
  const resetPose = () => { poseFilters.clear(); poseTime = -Infinity; cachedPose = null; };
  return {
    metrics,
    reset() { resetFace(); resetPose(); metrics.faceSamples = metrics.poseSamples = 0; },
    update(frame: TrackingFrame): TrackingFrame {
      const ft = frame.faceTimestamp ?? frame.timestamp, pt = frame.poseTimestamp ?? frame.timestamp;
      if (!frame.faceTracked) resetFace();
      else if (Number.isFinite(ft) && ft > faceTime) {
        faceTime = ft; metrics.faceSamples++;
        cachedFace = frame.face ? Object.fromEntries(Object.entries(frame.face).map(([key, value]) => [key,
          filter(faceFilters, key, value, ft, key.startsWith("eyeBlink") ? { minCutoff: 12, beta: 12 }
            : /^(jawOpen|mouthClose|mouthPress)/.test(key) ? { minCutoff: 8, beta: 14 }
            : key.startsWith("mouth") ? { minCutoff: 4.5, beta: 10 }
            : { minCutoff: 2.2, beta: 8 })])) : null;
        cachedGeometry = frame.mouthGeometry ? { ...frame.mouthGeometry } : null;
        if (cachedGeometry && cachedGeometry.quality >= .45) {
          const opening = cachedGeometry.opening;
          cachedGeometry.opening = filter(faceFilters, "geometry.opening", opening, ft, { minCutoff: 8, beta: 40 });
          // Track the opening faster without turning a syllable into a frown:
          // filter each corner's curvature separately from its jaw movement.
          for (const side of ["leftCorner", "rightCorner"] as const) {
            cachedGeometry[side] = filter(faceFilters, `geometry.${side}Shape`, cachedGeometry[side] - opening * .5,
              ft, { minCutoff: 4.5, beta: 35 }) + cachedGeometry.opening * .5;
          }
          for (const name of ["width", "centerX", "tilt"] as const) {
            cachedGeometry[name] = filter(faceFilters, `geometry.${name}`, cachedGeometry[name], ft, { minCutoff: 4.5, beta: 35 });
          }
        } else for (const name of [...faceFilters.keys()]) if (name.startsWith("geometry.")) faceFilters.delete(name);
        cachedMatrix = frame.faceMatrix;
        if (cachedMatrix?.length === 16 && cachedMatrix.every(Number.isFinite)) {
          const matrix = new Matrix4().extractRotation(new Matrix4().fromArray(cachedMatrix));
          const q = rotation.update(new Quaternion().setFromRotationMatrix(matrix).normalize(), ft);
          cachedMatrix = new Matrix4().makeRotationFromQuaternion(q).toArray();
        }
      }
      if (!frame.poseTracked) resetPose();
      else if (Number.isFinite(pt) && pt > poseTime) {
        poseTime = pt; metrics.poseSamples++;
        cachedPose = frame.poseWorld?.map((point, i) => {
          // Confidence remains current. Hidden joints must never be kept alive by smoothing.
          if ((point.visibility ?? 1) < .5 || (point.presence ?? 1) < .5 || ![point.x, point.y, point.z].every(Number.isFinite)) {
            for (const axis of ["x", "y", "z"]) poseFilters.delete(`${i}.${axis}`);
            return { ...point };
          }
          const p = { ...point };
          for (const axis of ["x", "y", "z"] as const) p[axis] = filter(poseFilters, `${i}.${axis}`, p[axis], pt, { minCutoff: 1.6, beta: 12 });
          return p;
        }) ?? null;
      }
      return { ...frame, face: cachedFace, faceMatrix: cachedMatrix, mouthGeometry: cachedGeometry, poseWorld: cachedPose };
    },
  };
}
