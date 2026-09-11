import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { createFaceAnimation } from "../integration/face-animation";
import type { MouthArticulation, MouthFlexPose, MouthViseme } from "../integration/mouth-lipsync";
import type { Landmark, MouthGeometry, TrackingFrame } from "./tracking";
import { createTrackingSmoother } from "./adaptive-smoothing";
import { createHandRetarget } from "./hand-retarget";
import { speechMouthOpening, SPEECH_LIP_CLEARANCE, type SpeechMouthOptions } from "./speech-response";

const clamp = (n: number, a = 0, b = 1) => Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : 0;
const key = (name: string) => name.replace(/[^a-z0-9]/gi, "").toLowerCase();
const identity = new Quaternion();
interface Binding { bone: Object3D; rest: Quaternion; restWorld: Quaternion; direction?: Vector3; }

const scoreAt = (scores: Record<string, number> | null, name: string) => clamp(scores?.[name] ?? 0);
function calibratedScore(scores: Record<string, number> | null, neutral: Record<string, number>, name: string, gain: number, baselineLimit = .2) {
  const baseline = Math.min(baselineLimit, scoreAt(neutral, name));
  // A small dead band rejects coefficient jitter around the captured relaxed face.
  return clamp((scoreAt(scores, name) - baseline - .012) / Math.max(.25, 1 - baseline) * gain);
}
const smoothstep = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Map measured lip opening, rounding, pursing and stretching into the existing
 * authored palette. The complete set of weights is a convex blend (sum <= 1),
 * so a wide/round adjustment never stacks at full strength on an open vowel.
 * Smile uses widening: the current asset has no independent corner-raise morph.
 */
export function cameraMouthPose(scores: Record<string, number> | null, neutral: Record<string, number> = {}, audioLevel = 0) {
  if (!scores) return {
    visemes: { viseme_aa: clamp(audioLevel), viseme_E: 0, viseme_ih: 0, viseme_oh: 0, viseme_ou: 0 },
    articulation: { mouthWide: 0, mouthFunnel: 0, mouthPucker: 0 },
    jaw: clamp(audioLevel), round: 0, wide: 0, source: "audio" as const,
  };
  const signal = (name: string, gain = 1.7, baselineLimit = .2) => calibratedScore(scores, neutral, name, gain, baselineLimit);
  const bilateral = (stem: string, gain: number) => (signal(`${stem}Left`, gain) + signal(`${stem}Right`, gain)) / 2;
  // Visible lips are authoritative. A loud microphone must not reopen closed lips.
  const jaw = signal("jawOpen", 1.7, .22)
    * (1 - signal("mouthClose", 1.2) * .95)
    * (1 - bilateral("mouthPress", 1.3) * .5);
  const funnel = signal("mouthFunnel", 1.9);
  const pucker = signal("mouthPucker", 1.9);
  const round = Math.max(funnel, pucker);
  const wide = Math.max(bilateral("mouthStretch", 1.8), bilateral("mouthSmile", 1.55) * .9);
  const roundPuckerFraction = pucker / Math.max(.0001, funnel + pucker);
  const longOpen = smoothstep(.15, .65, jaw);
  const unrounded = 1 - round;
  const unshaped = unrounded * (1 - wide);
  const fractions: Record<MouthViseme, number> = {
    viseme_aa: unshaped * longOpen,
    viseme_E: unrounded * wide,
    viseme_ih: unshaped * (1 - longOpen),
    viseme_oh: round * (1 - roundPuckerFraction),
    viseme_ou: round * roundPuckerFraction,
  };
  // Existing full-shape apertures relative to jawOpen (from build_face_mouths.py).
  // Compensating here keeps an E/ih mouth from barely moving at the same jaw input.
  const aperture: Record<MouthViseme, number> = {
    viseme_aa: 11 / 10.3, viseme_E: 4.5 / 10.3, viseme_ih: 6.1 / 10.3,
    viseme_oh: 12.2 / 10.3, viseme_ou: 8 / 10.3,
  };
  const visemes = Object.fromEntries(Object.entries(fractions).map(([name, fraction]) => [name, fraction * jaw / aperture[name as MouthViseme]])) as Record<MouthViseme, number>;
  const visemeSum = Object.values(visemes).reduce((sum, value) => sum + value, 0);
  if (visemeSum > 1) for (const name of Object.keys(visemes) as MouthViseme[]) visemes[name] /= visemeSum;
  // Closed-lip pursing and smiles must remain visible even when jawOpen is zero.
  const closedBudget = Math.min(1 - Math.min(1, visemeSum), (1 - smoothstep(.1, .65, jaw)) * .9);
  const articulation: Record<MouthArticulation, number> = {
    mouthWide: unrounded * wide * closedBudget,
    mouthFunnel: round * (1 - roundPuckerFraction) * closedBudget,
    mouthPucker: round * roundPuckerFraction * closedBudget,
  };
  return { visemes, articulation, jaw, round, wide, source: "camera" as const };
}

/**
 * Dedicated flexible-mouth input, preserving anatomical sides until the final
 * mirror mapping. Roll-corrected landmark differences capture a literal :-/;
 * opening compensation keeps a dropped jaw from falsely raising both corners.
 */
export function cameraFlexMouthPose(
  scores: Record<string, number>, neutral: Record<string, number> = {},
  geometry: MouthGeometry | null = null, neutralGeometry: MouthGeometry | null = null, mirror = true,
  speech: SpeechMouthOptions = {},
): MouthFlexPose {
  const signal = (name: string, gain = 1.7, limit = .2) => calibratedScore(scores, neutral, name, gain, limit);
  const corner = (side: "Left" | "Right") => {
    const signedSmile = (scoreAt(scores, `mouthSmile${side}`) - scoreAt(neutral, `mouthSmile${side}`))
      - (scoreAt(scores, `mouthFrown${side}`) - scoreAt(neutral, `mouthFrown${side}`));
    return Math.sign(signedSmile) * clamp((Math.abs(signedSmile) - .018) * 1.7);
  };
  let open = signal("jawOpen", 1.7, .22) * (1 - signal("mouthClose", 1.2) * .95)
    * (1 - (signal("mouthPressLeft", 1.3) + signal("mouthPressRight", 1.3)) * .25);
  let cornerLeft = corner("Left"), cornerRight = corner("Right");
  let narrow = Math.max(signal("mouthPucker", 1.9), signal("mouthFunnel", 1.9));
  let stretchLeft = signal("mouthStretchLeft", 1.6), stretchRight = signal("mouthStretchRight", 1.6);
  let shift = clamp((scoreAt(scores, "mouthLeft") - scoreAt(neutral, "mouthLeft")
    - scoreAt(scores, "mouthRight") + scoreAt(neutral, "mouthRight")) * 1.2, -.65, .65);
  if (geometry && neutralGeometry && geometry.quality >= .45 && neutralGeometry.quality >= .45
    && Number.isFinite(neutralGeometry.width) && neutralGeometry.width > .05
    && [geometry.width, geometry.opening, geometry.leftCorner, geometry.rightCorner, geometry.centerX,
      neutralGeometry.opening, neutralGeometry.leftCorner, neutralGeometry.rightCorner, neutralGeometry.centerX].every(Number.isFinite)) {
    const confidence = clamp((geometry.quality - .45) / .4);
    const width = neutralGeometry.width;
    const openingChange = (geometry.opening - neutralGeometry.opening) / width;
    // Authored ratios: aperture13 / width37.5, corner travel3.2 / width37.5,
    // lateral travel4.2 / width37.5. Match measured contour rather than arbitrary gains.
    const geometricOpen = clamp((openingChange - .008) / (13 / 37.5 - .008));
    open += (geometricOpen - open) * confidence;
    const deltaLeft = (geometry.leftCorner - neutralGeometry.leftCorner) / width;
    const deltaRight = (geometry.rightCorner - neutralGeometry.rightCorner) / width;
    const tilt = (deltaLeft - deltaRight) / 2;
    const curve = (deltaLeft + deltaRight) / 2 - openingChange * .5;
    const geometricLeft = clamp((curve + tilt) / (3.2 / 37.5), -1, 1);
    const geometricRight = clamp((curve - tilt) / (3.2 / 37.5), -1, 1);
    cornerLeft += (geometricLeft - cornerLeft) * confidence;
    cornerRight += (geometricRight - cornerRight) * confidence;
    const widthChange = geometry.width / width - 1;
    // Width is common to both sides; independent stretch scores retain asymmetry.
    const geometricStretch = clamp((widthChange - .025) * 4.5);
    stretchLeft = Math.max(stretchLeft, geometricStretch * confidence);
    stretchRight = Math.max(stretchRight, geometricStretch * confidence);
    narrow = Math.max(narrow, clamp((-widthChange - .025) / .45) * confidence);
    const geometricShift = clamp((geometry.centerX - neutralGeometry.centerX) / width / (4.2 / 37.5), -.65, .65);
    shift += (geometricShift - shift) * confidence;
  }
  // Resolve opposite width requests before the safety envelope. Small rounding
  // noise cannot erase a strong tracked stretch, and a pucker cannot also widen.
  const roundingEvidence = narrow;
  const wideIntent = Math.max(stretchLeft, stretchRight);
  const widthIntent = wideIntent - narrow;
  if (Math.abs(widthIntent) < .035) {
    narrow = stretchLeft = stretchRight = 0;
  } else if (widthIntent < 0) {
    narrow = -widthIntent;
    stretchLeft = stretchRight = 0;
  } else {
    const scale = widthIntent / Math.max(.0001, wideIntent);
    stretchLeft *= scale; stretchRight *= scale; narrow = 0;
  }
  // A relaxed, closed-lip smile often changes cheek/corner expression more than
  // the lip landmark contour. High-confidence landmarks must not erase that
  // detected smile. Require a calibrated rise on BOTH sides before adding shared
  // curvature; a wink/smirk or coefficient noise cannot lift the opposite corner.
  const smileRise = (side: "Left" | "Right") =>
    scoreAt(scores, `mouthSmile${side}`) - scoreAt(neutral, `mouthSmile${side}`)
    - Math.max(0, scoreAt(scores, `mouthFrown${side}`) - scoreAt(neutral, `mouthFrown${side}`));
  const bilateralSmile = clamp((Math.min(smileRise("Left"), smileRise("Right")) - .04) * 3.4);
  const closedLips = 1 - smoothstep(.08, .35, open);
  const noPucker = 1 - smoothstep(.12, .5, roundingEvidence);
  const noSlant = 1 - smoothstep(.15, .55, Math.abs(cornerLeft - cornerRight));
  const noFrown = 1 - smoothstep(.06, .3, Math.max(0, -Math.min(cornerLeft, cornerRight)));
  const smileShapeWeight = closedLips * noPucker * noSlant * noFrown;
  // Closed smiles read through curvature. Retain widening progressively as lips
  // open; an isolated stretch, slant, frown, or pucker keeps its own width input.
  const keepStretch = 1 - bilateralSmile * smileShapeWeight;
  stretchLeft *= keepStretch;
  stretchRight *= keepStretch;
  // Keep modest incidental stretch from damping this small closed smile twice:
  // once through contour measurement and again through the rig's safe envelope.
  // Compensation remains within the existing maximum corner input of one.
  const cornerEnvelope = (1 - .5 * narrow) * (1 - .4 * Math.max(stretchLeft, stretchRight));
  const smileTarget = clamp(bilateralSmile / cornerEnvelope);
  // Add the same amount to each side, preserving the measured corner difference.
  // Cap before adding so neither corner clips and silently flattens that slant.
  const lift = Math.min(Math.max(0, smileTarget - (cornerLeft + cornerRight) / 2),
    Math.max(0, 1 - Math.max(cornerLeft, cornerRight))) * smileShapeWeight;
  cornerLeft += lift;
  cornerRight += lift;
  return {
    // Expression inference uses the measured opening above; only the final rig
    // opening needs compensation for the thickness of the active mouth's lips.
    open: speechMouthOpening(open, speech), narrow,
    cornerLeft: mirror ? cornerRight : cornerLeft, cornerRight: mirror ? cornerLeft : cornerRight,
    shift: mirror ? -shift : shift,
    stretchLeft: mirror ? stretchRight : stretchLeft, stretchRight: mirror ? stretchLeft : stretchRight,
  };
}

/** Calibrated full-range blinks/widening and signed gaze, prior to blink protection. */
export function cameraEyePose(scores: Record<string, number> | null, neutral: Record<string, number> = {}, mirror = true) {
  if (!scores) return { left: 0, right: 0, gazeX: 0, gazeY: 0, wide: 0 };
  const signal = (name: string, gain: number, limit: number) => calibratedScore(scores, neutral, name, gain, limit);
  const left = signal("eyeBlinkLeft", 1.3, .25), right = signal("eyeBlinkRight", 1.3, .25);
  const difference = (positive: string[], negative: string[]) => {
    const sum = (map: Record<string, number>, keys: string[]) => keys.reduce((total, name) => total + scoreAt(map, name), 0);
    const actual = sum(scores, positive) - sum(scores, negative);
    const baseline = clamp(sum(neutral, positive) - sum(neutral, negative), -.8, .8);
    const centered = actual - baseline;
    return Math.sign(centered) * clamp((Math.abs(centered) - .025) * 1.4);
  };
  const gazeX = difference(["eyeLookOutLeft", "eyeLookInRight"], ["eyeLookInLeft", "eyeLookOutRight"]);
  const gazeY = difference(["eyeLookUpLeft", "eyeLookUpRight"], ["eyeLookDownLeft", "eyeLookDownRight"]);
  const wide = (signal("eyeWideLeft", 2.8, .35) + signal("eyeWideRight", 2.8, .35)) / 2;
  return { left: mirror ? right : left, right: mirror ? left : right, gazeX: mirror ? -gazeX : gazeX, gazeY, wide };
}

/** MediaPipe matrices are column-major. Remove scale before reading orientation. */
export function faceRotation(data: number[] | null): Quaternion | null {
  if (!data || data.length !== 16 || data.some(n => !Number.isFinite(n))) return null;
  const matrix = new Matrix4().fromArray(data);
  const rotation = new Matrix4().extractRotation(matrix);
  const q = new Quaternion().setFromRotationMatrix(rotation).normalize();
  return [q.x, q.y, q.z, q.w].every(Number.isFinite) ? q : null;
}

export function poseDirection(a: Landmark, b: Landmark, mirror = true): Vector3 | null {
  if (![a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)) return null;
  const direction = new Vector3((b.x - a.x) * (mirror ? -1 : 1), -(b.y - a.y), -(b.z - a.z));
  return direction.lengthSq() > 1e-8 ? direction.normalize() : null;
}

function limited(q: Quaternion, pitch: number, yaw: number, roll: number) {
  const e = new Euler().setFromQuaternion(q, "YXZ");
  return new Quaternion().setFromEuler(new Euler(clamp(e.x, -pitch, pitch), clamp(e.y, -yaw, yaw), clamp(e.z, -roll, roll), "YXZ"));
}

function visible(frame: TrackingFrame, index: number) {
  const p = frame.poseWorld?.[index];
  const image = frame.pose?.[index];
  return !!p && [p.x, p.y, p.z].every(Number.isFinite) && (p.visibility ?? 1) > .6 && (p.presence ?? 1) > .5
    && (!image || (image.x > -.1 && image.x < 1.1 && image.y > -.1 && image.y < 1.1
      && (image.visibility ?? 1) > .6 && (image.presence ?? 1) > .5));
}

export interface TorsoMetrics {
  torsoSource: "hips" | "shoulders" | "none";
  torsoTracked: boolean;
  torsoConfidence: number;
}
interface TorsoObservation { hips: Quaternion | null; shoulders: Quaternion; confidence: number; }

function torsoBasis(right: Vector3, up: Vector3, preserveUp = false): Quaternion | null {
  const forward = right.clone().cross(up);
  if (forward.lengthSq() < .04) return null;
  forward.normalize();
  // A visible hip-to-shoulder line measures waist lean even when the shoulders
  // counter-rotate to stay level. In a crop, preserve the shoulder axis instead.
  if (preserveUp) {
    const orthogonalRight = up.clone().cross(forward).normalize();
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(orthogonalRight, up, forward)).normalize();
  }
  const orthogonalUp = forward.clone().cross(right).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, orthogonalUp, forward)).normalize();
}

/** Both shoulders must actually be visible. Face motion never supplies a torso axis. */
export function observeTorso(frame: TrackingFrame, mirror = true): TorsoObservation | null {
  const inside = (index: number) => {
    const image = frame.pose?.[index];
    return visible(frame, index) && (!image || (image.x > .015 && image.x < .985 && image.y > .015 && image.y < .985));
  };
  if (![11, 12].every(inside)) return null;
  const points = frame.poseWorld!;
  const point = (index: number) => new Vector3(points[index].x * (mirror ? -1 : 1), -points[index].y, -points[index].z);
  const left = point(mirror ? 12 : 11), rightPoint = point(mirror ? 11 : 12);
  const right = left.clone().sub(rightPoint), width = right.length();
  // Metric world landmarks should describe a human shoulder span, not a collapsed
  // or flipped detector guess. Extreme turns need a second visible shoulder.
  if (width < .12 || width > .9) return null;
  right.divideScalar(width);
  if (right.x < .25) return null;
  const center = left.clone().add(rightPoint).multiplyScalar(.5);
  const confidence = Math.min(...[11, 12].flatMap(i => [
    points[i].visibility ?? 1, points[i].presence ?? 1,
    frame.pose?.[i]?.visibility ?? 1, frame.pose?.[i]?.presence ?? 1,
  ]));
  // World points are hip-centered even when hips are cropped. Their shoulder
  // center gives a bounded seated lean estimate, not a measured waist bend.
  // Ignore implausible depth/elevation instead of borrowing a head/nose direction.
  const plausibleCenter = center.y > .12 && center.y < .9 && center.y / width < 3
    && Math.abs(center.z) < .65;
  const pitch = plausibleCenter ? Math.atan2(center.z, center.y) : 0;
  const shoulders = torsoBasis(right, new Vector3(0, Math.cos(pitch), Math.sin(pitch)));
  if (!shoulders) return null;
  let hips: Quaternion | null = null;
  if ([23, 24].every(inside)) {
    const hipCenter = point(23).add(point(24)).multiplyScalar(.5);
    const up = center.clone().sub(hipCenter);
    const height = up.length();
    if (height > .15 && height < .95 && height / width < 3.2 && up.y / height > .4) {
      hips = torsoBasis(right, up.divideScalar(height), true);
    }
  }
  return { hips, shoulders, confidence: clamp(confidence) };
}

function torsoDelta(current: Quaternion, neutral: Quaternion, estimated: boolean) {
  const angles = new Euler().setFromQuaternion(current.clone().multiply(neutral.clone().invert()), "YXZ");
  // A small dead band suppresses depth jitter. In a crop, pitch is deliberately
  // less responsive and bounded more tightly than a visible shoulder/hip axis.
  const deadband = (n: number, amount: number) => Math.sign(n) * Math.max(0, Math.abs(n) - amount);
  return new Quaternion().setFromEuler(new Euler(
    clamp(deadband(angles.x, estimated ? .015 : .008) * (estimated ? .65 : 1), estimated ? -.23 : -.55, estimated ? .23 : .55),
    clamp(deadband(angles.y, .008), -.55, .55),
    clamp(deadband(angles.z, .008), -.42, .42), "YXZ"));
}

/**
 * Uses landmark directions plus each bone's authored rest rotation; it never scales
 * bones or changes their lengths. Enhanced adds supported wrist/mitten motion. Call before
 * secondary-motion physics, and do not run a body AnimationMixer afterward.
 */
export function createAvatarRetarget(avatar: Object3D) {
  // Selected GLBs can contain only the robot mouth or a rigid eye accessory.
  const face = createFaceAnimation(avatar, { allowEmpty: true });
  const mouthMeshes = face.mouth.boundFlexMouthNames.map(name => avatar.getObjectByName(name)).filter((mesh): mesh is Object3D => !!mesh);
  const smoother = createTrackingSmoother();
  const hands = createHandRetarget(avatar);
  avatar.updateWorldMatrix(true, true);
  const names = new Map<string, Object3D>();
  avatar.traverse(object => { if ((object as any).isBone) names.set(key(object.name), object); });
  const avatarRestInverse = avatar.getWorldQuaternion(new Quaternion()).invert();
  const bindings = new Map<string, Binding>();
  for (const name of ["Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) {
    const bone = names.get(key(`mixamorig${name}`));
    if (!bone) continue;
    const childName = ({ LeftShoulder: "LeftArm", RightShoulder: "RightArm", LeftArm: "LeftForeArm", RightArm: "RightForeArm", LeftForeArm: "LeftHand", RightForeArm: "RightHand" } as Record<string, string>)[name];
    const child = childName ? names.get(key(`mixamorig${childName}`)) : undefined;
    const direction = child ? child.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize().applyQuaternion(avatarRestInverse) : undefined;
    bindings.set(name, { bone, rest: bone.quaternion.clone(), restWorld: bone.getWorldQuaternion(new Quaternion()).premultiply(avatarRestInverse), direction });
  }
  let headNeutral: Quaternion | null = null;
  let torsoNeutral: Quaternion | null = null;
  let shoulderNeutral: Quaternion | null = null;
  const metrics: TorsoMetrics = { torsoSource: "none", torsoTracked: false, torsoConfidence: 0 };
  let faceNeutral: Record<string, number> = {};
  let mouthNeutral: MouthGeometry | null = null;
  let lastFlexPose: MouthFlexPose | null = null;
  let flexMissingSeconds = 0;
  let calibrationId = -1;
  let lastFrame: TrackingFrame | null = null;
  let disposed = false;
  let lastMirror = true;
  let lastMode: "original" | "enhanced" = "enhanced";

  function captureTorsoNeutral(frame: TrackingFrame) {
    const observation = observeTorso(frame, lastMirror);
    torsoNeutral = observation?.hips?.clone() ?? null;
    shoulderNeutral = observation?.shoulders.clone() ?? null;
    return !!observation;
  }

  function calibrate(frame: TrackingFrame | null = lastFrame) {
    if (!frame) return false;
    smoother.reset(); hands.reset();
    const q = faceRotation(frame.faceMatrix);
    if (q) headNeutral = q;
    if (frame.face) faceNeutral = { ...frame.face };
    if (frame.mouthGeometry) mouthNeutral = { ...frame.mouthGeometry };
    const torso = captureTorsoNeutral(frame);
    return !!q || torso;
  }

  function applyWorld(binding: Binding, targetInAvatar: Quaternion, currentInAvatar: Quaternion, alpha: number) {
    const parentWorld = binding.bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    const avatarWorld = avatar.getWorldQuaternion(new Quaternion());
    const smoothed = currentInAvatar.slerp(targetInAvatar, alpha);
    const local = parentWorld.invert().multiply(avatarWorld).multiply(smoothed).normalize();
    binding.bone.quaternion.copy(local);
    binding.bone.updateWorldMatrix(false, true);
  }

  return {
    face,
    metrics,
    smoothingMetrics: smoother.metrics,
    handMetrics: hands.metrics,
    boundHandBoneNames: hands.boundBoneNames,
    boundBoneNames: Object.freeze([...bindings.values()].map(b => b.bone.name)),
    calibrate,
    update(frame: TrackingFrame | null, deltaSeconds: number, options: { body?: boolean; face?: boolean; microphone?: boolean; mirror?: boolean; hands?: boolean; tongueOut?: number; mouthSensitivity?: number; mode?: "original" | "enhanced" } = {}) {
      if (disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const dt = Math.min(deltaSeconds, .1);
      const mode = options.mode ?? "enhanced";
      const enhanced = mode === "enhanced";
      // Enhanced filters detector samples first; a shorter rendering ease avoids
      // stacking those filters on top of the Original 12/s pose response.
      const alpha = 1 - Math.exp(-(enhanced ? 30 : 12) * dt);
      const mirror = options.mirror ?? true;
      let fresh = frame && performance.now() - frame.timestamp < 900 ? frame : null;
      if (mode !== lastMode || mirror !== lastMirror) { smoother.reset(); hands.reset(); lastMode = mode; }
      if (mirror !== lastMirror) {
        // Reflect existing neutral frames rather than recapturing a bent posture.
        for (const neutral of [torsoNeutral, shoulderNeutral]) if (neutral) neutral.set(neutral.x, -neutral.y, -neutral.z, neutral.w);
        lastMirror = mirror;
      }
      lastFrame = fresh;
      if (fresh?.calibration && fresh.calibration.id !== calibrationId) {
        smoother.reset(); hands.reset();
        calibrationId = fresh.calibration.id;
        headNeutral = faceRotation(fresh.calibration.faceMatrix);
        faceNeutral = { ...fresh.calibration.face };
        mouthNeutral = fresh.calibration.mouthGeometry ? { ...fresh.calibration.mouthGeometry } : null;
        captureTorsoNeutral(fresh);
      }
      if (enhanced && fresh) fresh = smoother.update(fresh);
      else if (!fresh) smoother.reset();

      const tongueOpen = .35 * Math.min(1, clamp(options.tongueOut ?? 0) * 5);
      if (options.face !== false) {
        const f = fresh?.faceTracked ? fresh.face : null;
        const supportsFlex = face.mouth.boundFlexMouthNames.length === face.mouth.boundMouthNames.length;
        if (f && supportsFlex) {
          const mouthName = mouthMeshes.find(mesh => mesh.visible)?.name ?? "mouth_smile";
          lastFlexPose = cameraFlexMouthPose(f, faceNeutral, fresh?.mouthGeometry ?? null, mouthNeutral, mirror,
            { sensitivity: options.mouthSensitivity, lipClearance: SPEECH_LIP_CLEARANCE[mouthName] });
          flexMissingSeconds = 0;
          face.mouth.setFlex(tongueOpen > 0 ? { ...lastFlexPose, open: Math.max(lastFlexPose.open ?? 0, tongueOpen) } : lastFlexPose);
        } else if (supportsFlex && lastFlexPose && (flexMissingSeconds += dt) <= .16) {
          // A few missed detections must not flash back to the authored smile.
          face.mouth.setFlex(tongueOpen > 0 ? { ...lastFlexPose, open: Math.max(lastFlexPose.open ?? 0, tongueOpen) } : lastFlexPose);
        } else {
          lastFlexPose = null;
          const mouth = cameraMouthPose(f, faceNeutral, options.microphone !== false ? fresh?.audioLevel ?? 0 : 0);
          if (tongueOpen > 0 && supportsFlex) face.mouth.setFlex({ open: Math.max(mouth.jaw, tongueOpen) });
          else {
            face.mouth.setVisemes(tongueOpen > 0 ? { ...mouth.visemes, viseme_aa: Math.max(mouth.visemes.viseme_aa ?? 0, tongueOpen) } : mouth.visemes);
            face.mouth.setArticulation(mouth.articulation);
          }
        }
        const eyes = cameraEyePose(f, faceNeutral, mirror);
        face.eyes.setBlink(eyes.left, eyes.right);
        face.eyes.setGaze(eyes.gazeX, eyes.gazeY);
        face.eyes.setWide(eyes.wide);
      } else { face.reset(); lastFlexPose = null; flexMissingSeconds = 0; if (tongueOpen > 0) face.mouth.setFlex({ open: tongueOpen }); }
      if (enhanced) {
        // Only response interpolation uses these factors (no clocks/inference).
        // Blink keeps its faster filter and avoids an extra slow render stage.
        face.mouth.update(dt * 3.5); face.eyes.update(dt * 1.5);
      } else face.update(dt);

      const targets = new Map<string, Quaternion>();
      let chestDelta: Quaternion | null = null;
      metrics.torsoSource = "none"; metrics.torsoTracked = false; metrics.torsoConfidence = 0;
      if (options.body !== false && fresh?.poseTracked) {
        const torso = observeTorso(fresh, mirror);
        if (torso) {
          if (!shoulderNeutral) shoulderNeutral = torso.shoulders.clone();
          const seatedDelta = torsoDelta(torso.shoulders, shoulderNeutral, true);
          if (torso.hips && !torsoNeutral) {
            // First visible hips join the existing seated pose without snapping
            // to a newly invented neutral when the user steps back mid-lean.
            torsoNeutral = seatedDelta.clone().invert().multiply(torso.hips);
          }
          chestDelta = torso.hips && torsoNeutral ? torsoDelta(torso.hips, torsoNeutral, false) : seatedDelta;
          metrics.torsoSource = torso.hips ? "hips" : "shoulders";
          metrics.torsoTracked = true;
          metrics.torsoConfidence = torso.confidence * (torso.hips ? 1 : .75);
          // These are cumulative WORLD rotations, not three additive rotations.
          // Each joint takes only its share; the chest reaches the measured lean.
          const spineNames = ["Spine", "Spine1", "Spine2"].filter(name => bindings.has(name));
          for (let i = 0; i < spineNames.length; i++) {
            const name = spineNames[i], binding = bindings.get(name)!;
            const weight = spineNames.length === 3 ? [.28, .62, 1][i] : (i + 1) / spineNames.length;
            targets.set(name, identity.clone().slerp(chestDelta, weight).multiply(binding.restWorld));
          }
        }
        for (const [side, a, b, c] of [["Left", 11, 13, 15], ["Right", 12, 14, 16]] as const) {
          const inputA = mirror ? (a === 11 ? 12 : 11) : a;
          const inputB = mirror ? (b === 13 ? 14 : 13) : b;
          const inputC = mirror ? (c === 15 ? 16 : 15) : c;
          for (const [name, start, end] of [[`${side}Shoulder`, inputA === 11 ? 12 : 11, inputA], [`${side}Arm`, inputA, inputB], [`${side}ForeArm`, inputB, inputC]] as const) {
            const binding = bindings.get(name);
            if (!binding?.direction || !visible(fresh, start) || !visible(fresh, end)) continue;
            const direction = poseDirection(fresh.poseWorld![start], fresh.poseWorld![end], mirror);
            if (!direction) continue;
            let delta = new Quaternion().setFromUnitVectors(binding.direction, direction);
            // A clavicle rides on the chest. Add only a small residual correction
            // to its chest-rotated rest direction, so it cannot undo the spine.
            if (name.endsWith("Shoulder")) {
              const chest = chestDelta ?? identity;
              const residual = new Quaternion().setFromUnitVectors(binding.direction.clone().applyQuaternion(chest), direction);
              delta = identity.clone().slerp(residual, .25).multiply(chest);
            }
            const angle = delta.angleTo(identity);
            if (angle > 2.6) delta = identity.clone().slerp(delta, 2.6 / angle);
            targets.set(name, delta.multiply(binding.restWorld));
          }
        }
      }
      if (options.face !== false && fresh?.faceTracked) {
        const q = faceRotation(fresh.faceMatrix);
        const head = bindings.get("Head");
        if (q && head) {
          if (!headNeutral) headNeutral = q.clone();
          let delta = q.multiply(headNeutral.clone().invert());
          if (mirror) delta.set(delta.x, -delta.y, -delta.z, delta.w);
          delta = limited(delta, .6, .85, .4);
          const neck = bindings.get("Neck");
          if (neck) {
            // Split the relative neck turn while keeping the final head in the
            // measured world orientation, even when the spine leans underneath.
            targets.set("Neck", (chestDelta ?? identity).clone().slerp(delta, .45).multiply(neck.restWorld));
          }
          targets.set("Head", delta.clone().multiply(head.restWorld));
        }
      }
      // Apply parents first. Local rest targets on tracking loss naturally retain
      // the parent's current movement while smoothly returning each joint to rest.
      const order = ["Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "Head"];
      // Snapshot before any parent changes: smoothing local child rotations after
      // moving their parents would apply a second transient turn to head and arms.
      const avatarInverse = avatar.getWorldQuaternion(new Quaternion()).invert();
      const currentWorld = new Map([...bindings].map(([name, binding]) => [name,
        binding.bone.getWorldQuaternion(new Quaternion()).premultiply(avatarInverse)]));
      for (const name of order) {
        const binding = bindings.get(name);
        if (!binding) continue;
        const target = targets.get(name);
        if (target) applyWorld(binding, target, currentWorld.get(name)!, alpha);
        else { binding.bone.quaternion.slerp(binding.rest, alpha).normalize(); binding.bone.updateWorldMatrix(false, true); }
      }
      hands.update(fresh, dt, { enabled: enhanced && options.hands !== false, mirror });
    },
    reset() {
      face.reset(true);
      smoother.reset(); hands.reset();
      for (const binding of bindings.values()) binding.bone.quaternion.copy(binding.rest);
      avatar.updateWorldMatrix(true, true);
      headNeutral = null; torsoNeutral = null; shoulderNeutral = null; faceNeutral = {}; mouthNeutral = null; calibrationId = -1; lastFrame = null;
      lastFlexPose = null; flexMissingSeconds = 0;
      metrics.torsoSource = "none"; metrics.torsoTracked = false; metrics.torsoConfidence = 0;
    },
    dispose() {
      if (disposed) return;
      face.dispose();
      smoother.reset(); hands.dispose();
      for (const binding of bindings.values()) binding.bone.quaternion.copy(binding.rest);
      avatar.updateWorldMatrix(true, true);
      metrics.torsoSource = "none"; metrics.torsoTracked = false; metrics.torsoConfidence = 0;
      disposed = true;
    },
  };
}
