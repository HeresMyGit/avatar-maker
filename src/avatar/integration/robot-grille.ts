import type { Material, Mesh, MeshStandardMaterial, Object3D, Texture } from 'three';
import { normalizeMouthFlexPose, type MouthFlexPose } from './mouth-lipsync';

export const ROBOT_GRILLE_KEYS = ['robotGrillePulse', 'robotGrilleRipple', 'robotGrilleCounter', 'robotGrilleOpen'] as const;
export const ROBOT_GRILLE_EXPRESSIVE_KEYS = ['robotCornerUpLeft', 'robotCornerUpRight', 'robotCornerDownLeft', 'robotCornerDownRight',
  'robotShiftLeft', 'robotShiftRight', 'robotStretchLeft', 'robotStretchRight', 'robotNarrow'] as const;
export type RobotGrilleExpressiveKey = (typeof ROBOT_GRILLE_EXPRESSIVE_KEYS)[number];
export type RobotGrilleMode = 'speaker' | 'ripple' | 'off';
export type RobotGrilleArticulation = 'mechanical' | 'expressive';
export interface RobotGrilleOptions { mode?: RobotGrilleMode; strength?: number; articulation?: RobotGrilleArticulation }
export interface RobotGrilleMetrics {
  bound: boolean;
  active: boolean;
  mode: RobotGrilleMode;
  articulation: RobotGrilleArticulation;
  expressiveBound: boolean;
  strength: number;
  drive: number;
  envelope: number;
  requestedOpen: number;
  open: number;
  phase: number;
  emissionLevel: number;
  weights: Record<(typeof ROBOT_GRILLE_KEYS)[number], number>;
  expressiveWeights: Record<RobotGrilleExpressiveKey, number>;
  missingShapeKeys: string[];
  missingExpressiveShapeKeys: string[];
}

const clamp01 = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const TAU = Math.PI * 2;
const RELEASE_SECONDS = .18;
const OPEN_RELEASE_SECONDS = .14;
const EXPRESSION_RELEASE_SECONDS = .16;
type EmissionState = { material: MeshStandardMaterial; r: number; g: number; b: number;
  intensity: number; map: Texture | null; surfaceMap: Texture | null };

/** Reuse the human tracking envelope on the robot's original checker surface.
 * Opening is applied separately by robotGrilleOpen; no human lip targets are used.
 * The nine expression weights sum to at most 3.3625. A corner's opposite signed
 * targets are exclusive, narrow excludes stretch, and width reduces corner/shift
 * travel. Smoothing normalized maps preserves this bounded additive envelope.
 */
export function normalizeRobotGrillePose(pose: Partial<MouthFlexPose> = {}): Record<RobotGrilleExpressiveKey, number> {
  const flex = normalizeMouthFlexPose(pose);
  return Object.fromEntries(ROBOT_GRILLE_EXPRESSIVE_KEYS.map(key => [key,
    flex[key.replace(/^robot/, 'mouth') as keyof typeof flex]])) as Record<RobotGrilleExpressiveKey, number>;
}

/** A mechanical grille driven by independent voice and camera-mouth signals.
 * The fourth morph separates the existing checker rows; it does not add lips.
 * Bind to one avatar instance, after cloning its skeleton, not a cached asset.
 */
export function createRobotGrille(avatar: Object3D) {
  const candidate = avatar.getObjectByName('mouth_robot') as Mesh | undefined;
  const mesh = candidate?.isMesh ? candidate : undefined;
  const indices = ROBOT_GRILLE_KEYS.map(key => mesh?.morphTargetDictionary?.[key]);
  const missingShapeKeys = ROBOT_GRILLE_KEYS.filter((_, i) => {
    const index = indices[i];
    return !mesh?.morphTargetInfluences || !Number.isInteger(index) || index! < 0
      || index! >= mesh.morphTargetInfluences.length;
  });
  const bound = !!mesh && missingShapeKeys.length === 0 && new Set(indices).size === ROBOT_GRILLE_KEYS.length;
  const expressiveIndices = ROBOT_GRILLE_EXPRESSIVE_KEYS.map(key => mesh?.morphTargetDictionary?.[key]);
  const missingExpressiveShapeKeys = ROBOT_GRILLE_EXPRESSIVE_KEYS.filter((_, i) => {
    const index = expressiveIndices[i];
    return !mesh?.morphTargetInfluences || !Number.isInteger(index) || index! < 0
      || index! >= mesh.morphTargetInfluences.length || indices.includes(index)
      || expressiveIndices.indexOf(index) !== i;
  });
  const expressiveBound = bound && missingExpressiveShapeKeys.length === 0;
  const metrics: RobotGrilleMetrics = { bound, expressiveBound, active: false, mode: 'speaker', articulation: 'expressive', strength: 1,
    drive: 0, envelope: 0, requestedOpen: 0, open: 0, phase: 0, emissionLevel: 0,
    weights: { robotGrillePulse: 0, robotGrilleRipple: 0, robotGrilleCounter: 0, robotGrilleOpen: 0 },
    expressiveWeights: normalizeRobotGrillePose(), missingShapeKeys: [...missingShapeKeys],
    missingExpressiveShapeKeys: [...missingExpressiveShapeKeys] };
  let disposed = false, quietSeconds = 0, closedSeconds = 0, neutralSeconds = 0;
  const originalMaterial = mesh?.material;
  const clones: Material[] = [];
  const emissions: EmissionState[] = [];
  let instanceMaterial: Material | Material[] | undefined;
  if (bound && mesh) {
    const cloneMaterial = (source: Material) => {
      const material = source.clone(); clones.push(material);
      if ((material as MeshStandardMaterial).isMeshStandardMaterial) {
        const lit = material as MeshStandardMaterial;
        emissions.push({ material: lit, r: lit.emissive.r, g: lit.emissive.g, b: lit.emissive.b,
          intensity: lit.emissiveIntensity, map: lit.emissiveMap, surfaceMap: lit.map });
      }
      return material;
    };
    instanceMaterial = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
    mesh.material = instanceMaterial;
  }

  function writeWeights(pulse: number, ripple: number, counter: number, open = metrics.open) {
    const values = [pulse, ripple, counter, open];
    ROBOT_GRILLE_KEYS.forEach((key, i) => {
      metrics.weights[key] = values[i];
      if (bound) mesh!.morphTargetInfluences![indices[i]!] = values[i];
    });
  }
  function writeExpression(values: Record<RobotGrilleExpressiveKey, number>) {
    ROBOT_GRILLE_EXPRESSIVE_KEYS.forEach((key, i) => {
      metrics.expressiveWeights[key] = values[key];
      const index = expressiveIndices[i];
      if (bound && Number.isInteger(index) && index! >= 0 && index! < mesh!.morphTargetInfluences!.length
        && !indices.includes(index)) mesh!.morphTargetInfluences![index!] = values[key];
    });
  }
  function clearExpression() { neutralSeconds = 0; writeExpression(normalizeRobotGrillePose()); }
  function faceActive() { return metrics.open > 0 || Object.values(metrics.expressiveWeights).some(value => value > 0); }
  function updateExpression(step: number, pose?: Partial<MouthFlexPose>) {
    if (!expressiveBound || metrics.articulation !== 'expressive') { clearExpression(); return; }
    const target = normalizeRobotGrillePose(pose);
    const neutral = Object.values(target).every(value => value === 0);
    neutralSeconds = neutral ? neutralSeconds + step : 0;
    if (neutral && neutralSeconds >= EXPRESSION_RELEASE_SECONDS) { writeExpression(target); return; }
    const alpha = 1 - Math.exp(-30 * step);
    writeExpression(Object.fromEntries(ROBOT_GRILLE_EXPRESSIVE_KEYS.map(key => {
      const value = metrics.expressiveWeights[key] + (target[key] - metrics.expressiveWeights[key]) * alpha;
      return [key, target[key] === 0 && value < .0001 ? 0 : value];
    })) as Record<RobotGrilleExpressiveKey, number>);
  }
  function writeEmission(amount: number) {
    metrics.emissionLevel = amount;
    for (const state of emissions) {
      if (amount > 0) {
        // The base-color map masks this faint cyan addition to the white checks.
        // Use the slow voice envelope, not the fast diaphragm phase, for glow.
        state.material.emissive.setRGB(state.r + .018 * amount, state.g + .065 * amount, state.b + .09 * amount);
        state.material.emissiveIntensity = Math.max(1, state.intensity);
        state.material.emissiveMap = state.surfaceMap ?? state.map;
      } else {
        state.material.emissive.setRGB(state.r, state.g, state.b);
        state.material.emissiveIntensity = state.intensity;
        state.material.emissiveMap = state.map;
      }
      // Switching between an absent/present emissive map changes shader defines.
      const usesMap = !!state.material.emissiveMap;
      if (state.material.userData.robotGrilleUsesEmissionMap !== usesMap) {
        state.material.userData.robotGrilleUsesEmissionMap = usesMap;
        state.material.needsUpdate = true;
      }
    }
  }
  function reset() {
    if (disposed) return;
    quietSeconds = 0; closedSeconds = 0;
    metrics.active = false; metrics.drive = 0; metrics.envelope = 0; metrics.phase = 0;
    metrics.requestedOpen = 0; metrics.open = 0;
    writeWeights(0, 0, 0, 0); clearExpression(); writeEmission(0);
  }
  function stopVibration() {
    quietSeconds = 0; metrics.drive = 0; metrics.envelope = 0; metrics.phase = 0;
    writeWeights(0, 0, 0); writeEmission(0); metrics.active = faceActive();
  }
  function setOptions(options: RobotGrilleOptions = {}) {
    if (disposed) return;
    const before = metrics.mode;
    if (options.mode !== undefined) metrics.mode = ['speaker', 'ripple', 'off'].includes(options.mode) ? options.mode : 'off';
    if (options.strength !== undefined) metrics.strength = Number.isFinite(options.strength) ? Math.max(0, Math.min(2, options.strength)) : 0;
    if (options.articulation !== undefined) {
      const articulation = options.articulation === 'expressive' ? 'expressive' : 'mechanical';
      if (articulation !== metrics.articulation) { clearExpression(); metrics.articulation = articulation; }
      metrics.active = metrics.envelope > 0 || faceActive();
    }
    if (metrics.mode === 'off') reset();
    else if (metrics.mode !== before || metrics.strength === 0) stopVibration();
  }
  function visible() {
    for (let object: Object3D | null | undefined = mesh; object; object = object.parent) if (!object.visible) return false;
    return true;
  }
  function update(dt: number, drive: number, open = 0, pose?: Partial<MouthFlexPose>) {
    if (disposed) return;
    if (!bound || metrics.mode === 'off' || !visible()) { reset(); return; }
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = dt;
    metrics.requestedOpen = clamp01(open);
    closedSeconds = metrics.requestedOpen === 0 ? closedSeconds + step : 0;
    const openResponse = metrics.requestedOpen > metrics.open ? 48 : 36;
    metrics.open += (metrics.requestedOpen - metrics.open) * (1 - Math.exp(-openResponse * step));
    if (metrics.requestedOpen === 0 && (closedSeconds >= OPEN_RELEASE_SECONDS || metrics.open < .0001)) metrics.open = 0;
    updateExpression(step, pose);
    // The strength slider controls vibration only. A silent held-open mouth
    // still separates the rows, and fresh closure/lost camera data closes them.
    if (metrics.strength === 0) { stopVibration(); return; }
    const raw = clamp01(drive), signal = raw < .015 ? 0 : raw;
    metrics.drive = signal;
    quietSeconds = signal === 0 ? quietSeconds + step : 0;
    const response = signal > metrics.envelope ? 50 : 28;
    metrics.envelope += (signal - metrics.envelope) * (1 - Math.exp(-response * step));
    if (signal === 0 && (quietSeconds >= RELEASE_SECONDS || metrics.envelope < .0001)) { stopVibration(); return; }
    const frequency = metrics.mode === 'speaker' ? 7 : 6;
    // Advance with real elapsed time, including slow frames. Reduce before
    // multiplication so even an unusually large finite dt remains finite.
    metrics.phase = (metrics.phase + (step % (1 / frequency)) * TAU * frequency) % TAU;
    // Normal voice drive uses a visible part of the authored deformation range:
    // a .3 envelope reaches about .59 amplitude at the default strength.
    const amplitude = clamp01(Math.pow(metrics.envelope, .55) * metrics.strength * 1.15) * (1 - .35 * metrics.open);
    // Hold nearer each alternating checker pose, with a smooth short transition.
    // A weak shared pulse leaves the opposing checker movement easy to see.
    const wave = .5 + .5 * Math.tanh(2 * Math.sin(metrics.phase)) / Math.tanh(2);
    if (metrics.mode === 'speaker') writeWeights(amplitude * wave, 0, 0);
    else writeWeights(amplitude * .04, amplitude * .96 * wave, amplitude * .96 * (1 - wave));
    metrics.active = amplitude > 0 || faceActive();
    writeEmission(amplitude);
  }
  function dispose() {
    if (disposed) return;
    reset();
    if (mesh && instanceMaterial && mesh.material === instanceMaterial && originalMaterial) mesh.material = originalMaterial;
    for (const material of clones) material.dispose();
    disposed = true;
  }
  reset();
  return { setOptions, update, reset, dispose, metrics };
}
