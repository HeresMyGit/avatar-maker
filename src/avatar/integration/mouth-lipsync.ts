import type { Mesh, Object3D } from "three";

export const MOUTH_MESH_NAMES = [
  "mouth_smile", "mouth_flat",
  "mouth_smile_metal", "mouth_flat_metal",
  "mouth_smile_mfercoin", "mouth_flat_mfercoin",
] as const;

export const MOUTH_SHAPE_KEYS = [
  "jawOpen", "mouthWide", "mouthFunnel", "mouthPucker",
  "viseme_aa", "viseme_E", "viseme_ih", "viseme_oh", "viseme_ou",
] as const;

/** Optional flexible-face targets; the original nine speech keys remain compatible. */
export const MOUTH_FLEX_SHAPE_KEYS = [
  "mouthCornerUpLeft", "mouthCornerUpRight", "mouthCornerDownLeft", "mouthCornerDownRight",
  "mouthStraighten", "mouthShiftLeft", "mouthShiftRight",
  "mouthStretchLeft", "mouthStretchRight", "mouthOpenExtra", "mouthNarrow",
] as const;

export type MouthFlexShapeKey = (typeof MOUTH_FLEX_SHAPE_KEYS)[number];
export interface MouthFlexPose {
  open: number;
  narrow: number;
  /** Anatomical actor sides; positive raises the corner, negative lowers it. */
  cornerLeft: number;
  cornerRight: number;
  /** Positive moves toward actor-left (+local X). */
  shift: number;
  stretchLeft: number;
  stretchRight: number;
}

export type MouthMeshName = (typeof MOUTH_MESH_NAMES)[number];
export type MouthShapeKey = (typeof MOUTH_SHAPE_KEYS)[number];
export type MouthViseme = Extract<MouthShapeKey, `viseme_${string}`>;
export type MouthArticulation = "mouthWide" | "mouthFunnel" | "mouthPucker";

const SUPPORTED_NAMES = new Set<string>(MOUTH_MESH_NAMES);
const VISEMES = MOUTH_SHAPE_KEYS.filter((name): name is MouthViseme => name.startsWith("viseme_"));
const ARTICULATION: MouthArticulation[] = ["mouthWide", "mouthFunnel", "mouthPucker"];
const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const signed = (value: number | undefined, limit = 1) => Number.isFinite(value) ? Math.min(limit, Math.max(-limit, value!)) : 0;
const FLEX_INPUTS = ["open", "narrow", "cornerLeft", "cornerRight", "shift", "stretchLeft", "stretchRight"] as const;

function flexInput(pose: Partial<MouthFlexPose>): MouthFlexPose {
  const narrow = clamp01(pose.narrow ?? 0);
  const left = narrow > 0 ? 0 : clamp01(pose.stretchLeft ?? 0);
  const right = narrow > 0 ? 0 : clamp01(pose.stretchRight ?? 0);
  return {
    open: clamp01(pose.open ?? 0), narrow,
    cornerLeft: signed(pose.cornerLeft), cornerRight: signed(pose.cornerRight), shift: signed(pose.shift, .65),
    stretchLeft: left, stretchRight: right,
  };
}

/**
 * Safe envelope shared by live tracking and manual previews. These dedicated
 * effects are authored relative to mouthStraighten=1; all nine legacy keys must
 * be zero while applying this map. Do not normalize this map as a viseme mix.
 */
export function normalizeMouthFlexPose(input: Partial<MouthFlexPose>): Record<MouthFlexShapeKey, number> {
  const pose = flexInput(input);
  const wide = Math.max(pose.stretchLeft, pose.stretchRight);
  const cornerScale = (1 - .5 * pose.narrow) * (1 - .4 * wide);
  const shift = signed(pose.shift, .65 * (1 - .75 * wide));
  return {
    mouthStraighten: 1, mouthOpenExtra: pose.open, mouthNarrow: pose.narrow,
    mouthCornerUpLeft: Math.max(0, pose.cornerLeft) * cornerScale,
    mouthCornerDownLeft: Math.max(0, -pose.cornerLeft) * cornerScale,
    mouthCornerUpRight: Math.max(0, pose.cornerRight) * cornerScale,
    mouthCornerDownRight: Math.max(0, -pose.cornerRight) * cornerScale,
    mouthShiftLeft: Math.max(0, shift), mouthShiftRight: Math.max(0, -shift),
    mouthStretchLeft: pose.stretchLeft, mouthStretchRight: pose.stretchRight,
  };
}

/**
 * Attach to one avatar instance after SkeletonUtils.clone(), never the cached source scene.
 * Bind every supported, fully rigged mouth, including hidden trait alternatives, so a
 * visibility-only trait switch immediately shows the current speech pose.
 */
export function createMouthLipSync(avatar: Object3D, responsePerSecond = 18, allowEmpty = false) {
  const bindings: { name: MouthMeshName; influences: number[]; indices: number[]; flexIndices: number[]; flexComplete: boolean }[] = [];
  const skippedMouths: { name: MouthMeshName; missingShapeKeys: MouthShapeKey[] }[] = [];

  avatar.traverse((object) => {
    if (!SUPPORTED_NAMES.has(object.name) || !(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    const name = mesh.name as MouthMeshName;
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    const missingShapeKeys = MOUTH_SHAPE_KEYS.filter((key) => {
      const index = dictionary?.[key];
      return !influences || index === undefined || !Number.isInteger(index)
        || index < 0 || index >= influences.length;
    });
    // Older trait banks can contain the rigged smile alongside unrigged alternatives.
    // Leave incomplete meshes untouched; report them so the caller can inspect coverage.
    if (!influences || missingShapeKeys.length) {
      skippedMouths.push({ name, missingShapeKeys });
      return;
    }
    const flexIndices = MOUTH_FLEX_SHAPE_KEYS.map(key => {
      const index = dictionary?.[key];
      return Number.isInteger(index) && index! >= 0 && index! < influences.length ? index! : -1;
    });
    bindings.push({ name, influences, indices: MOUTH_SHAPE_KEYS.map((key) => dictionary![key]), flexIndices, flexComplete: flexIndices.every(index => index >= 0) });
  });

  if (!bindings.length && !allowEmpty) {
    throw new Error("This avatar has no supported mouth with all nine speech morph targets. Load mfermashup-mouths-rigged.glb.");
  }

  const targets = new Float32Array(MOUTH_SHAPE_KEYS.length);
  const current = new Float32Array(MOUTH_SHAPE_KEYS.length);
  const flexTargets = new Float32Array(FLEX_INPUTS.length);
  const flexCurrent = new Float32Array(FLEX_INPUTS.length);
  const response = Number.isFinite(responsePerSecond) && responsePerSecond > 0 ? responsePerSecond : 18;
  let disposed = false;
  let mode: "amplitude" | "visemes" | "flex" | null = null;

  function setTarget(name: MouthShapeKey, value: number) {
    targets[MOUTH_SHAPE_KEYS.indexOf(name)] = clamp01(value);
  }

  function writeCurrent() {
    const flexWeights = mode === "flex" ? normalizeMouthFlexPose(Object.fromEntries(FLEX_INPUTS.map((key, i) => [key, flexCurrent[i]]))) : null;
    for (const { influences, indices, flexIndices, flexComplete } of bindings) {
      indices.forEach((index, slot) => { influences[index] = current[slot]; });
      flexIndices.forEach((index, slot) => {
        if (index >= 0) influences[index] = flexComplete && flexWeights ? flexWeights[MOUTH_FLEX_SHAPE_KEYS[slot]] : 0;
      });
    }
  }

  function beginMode(nextMode: "amplitude" | "visemes" | "flex") {
    if (mode !== nextMode) {
      // Open visemes already contain their opening: never blend a leftover jawOpen into them.
      current.fill(0);
      flexCurrent.fill(0);
      mode = nextMode;
      writeCurrent();
    }
    targets.fill(0);
    flexTargets.fill(0);
  }

  function silence(immediate = false) {
    targets.fill(0);
    flexTargets.fill(0);
    // Silence means each authored trait's Basis, including its original smile.
    if (mode === "flex") {
      mode = null;
      flexCurrent.fill(0);
      writeCurrent();
    }
    if (immediate) {
      current.fill(0);
      flexCurrent.fill(0);
      writeCurrent();
    }
  }

  // Restore each trait's own neutral Basis, also clearing any saved preview pose.
  silence(true);

  return {
    /** Coverage is captured when the controller is created; hidden rigged traits are included. */
    boundMouthNames: Object.freeze(bindings.map(({ name }) => name)),
    boundFlexMouthNames: Object.freeze(bindings.filter(binding => binding.flexComplete).map(({ name }) => name)),
    skippedMouths: Object.freeze(skippedMouths),

    /** Audio-amplitude mode: jawOpen only. Scale your input to 0..1 before calling. */
    setAmplitude(value: number) {
      if (disposed) return;
      beginMode("amplitude");
      setTarget("jawOpen", value);
    },

    /** Viseme mode: clears jawOpen and normalizes the supplied visemes to a total <= 1. */
    setVisemes(weights: Partial<Record<MouthViseme, number>>) {
      if (disposed) return;
      beginMode("visemes");
      const values = VISEMES.map((name) => clamp01(weights[name] ?? 0));
      const divisor = Math.max(1, values.reduce((sum, value) => sum + value, 0));
      VISEMES.forEach((name, index) => setTarget(name, values[index] / divisor));
    },

    /**
     * Camera-driven straight-neutral face with independent corners. Returns false
     * on legacy-only assets. Legacy speech and flexible targets never overlap.
     */
    setFlex(pose: Partial<MouthFlexPose>) {
      if (disposed || !bindings.some(binding => binding.flexComplete)) return false;
      beginMode("flex");
      const values = flexInput(pose);
      FLEX_INPUTS.forEach((key, index) => { flexTargets[index] = values[key]; });
      return true;
    },

    /**
     * Optional additive adjustments, not corrective shapes. Start around 0.05–0.15, use
     * one adjustment at a time, and inspect the result. Leave all at zero by default.
     * Call after setAmplitude/setVisemes for that frame; do not stack funnel and pucker.
     */
    setArticulation(weights: Partial<Record<MouthArticulation, number>>) {
      if (disposed || mode === "flex") return;
      ARTICULATION.forEach((name) => setTarget(name, weights[name] ?? 0));
    },

    /** Call once per rendered frame, after body animation; deltaSeconds is elapsed seconds. */
    update(deltaSeconds: number) {
      if (disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const alpha = 1 - Math.exp(-response * deltaSeconds);
      for (let index = 0; index < current.length; index++) {
        current[index] += (targets[index] - current[index]) * alpha;
        if (Math.abs(current[index] - targets[index]) < 0.0001) current[index] = targets[index];
      }
      for (let index = 0; index < flexCurrent.length; index++) {
        flexCurrent[index] += (flexTargets[index] - flexCurrent[index]) * alpha;
        if (Math.abs(flexCurrent[index] - flexTargets[index]) < .0001) flexCurrent[index] = flexTargets[index];
      }
      writeCurrent();
    },

    /** Return to each trait's neutral mouth. Use true for immediate reset; else keep updating. */
    silence,

    /** Clear controlled weights when replacing/removing this avatar or its controller. */
    dispose() {
      silence(true);
      disposed = true;
    },
  };
}
