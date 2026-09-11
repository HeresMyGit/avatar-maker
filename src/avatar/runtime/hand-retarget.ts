import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { AdaptiveRotation, AdaptiveScalar } from "./adaptive-smoothing";
import type { Landmark, TrackedHand, TrackingFrame } from "./tracking";

type Side = "Left" | "Right";
const clamp = (v: number, lo = 0, hi = 1) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0;
const key = (v: string) => v.replace(/[^a-z0-9]/gi, "").toLowerCase();
const identity = new Quaternion();
export const HAND_CURL_LIMITS = [.30, .35, .20] as const;
export const HAND_WRIST_LIMITS = { swing: .65, twist: 1.2 } as const;
const vector = (p: Landmark, mirror: boolean) => new Vector3(p.x * (mirror ? -1 : 1), -p.y, -p.z);
const valid = (p: Landmark | undefined) => !!p && [p.x, p.y, p.z].every(Number.isFinite);

/** Pose wrists resolve MediaPipe's selfie-label ambiguity before the mirror mapping. */
export function resolveHandSide(hand: TrackedHand, frame: TrackingFrame): Side {
  const wrist = hand.landmarks[0];
  if (!valid(wrist) || !frame.poseTracked || !frame.pose) return hand.handedness;
  if (frame.poseTimestamp !== undefined && Math.abs(hand.timestamp - frame.poseTimestamp) > 180) return hand.handedness;
  const distances = ([15, 16] as const).map(i => {
    const p = frame.pose![i];
    return valid(p) && (p.visibility ?? 1) > .65 && (p.presence ?? 1) > .6 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1
      ? Math.hypot(p.x - wrist.x, p.y - wrist.y) : Infinity;
  });
  const nearest = Math.min(...distances);
  if (nearest < .16 && Math.abs(distances[0] - distances[1]) > .055) return distances[0] < distances[1] ? "Left" : "Right";
  return hand.handedness;
}

function palmFrame(forward: Vector3, normal: Vector3) {
  const x = forward.clone().cross(normal).normalize();
  const z = x.clone().cross(forward).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, forward, z)).normalize();
}

/** Translation-free palm orientation and curl of the supported index/mitten chain. */
export function observeHand(hand: TrackedHand, anatomicalSide: Side, mirror: boolean) {
  if (!Number.isFinite(hand.score) || hand.score < .5 || hand.worldLandmarks.length < 21 || hand.landmarks.length < 21) return null;
  if (![0, 5, 6, 7, 8, 9, 17].every(i => valid(hand.worldLandmarks[i]) && valid(hand.landmarks[i]))) return null;
  const image = hand.landmarks[0];
  if (image.x < -.05 || image.x > 1.05 || image.y < -.05 || image.y > 1.05) return null;
  const p = hand.worldLandmarks.map(point => vector(point, mirror));
  const forward = p[9].clone().sub(p[0]);
  const across = p[5].clone().sub(p[17]);
  if (forward.length() < .02 || forward.length() > .25 || across.length() < .015 || across.length() > .20) return null;
  forward.normalize(); across.normalize();
  const side: Side = mirror ? (anatomicalSide === "Left" ? "Right" : "Left") : anatomicalSide;
  const normal = forward.clone().cross(across).multiplyScalar(side === "Left" ? 1 : -1);
  if (normal.length() < .25) return null;
  normal.normalize();
  const curlAxis = forward.clone().cross(normal).normalize();
  const angle = (a: number, b: number, c: number) => {
    const u = p[b].clone().sub(p[a]), v = p[c].clone().sub(p[b]);
    if (u.lengthSq() < 1e-6 || v.lengthSq() < 1e-6) return null;
    // Ignore lateral finger spreading: the mitten can curl, but cannot splay.
    u.addScaledVector(curlAxis, -u.dot(curlAxis)).normalize();
    v.addScaledVector(curlAxis, -v.dot(curlAxis)).normalize();
    const signed = Math.atan2(curlAxis.dot(u.clone().cross(v)), u.dot(v));
    return clamp((signed - .10) / 1.15);
  };
  // MCP uses the wrist-to-index ray; PIP/DIP use adjacent index segments.
  // Signed bending distinguishes a curled finger from a hyperextended one.
  const curls = [angle(0, 5, 6), angle(5, 6, 7), angle(6, 7, 8)];
  if (curls.some(v => v === null)) return null;
  return { side, orientation: palmFrame(forward, normal), curls: curls as number[], score: hand.score, timestamp: hand.timestamp };
}

/** Limit relative wrist bending and palm roll around the authored hand direction. */
export function clampWristDelta(delta: Quaternion, forward: Vector3) {
  const q = delta.clone().normalize(); if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const projection = new Vector3(q.x, q.y, q.z).dot(forward);
  let twist = new Quaternion(forward.x * projection, forward.y * projection, forward.z * projection, q.w);
  if (twist.lengthSq() < 1e-8) twist.identity(); else twist.normalize();
  const swing = q.clone().multiply(twist.clone().invert()).normalize();
  const swingAngle = swing.angleTo(identity);
  if (swingAngle > HAND_WRIST_LIMITS.swing) swing.slerp(identity, 1 - HAND_WRIST_LIMITS.swing / swingAngle);
  const twistAngle = 2 * Math.atan2(new Vector3(twist.x, twist.y, twist.z).dot(forward), twist.w);
  twist = new Quaternion().setFromAxisAngle(forward, clamp(twistAngle, -HAND_WRIST_LIMITS.twist, HAND_WRIST_LIMITS.twist));
  return swing.multiply(twist).normalize();
}

export function createHandRetarget(avatar: Object3D) {
  avatar.updateWorldMatrix(true, true);
  const names = new Map<string, Object3D>();
  avatar.traverse(b => { if ((b as any).isBone) names.set(key(b.name), b); });
  const inverse = avatar.getWorldQuaternion(new Quaternion()).invert();
  const worldQ = (b: Object3D) => b.getWorldQuaternion(new Quaternion()).premultiply(inverse);
  const bindings = (["Left", "Right"] as const).flatMap(side => {
    const bone = names.get(key(`mixamorig${side}Hand`)), first = names.get(key(`mixamorig${side}HandIndex1`));
    if (!bone || !first) return [];
    const restWorld = worldQ(bone);
    const forward = first.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).applyQuaternion(inverse).normalize();
    if (forward.lengthSq() < .5) return [];
    // The source mitten palms face avatar-down in the authored T pose. Using a
    // common avatar frame avoids the rig's asymmetric left/right local axes.
    const restFrame = palmFrame(forward, new Vector3(0, -1, 0));
    const joints = [1, 2, 3].flatMap((index, i) => {
      const joint = names.get(key(`mixamorig${side}HandIndex${index}`));
      if (!joint) return [];
      const axis = new Vector3(0, 0, side === "Left" ? -1 : 1).applyQuaternion(worldQ(joint).invert()).normalize();
      return [{ bone: joint, rest: joint.quaternion.clone(), axis, limit: HAND_CURL_LIMITS[i], filter: new AdaptiveScalar({ minCutoff: 3, beta: 5 }) }];
    });
    return [{ side, bone, rest: bone.quaternion.clone(), restWorld, restFrame,
      forwardLocal: forward.clone().applyQuaternion(restWorld.clone().invert()), joints,
      rotation: new AdaptiveRotation({ minCutoff: 2.2, beta: 1.5 }), timestamp: -Infinity,
      target: null as ReturnType<typeof observeHand>, active: false }];
  });
  const metrics = { leftTracked: false, rightTracked: false, leftConfidence: 0, rightConfidence: 0, samples: 0 };
  let disposed = false, written = false, lastMirror = true;
  function resetFilters() {
    for (const b of bindings) { b.rotation.reset(); for (const j of b.joints) j.filter.reset(); b.target = null; b.timestamp = -Infinity; b.active = false; }
    metrics.leftTracked = metrics.rightTracked = false; metrics.leftConfidence = metrics.rightConfidence = 0;
  }
  function restore() {
    if (written) for (const b of bindings) { b.bone.quaternion.copy(b.rest); for (const j of b.joints) j.bone.quaternion.copy(j.rest); }
    if (written) avatar.updateWorldMatrix(true, true);
    written = false; resetFilters();
  }
  return {
    metrics,
    boundBoneNames: Object.freeze(bindings.flatMap(b => [b.bone.name, ...b.joints.map(j => j.bone.name)])),
    reset() { restore(); metrics.samples = 0; },
    /** Apply after arm/spine retarget; leave every translation and scale untouched. */
    update(frame: TrackingFrame | null, dt: number, options: { enabled?: boolean; mirror?: boolean } = {}) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      const enabled = options.enabled !== false, mirror = options.mirror ?? true;
      if (!enabled && !written) return;
      if (mirror !== lastMirror) { resetFilters(); lastMirror = mirror; }
      const observations = new Map<Side, NonNullable<ReturnType<typeof observeHand>>>();
      if (enabled && frame) for (const hand of frame.hands ?? []) {
        if (!Number.isFinite(hand.timestamp) || performance.now() - hand.timestamp > 350 || hand.timestamp - performance.now() > 100) continue;
        const observation = observeHand(hand, resolveHandSide(hand, frame), mirror);
        if (observation && observation.score > (observations.get(observation.side)?.score ?? 0)) observations.set(observation.side, observation);
      }
      metrics.leftTracked = metrics.rightTracked = false; metrics.leftConfidence = metrics.rightConfidence = 0;
      const alpha = 1 - Math.exp(-28 * Math.min(dt, .1));
      for (const b of bindings) {
        let observation = observations.get(b.side);
        if (observation && observation.score < (b.active ? .5 : .65)) observation = undefined;
        if (observation && observation.timestamp > b.timestamp) {
          b.timestamp = observation.timestamp; metrics.samples++;
          b.target = { ...observation, orientation: b.rotation.update(observation.orientation, observation.timestamp),
            curls: observation.curls.map((curl, i) => b.joints[i]?.filter.update(curl, observation.timestamp) ?? 0) };
        }
        // Brief detector misses hold a valid hand; stale or disabled hands ease
        // back to authored rest. Duplicate video frames never advance filters.
        const held = enabled && b.target && performance.now() - b.timestamp < 180;
        const target = observation ? b.target : held ? b.target : null;
        b.active = !!target;
        if (target) {
          if (b.side === "Left") { metrics.leftTracked = true; metrics.leftConfidence = target.score; }
          else { metrics.rightTracked = true; metrics.rightConfidence = target.score; }
          const avatarQ = avatar.getWorldQuaternion(new Quaternion());
          const parentQ = b.bone.parent?.getWorldQuaternion(new Quaternion()) ?? identity.clone();
          const desiredWorld = target.orientation.clone().multiply(b.restFrame.clone().invert()).multiply(b.restWorld);
          const desiredLocal = parentQ.invert().multiply(avatarQ).multiply(desiredWorld);
          const delta = b.rest.clone().invert().multiply(desiredLocal);
          const local = b.rest.clone().multiply(clampWristDelta(delta, b.forwardLocal));
          b.bone.quaternion.slerp(local, alpha).normalize();
          b.joints.forEach((j, i) => j.bone.quaternion.slerp(j.rest.clone().multiply(new Quaternion().setFromAxisAngle(j.axis, target.curls[i] * j.limit)), alpha).normalize());
          written = true;
        } else {
          // Preserve authored quaternion components until tracking has driven a hand.
          if (written) {
            b.bone.quaternion.slerp(b.rest, alpha).normalize();
            for (const j of b.joints) j.bone.quaternion.slerp(j.rest, alpha).normalize();
          }
          b.rotation.reset(); for (const j of b.joints) j.filter.reset(); b.target = null; b.timestamp = -Infinity;
        }
        b.bone.updateWorldMatrix(false, true);
      }
    },
    dispose() { if (!disposed) { restore(); disposed = true; } },
  };
}
