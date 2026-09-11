import { Matrix4, Mesh, Object3D, PropertyBinding, Quaternion, SkinnedMesh, Vector3 } from "three";

export interface TongueSample { vertex: number; weight: number; }
export interface TongueMouthAnchors {
  /** Attachment and left-to-right tangent on the lower interior lip. */
  center: TongueSample[];
  tangentA: TongueSample[];
  tangentB: TongueSample[];
  /** Opposing center cavity rows; their Basis separation is subtracted. */
  upper: TongueSample[];
  lower: TongueSample[];
  /** Outer lip extremes define reference width independent of actor scale. */
  widthA: TongueSample[];
  widthB: TongueSample[];
}
export interface TongueManifest {
  version: 1;
  bone: string;
  meshes: string[];
  referenceMouth: string;
  /** Complete shown-short target; Basis is retracted inside the head. */
  showShape: string;
  /** Complete extended target: tongueOut=1 alone works in generic GLB viewers. */
  extendShape: string;
  mouths: Record<string, TongueMouthAnchors>;
  /** Actual opening / reference Basis width. Keeps the tongue inside the lips. */
  aperture: { hideBelow: number; fullAbove: number; };
}
export interface TongueOptions {
  enabled: boolean;
  /** Positive manual amount overrides tracked input; zero releases to tracking. */
  out: number;
  /** Signed mouth-relative direction: positive is avatar front-view screen right. */
  x: number;
  /** Signed mouth-relative direction: positive is down. */
  y: number;
}
export interface TongueMetrics {
  active: boolean;
  activeMouth: string | null;
  /** Measured opening as a fraction of reference-mouth rest width. */
  aperture: number;
  out: number;
  requestedOut: number;
  x: number;
  y: number;
  requestedX: number;
  requestedY: number;
  missingObjects: string[];
  invalidSamples: string[];
}
export interface TongueController {
  setOptions(options: Partial<TongueOptions>): void;
  /** Call after face, body, physics and mouth props, before rendering. */
  update(deltaSeconds?: number, trackedOut?: number): void;
  reset(): void;
  dispose(): void;
  readonly boundMeshes: readonly string[];
  readonly metrics: TongueMetrics;
}

const clamp = (v: number) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
const signedClamp = (v: number) => Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0;
const smoothstep = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / Math.max(.000001, b - a)); return t * t * (3 - 2 * t);
};
const groups = ["center", "tangentA", "tangentB", "upper", "lower", "widthA", "widthB"] as const;
interface MouthBinding { mesh: Mesh; anchors: TongueMouthAnchors; }
interface TongueMeshBinding { mesh: Mesh; index: number; showIndex: number; }
function visible(object: Object3D) {
  for (let current: Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

/**
 * Attach the authored tongue to actual deformed lips. No jaw/viseme reconstruction:
 * lower-lip samples carry translation and slant, while a measured cavity opening
 * gates protrusion. Parent/head motion is sampled under the current pose once.
 * Bind one SkeletonUtils.clone() per controller, never the cached source avatar.
 */
export function createTongue(avatar: Object3D, manifest?: TongueManifest): TongueController {
  const source = manifest ?? avatar.userData.tongue as TongueManifest | undefined;
  if (source && source.version !== 1) throw new Error(`Unsupported tongue manifest version: ${source.version}`);
  const missing = new Set<string>(), invalid = new Set<string>();
  const lookup = (name: string) => {
    const object = avatar.getObjectByName(name) ?? avatar.getObjectByName(PropertyBinding.sanitizeNodeName(name));
    if (!object) missing.add(name); return object;
  };
  const bone = source ? lookup(source.bone) : undefined;
  const tongues: TongueMeshBinding[] = [];
  for (const name of source?.meshes ?? []) {
    const object = lookup(name);
    if (!object || !(object as Mesh).isMesh) continue;
    const mesh = object as Mesh, index = mesh.morphTargetDictionary?.[source!.extendShape], showIndex = mesh.morphTargetDictionary?.[source!.showShape];
    if (!mesh.morphTargetInfluences || [index, showIndex].some(i => i === undefined || !Number.isInteger(i) || i < 0 || i >= mesh.morphTargetInfluences!.length)) {
      invalid.add(`${name}/tongueMorphs`); mesh.visible = false; continue;
    }
    tongues.push({ mesh, index: index!, showIndex: showIndex! });
  }
  const mouths: MouthBinding[] = [];
  for (const [name, definition] of Object.entries(source?.mouths ?? {})) {
    const object = lookup(name); if (!object || !(object as Mesh).isMesh) continue;
    const mesh = object as Mesh, count = mesh.geometry.getAttribute("position")?.count ?? 0;
    const anchors = {} as TongueMouthAnchors;
    let valid = true;
    for (const group of groups) {
      const samples = definition[group];
      if (!samples?.length || samples.some(s => !Number.isInteger(s.vertex) || s.vertex < 0 || s.vertex >= count || !Number.isFinite(s.weight) || s.weight < 0)) { valid = false; break; }
      const total = samples.reduce((sum, s) => sum + s.weight, 0);
      if (!(total > 0)) { valid = false; break; }
      anchors[group] = samples.map(s => ({ vertex: s.vertex, weight: s.weight / total }));
    }
    if (valid) mouths.push({ mesh, anchors }); else invalid.add(name);
  }
  const reference = mouths.find(m => m.mesh.name === source?.referenceMouth || m.mesh.name === PropertyBinding.sanitizeNodeName(source?.referenceMouth ?? ""));
  if (source && !reference) invalid.add("referenceMouth");
  const aperture = source?.aperture;
  const validEnvelope = !!aperture && Number.isFinite(aperture.hideBelow) && Number.isFinite(aperture.fullAbove)
    && aperture.hideBelow >= 0 && aperture.fullAbove > aperture.hideBelow;
  if (source && !validEnvelope) invalid.add("aperture");
  const restPosition = bone?.position.clone() ?? new Vector3(), restQuaternion = bone?.quaternion.clone() ?? new Quaternion();
  const restScale = bone?.scale.clone() ?? new Vector3(1, 1, 1);
  const restMatrix = new Matrix4().compose(restPosition, restQuaternion, restScale);
  const options: TongueOptions = { enabled: true, out: 0, x: 0, y: 0 };
  const state: TongueMetrics = { active: false, activeMouth: null, aperture: 0, out: 0, requestedOut: 0,
    x: 0, y: 0, requestedX: 0, requestedY: 0, missingObjects: [...missing], invalidSamples: [...invalid] };
  const point = new Vector3(), baseCenter = new Vector3(), actualCenter = new Vector3();
  const baseA = new Vector3(), baseB = new Vector3(), actualA = new Vector3(), actualB = new Vector3();
  const upper = new Vector3(), lower = new Vector3(), basisUpper = new Vector3(), basisLower = new Vector3();
  const widthA = new Vector3(), widthB = new Vector3(), baseTangent = new Vector3(), actualTangent = new Vector3();
  const restWorldPosition = new Vector3(), restWorldQuaternion = new Quaternion(), restWorldScale = new Vector3();
  const desiredPosition = new Vector3(), delta = new Quaternion(), parentQuaternion = new Quaternion();
  const yaw = new Quaternion(), pitch = new Quaternion(), localDown = new Vector3(0, 0, 1), localRight = new Vector3(1, 0, 0);
  const restWorldMatrix = new Matrix4(), inverseParent = new Matrix4(), identity = new Matrix4();
  let currentOut = 0, currentX = 0, currentY = 0, active = false, disposed = false;

  function sample(binding: MouthBinding, entries: TongueSample[], morphed: boolean, result: Vector3) {
    result.set(0, 0, 0);
    const mesh = binding.mesh, position = mesh.geometry.getAttribute("position");
    for (const entry of entries) {
      if (morphed) mesh.getVertexPosition(entry.vertex, point);
      else {
        point.fromBufferAttribute(position, entry.vertex);
        if ((mesh as SkinnedMesh).isSkinnedMesh) (mesh as SkinnedMesh).applyBoneTransform(entry.vertex, point);
      }
      result.addScaledVector(point.applyMatrix4(mesh.matrixWorld), entry.weight);
    }
    return result;
  }
  function refreshSkeletons() {
    const skeletons = new Set<SkinnedMesh["skeleton"]>();
    for (const { mesh } of tongues) if ((mesh as SkinnedMesh).isSkinnedMesh) skeletons.add((mesh as SkinnedMesh).skeleton);
    for (const skeleton of skeletons) skeleton.update();
  }
  function hide() {
    for (const { mesh, index, showIndex } of tongues) { mesh.visible = false; mesh.morphTargetInfluences![index] = 0; mesh.morphTargetInfluences![showIndex] = 0; }
    currentOut = 0; currentX = 0; currentY = 0; state.active = false; state.out = 0; state.x = 0; state.y = 0;
    if (bone && active) {
      bone.position.copy(restPosition); bone.quaternion.copy(restQuaternion); bone.scale.copy(restScale);
      bone.updateWorldMatrix(true, true); refreshSkeletons();
    }
    active = false;
  }
  function reset() {
    if (disposed) return;
    hide(); options.out = 0; options.x = 0; options.y = 0; state.activeMouth = null; state.aperture = 0;
    state.requestedOut = 0; state.requestedX = 0; state.requestedY = 0;
  }
  reset();

  return {
    boundMeshes: Object.freeze(tongues.map(t => t.mesh.name)),
    get metrics() { return { ...state, missingObjects: [...state.missingObjects], invalidSamples: [...state.invalidSamples] }; },
    setOptions(next) {
      if (disposed) return;
      if (typeof next.enabled === "boolean") options.enabled = next.enabled;
      if (next.out !== undefined) options.out = clamp(next.out);
      if (next.x !== undefined) options.x = signedClamp(next.x);
      if (next.y !== undefined) options.y = signedClamp(next.y);
      if (!options.enabled) { hide(); state.activeMouth = null; state.aperture = 0; state.requestedOut = 0; state.requestedX = 0; state.requestedY = 0; }
    },
    update(deltaSeconds = 1 / 60, trackedOut = 0) {
      if (disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      state.activeMouth = null; state.aperture = 0;
      state.requestedOut = options.enabled ? options.out > 0 ? options.out : clamp(trackedOut) : 0;
      state.requestedX = state.requestedOut > 0 ? options.x : 0; state.requestedY = state.requestedOut > 0 ? options.y : 0;
      if (!options.enabled || !bone || !reference || !validEnvelope || !tongues.length) { hide(); return; }
      const selected = mouths.find(m => visible(m.mesh));
      if (!selected) { hide(); return; }
      state.activeMouth = selected.mesh.name;
      // Attached SkinnedMesh requires updateMatrixWorld to refresh bindMatrixInverse.
      avatar.updateMatrixWorld(true);
      const skeletons = new Set<SkinnedMesh["skeleton"]>();
      for (const binding of [selected, reference]) if ((binding.mesh as SkinnedMesh).isSkinnedMesh) skeletons.add((binding.mesh as SkinnedMesh).skeleton);
      for (const skeleton of skeletons) skeleton.update();
      sample(reference, reference.anchors.widthA, false, widthA); sample(reference, reference.anchors.widthB, false, widthB);
      sample(selected, selected.anchors.upper, true, upper); sample(selected, selected.anchors.lower, true, lower);
      sample(selected, selected.anchors.upper, false, basisUpper); sample(selected, selected.anchors.lower, false, basisLower);
      const width = widthA.distanceTo(widthB), gap = Math.max(0, upper.distanceTo(lower) - basisUpper.distanceTo(basisLower));
      state.aperture = width > 1e-8 ? gap / width : 0;
      // A jaw opening is never a tongue request. Retract immediately on tracking
      // loss as well as lip closure; smoothing must not leave a false protrusion.
      if (!Number.isFinite(state.aperture) || state.aperture <= aperture!.hideBelow || state.requestedOut <= 0) {
        state.aperture = Number.isFinite(state.aperture) ? state.aperture : 0; hide(); return;
      }
      sample(reference, reference.anchors.center, false, baseCenter);
      sample(reference, reference.anchors.tangentA, false, baseA); sample(reference, reference.anchors.tangentB, false, baseB);
      sample(selected, selected.anchors.center, true, actualCenter);
      sample(selected, selected.anchors.tangentA, true, actualA); sample(selected, selected.anchors.tangentB, true, actualB);
      baseTangent.subVectors(baseB, baseA); actualTangent.subVectors(actualB, actualA);
      if (![...baseCenter.toArray(), ...actualCenter.toArray(), ...baseTangent.toArray(), ...actualTangent.toArray()].every(Number.isFinite)
        || baseTangent.lengthSq() < 1e-12 || actualTangent.lengthSq() < 1e-12) { hide(); return; }
      const parentWorld = bone.parent?.matrixWorld ?? identity;
      restWorldMatrix.multiplyMatrices(parentWorld, restMatrix).decompose(restWorldPosition, restWorldQuaternion, restWorldScale);
      delta.setFromUnitVectors(baseTangent.normalize(), actualTangent.normalize());
      desiredPosition.copy(restWorldPosition).sub(baseCenter).applyQuaternion(delta).add(actualCenter);
      inverseParent.copy(parentWorld).invert(); bone.position.copy(desiredPosition).applyMatrix4(inverseParent);
      if (bone.parent) bone.parent.getWorldQuaternion(parentQuaternion); else parentQuaternion.identity();
      const response = 1 - Math.exp(-24 * Math.min(deltaSeconds, .1));
      currentOut += (state.requestedOut - currentOut) * response;
      currentX += (state.requestedX - currentX) * response; currentY += (state.requestedY - currentY) * response;
      // Authored socket axes: +X is front-view right, +Y forward, +Z down.
      // Rotate at the lower-lip root; translation/scaling would detach the tongue.
      yaw.setFromAxisAngle(localDown, -.55 * currentX); pitch.setFromAxisAngle(localRight, .5 * currentY);
      bone.quaternion.copy(parentQuaternion.invert()).multiply(delta).multiply(restWorldQuaternion).multiply(yaw).multiply(pitch).normalize(); bone.scale.copy(restScale);
      bone.updateWorldMatrix(false, true); active = true;
      const room = smoothstep(aperture!.hideBelow, aperture!.fullAbove, state.aperture);
      // Both are complete targets relative to hidden Basis. A convex blend keeps
      // them from stacking. The short target appears only during an explicit
      // extension, with a fade-in so a tiny request cannot reveal a full tongue.
      const extended = currentOut * room, shown = smoothstep(0, .12, currentOut) * (1 - currentOut) * room;
      for (const { mesh, index, showIndex } of tongues) { mesh.visible = true; mesh.morphTargetInfluences![index] = extended; mesh.morphTargetInfluences![showIndex] = shown; }
      refreshSkeletons(); state.active = true; state.out = extended; state.x = currentX; state.y = currentY;
    },
    reset,
    dispose() { if (!disposed) { reset(); disposed = true; } },
  };
}
