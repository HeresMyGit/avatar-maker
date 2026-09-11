import type { Mesh, Object3D } from "three";
import { createMouthLipSync } from "./mouth-lipsync";

export const EYE_MESH_NAMES = [
  "eyes_normal", "eyes_metal", "eyes_mfercoin",
  "eyes_red", "eyes_alien", "eyes_zombie",
  "eyes_robot",
] as const;

export const EYE_SHAPE_KEYS = [
  "eyeBlinkLeft", "eyeBlinkRight", "eyeLookUp", "eyeLookDown",
  "eyeLookLeft", "eyeLookRight", "eyeWide",
] as const;

export type EyeMeshName = (typeof EYE_MESH_NAMES)[number];
export type EyeShapeKey = (typeof EYE_SHAPE_KEYS)[number];

const SUPPORTED_EYES = new Set<string>(EYE_MESH_NAMES);
const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const clampSigned = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;

/**
 * Attach to an individual SkeletonUtils.clone(), never the shared source/template.
 * Controls the base eye traits and robot visor; rigid glasses, patches and VR accessories are untouched.
 */
export function createEyeAnimation(avatar: Object3D, responsePerSecond = 28, allowEmpty = false) {
  const bindings: { name: EyeMeshName; influences: number[]; indices: number[] }[] = [];
  const skippedEyes: { name: EyeMeshName; missingShapeKeys: EyeShapeKey[] }[] = [];

  avatar.traverse((object) => {
    if (!SUPPORTED_EYES.has(object.name) || !(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    const name = mesh.name as EyeMeshName;
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    const missingShapeKeys = EYE_SHAPE_KEYS.filter((key) => {
      const index = dictionary?.[key];
      return !influences || index === undefined || !Number.isInteger(index)
        || index < 0 || index >= influences.length;
    });
    if (!influences || missingShapeKeys.length) {
      skippedEyes.push({ name, missingShapeKeys });
      return;
    }
    bindings.push({ name, influences, indices: EYE_SHAPE_KEYS.map((key) => dictionary![key]) });
  });

  if (!bindings.length && !allowEmpty) {
    throw new Error("This avatar has no supported eye mesh with all seven face morph targets. Load mfermashup-face-rigged.glb.");
  }

  // Smooth signed gaze before deriving directional keys, so opposite directions
  // never overlap during a left/right or up/down transition.
  const targets = new Float32Array(5); // blink left, blink right, gaze x, gaze y, wide
  const current = new Float32Array(5);
  const response = Number.isFinite(responsePerSecond) && responsePerSecond > 0 ? responsePerSecond : 28;
  let disposed = false;

  function writeCurrent() {
    const [left, right, x, y, wide] = current;
    // Suppress additive movement at the final write, after smoothing. A fully
    // closed eye therefore uses the authored blink pose without residual gaze.
    const open = 1 - Math.max(left, right);
    const gazeDivisor = Math.max(1, Math.abs(x) + Math.abs(y));
    const values = [
      left, right,
      Math.max(0, y) / gazeDivisor * open,
      Math.max(0, -y) / gazeDivisor * open,
      Math.max(0, x) / gazeDivisor * open,
      Math.max(0, -x) / gazeDivisor * open,
      wide * open,
    ];
    for (const { influences, indices } of bindings) {
      indices.forEach((index, slot) => { influences[index] = values[slot]; });
    }
  }

  function reset(immediate = false) {
    if (disposed) return;
    targets.fill(0);
    if (immediate) {
      current.fill(0);
      writeCurrent();
    }
  }

  reset(true);

  return {
    /** Includes hidden alternatives, so visibility-only trait changes inherit the pose. */
    boundEyeNames: Object.freeze(bindings.map(({ name }) => name)),
    skippedEyes: Object.freeze(skippedEyes),

    /** 0 = open neutral, 1 = closed. Left/right refer to the actor, not the viewer. */
    setBlink(left: number, right = left) {
      if (disposed) return;
      targets[0] = clamp01(left);
      targets[1] = clamp01(right);
    },

    /**
     * Signed gaze in -1..1: x positive = actor left (viewer right); y positive = up.
     * Diagonals share a total directional weight of at most one.
     */
    setGaze(x: number, y: number) {
      if (disposed) return;
      x = clampSigned(x);
      y = clampSigned(y);
      const divisor = Math.max(1, Math.abs(x) + Math.abs(y));
      targets[2] = x / divisor;
      targets[3] = y / divisor;
    },

    /** Optional shared eye widening, 0..1. Start small and inspect the expression. */
    setWide(value: number) {
      if (disposed) return;
      targets[4] = clamp01(value);
    },

    /** Call after the body mixer on every rendered frame. deltaSeconds is elapsed seconds. */
    update(deltaSeconds: number) {
      if (disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const alpha = 1 - Math.exp(-response * deltaSeconds);
      for (let index = 0; index < current.length; index++) {
        current[index] += (targets[index] - current[index]) * alpha;
        if (Math.abs(current[index] - targets[index]) < 0.0001) current[index] = targets[index];
      }
      writeCurrent();
    },

    /** Clear all eye input. Use true for immediate neutral; otherwise continue update(). */
    reset,

    dispose() {
      reset(true);
      disposed = true;
    },
  };
}

/** A single update/reset lifecycle for an avatar's mouth and eye controllers. */
export function createFaceAnimation(
  avatar: Object3D,
  options: { mouthResponsePerSecond?: number; eyeResponsePerSecond?: number; allowEmpty?: boolean } = {},
) {
  const eyes = createEyeAnimation(avatar, options.eyeResponsePerSecond, options.allowEmpty);
  let mouth: ReturnType<typeof createMouthLipSync>;
  try {
    mouth = createMouthLipSync(avatar, options.mouthResponsePerSecond, options.allowEmpty);
  } catch (error) {
    eyes.dispose();
    throw error;
  }
  let disposed = false;
  return {
    mouth,
    eyes,
    update(deltaSeconds: number) {
      if (disposed) return;
      mouth.update(deltaSeconds);
      eyes.update(deltaSeconds);
    },
    reset(immediate = false) {
      if (disposed) return;
      mouth.silence(immediate);
      eyes.reset(immediate);
    },
    dispose() {
      if (disposed) return;
      mouth.dispose();
      eyes.dispose();
      disposed = true;
    },
  };
}
