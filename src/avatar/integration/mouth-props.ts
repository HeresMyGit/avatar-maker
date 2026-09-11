import { Matrix4, Mesh, Object3D, PropertyBinding, Quaternion, SkinnedMesh, Vector3 } from 'three';

export interface MouthPropSample { vertex: number; weight: number }
export interface MouthPropAnchors {
  center: MouthPropSample[];
  tangentA: MouthPropSample[];
  tangentB: MouthPropSample[];
}
export interface MouthPropDefinition {
  id: string;
  bone: string;
  meshes: string[];
  referenceMouth: string;
  /** Indices refer to the final GLB mouth's original lip-stroke vertices. */
  mouths: Record<string, MouthPropAnchors>;
}
export interface MouthPropsManifest { version: 1; props: MouthPropDefinition[] }
export interface MouthPropsMetrics {
  activeProps: number;
  activeMouths: string[];
  missingObjects: string[];
  invalidSamples: string[];
}
export interface MouthPropsController {
  /** Call after face, body and spring-bone animation, before rendering. */
  update(): void;
  reset(): void;
  dispose(): void;
  readonly boundProps: readonly string[];
  readonly metrics: MouthPropsMetrics;
}

interface MouthBinding { mesh: Mesh; anchors: MouthPropAnchors }
interface PropBinding {
  definition: MouthPropDefinition;
  bone: Object3D;
  meshes: Object3D[];
  mouths: MouthBinding[];
  reference: MouthBinding;
  restPosition: Vector3;
  restQuaternion: Quaternion;
  restScale: Vector3;
  restMatrix: Matrix4;
  wasActive: boolean;
}

function visible(object: Object3D) {
  for (let current: Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

/**
 * Move rigid smoking props from their authored bitepoint by sampling the actual
 * deformed lip. A fixed reference-mouth Basis establishes the source placement;
 * selecting Flat or another material also follows that mouth's resting lip line.
 * The baseline is skinned under the CURRENT head pose, so head motion is applied
 * exactly once by the socket's existing parent. No semantic expression guessing.
 */
export function createMouthProps(avatar: Object3D, manifest?: MouthPropsManifest): MouthPropsController {
  const source = manifest ?? avatar.userData.mouthProps as MouthPropsManifest | undefined;
  if (source && source.version !== 1) throw new Error(`Unsupported mouth props manifest version: ${source.version}`);
  const missing = new Set<string>(), invalid = new Set<string>();
  const lookup = (name: string) => {
    const object = avatar.getObjectByName(name) ?? avatar.getObjectByName(PropertyBinding.sanitizeNodeName(name));
    if (!object) missing.add(name);
    return object;
  };
  const usedBones = new Set<Object3D>();
  const bindings: PropBinding[] = [];
  for (const definition of source?.props ?? []) {
    const bone = lookup(definition.bone);
    if (!bone) continue;
    if (usedBones.has(bone)) throw new Error(`Mouth prop socket is bound twice: ${definition.bone}`);
    usedBones.add(bone);
    const mouths: MouthBinding[] = [];
    for (const [name, anchors] of Object.entries(definition.mouths)) {
      const object = lookup(name);
      if (!object || !(object as Mesh).isMesh) continue;
      const mesh = object as Mesh;
      const count = mesh.geometry.getAttribute('position')?.count ?? 0;
      const normalized = {} as MouthPropAnchors;
      let valid = true;
      for (const group of ['center', 'tangentA', 'tangentB'] as const) {
        const entries = anchors[group];
        if (!entries?.length || entries.some(entry => !Number.isInteger(entry.vertex) || entry.vertex < 0 || entry.vertex >= count
          || !Number.isFinite(entry.weight) || entry.weight < 0)) { valid = false; break; }
        const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
        if (total <= 0) { valid = false; break; }
        normalized[group] = entries.map(entry => ({ vertex: entry.vertex, weight: entry.weight / total }));
      }
      if (!valid) { invalid.add(`${definition.id}/${name}`); continue; }
      mouths.push({ mesh, anchors: normalized });
    }
    const reference = mouths.find(binding => binding.mesh.name === definition.referenceMouth
      || binding.mesh.name === PropertyBinding.sanitizeNodeName(definition.referenceMouth));
    if (!reference) { invalid.add(`${definition.id}/referenceMouth`); continue; }
    const meshes = definition.meshes.map(lookup).filter((mesh): mesh is Object3D => !!mesh);
    bindings.push({ definition, bone, meshes, mouths, reference,
      restPosition: bone.position.clone(), restQuaternion: bone.quaternion.clone(), restScale: bone.scale.clone(),
      restMatrix: new Matrix4().compose(bone.position, bone.quaternion, bone.scale), wasActive: false });
  }
  const state: MouthPropsMetrics = { activeProps: 0, activeMouths: [], missingObjects: [...missing], invalidSamples: [...invalid] };
  const vertex = new Vector3(), baselineCenter = new Vector3(), deformedCenter = new Vector3();
  const baselineA = new Vector3(), baselineB = new Vector3(), deformedA = new Vector3(), deformedB = new Vector3();
  const baselineTangent = new Vector3(), deformedTangent = new Vector3(), restWorldPosition = new Vector3();
  const worldScale = new Vector3(), desiredPosition = new Vector3();
  const restWorldQuaternion = new Quaternion(), parentQuaternion = new Quaternion(), deltaQuaternion = new Quaternion();
  const desiredQuaternion = new Quaternion(), restWorldMatrix = new Matrix4(), inverseParent = new Matrix4(), identity = new Matrix4();
  let disposed = false;

  function sample(binding: MouthBinding, entries: MouthPropSample[], morphed: boolean, target: Vector3) {
    target.set(0, 0, 0);
    const mesh = binding.mesh;
    const position = mesh.geometry.getAttribute('position');
    for (const entry of entries) {
      if (morphed) mesh.getVertexPosition(entry.vertex, vertex);
      else {
        vertex.fromBufferAttribute(position, entry.vertex);
        if ((mesh as SkinnedMesh).isSkinnedMesh) (mesh as SkinnedMesh).applyBoneTransform(entry.vertex, vertex);
      }
      vertex.applyMatrix4(mesh.matrixWorld);
      target.addScaledVector(vertex, entry.weight);
    }
    return target;
  }

  function restore(binding: PropBinding) {
    binding.bone.position.copy(binding.restPosition);
    binding.bone.quaternion.copy(binding.restQuaternion);
    binding.bone.scale.copy(binding.restScale);
    binding.bone.updateWorldMatrix(true, true);
    binding.wasActive = false;
  }

  function refreshPropSkeletons() {
    const updated = new Set<SkinnedMesh['skeleton']>();
    for (const binding of bindings) for (const object of binding.meshes) {
      const mesh = object as SkinnedMesh;
      if (mesh.isSkinnedMesh && !updated.has(mesh.skeleton)) { mesh.skeleton.update(); updated.add(mesh.skeleton); }
    }
  }

  function reset() {
    if (disposed) return;
    for (const binding of bindings) restore(binding);
    refreshPropSkeletons();
    state.activeProps = 0;
    state.activeMouths = [];
  }

  function update() {
    if (disposed) return;
    state.activeProps = 0;
    state.activeMouths = [];
    // updateMatrixWorld also refreshes SkinnedMesh bindMatrixInverse in attached mode.
    avatar.updateMatrixWorld(true);
    const skeletons = new Set<SkinnedMesh['skeleton']>();
    for (const binding of bindings) for (const mouth of binding.mouths) {
      const mesh = mouth.mesh as SkinnedMesh;
      if (mesh.isSkinnedMesh && !skeletons.has(mesh.skeleton)) { mesh.skeleton.update(); skeletons.add(mesh.skeleton); }
    }
    for (const binding of bindings) {
      const selected = binding.mouths.find(mouth => visible(mouth.mesh));
      if (!selected || !binding.meshes.some(visible)) {
        if (binding.wasActive) restore(binding);
        continue;
      }
      const reference = binding.reference;
      sample(reference, reference.anchors.center, false, baselineCenter);
      sample(reference, reference.anchors.tangentA, false, baselineA);
      sample(reference, reference.anchors.tangentB, false, baselineB);
      sample(selected, selected.anchors.center, true, deformedCenter);
      sample(selected, selected.anchors.tangentA, true, deformedA);
      sample(selected, selected.anchors.tangentB, true, deformedB);
      baselineTangent.subVectors(baselineB, baselineA);
      deformedTangent.subVectors(deformedB, deformedA);
      if (![...baselineCenter.toArray(), ...deformedCenter.toArray(), ...baselineTangent.toArray(), ...deformedTangent.toArray()].every(Number.isFinite)
        || baselineTangent.lengthSq() < 1e-12 || deformedTangent.lengthSq() < 1e-12) {
        restore(binding);
        continue;
      }
      const parentWorld = binding.bone.parent?.matrixWorld ?? identity;
      restWorldMatrix.multiplyMatrices(parentWorld, binding.restMatrix);
      restWorldMatrix.decompose(restWorldPosition, restWorldQuaternion, worldScale);
      deltaQuaternion.setFromUnitVectors(baselineTangent.normalize(), deformedTangent.normalize());
      // Carry the authored bitepoint-to-lip offset with the changing lip frame.
      desiredPosition.copy(restWorldPosition).sub(baselineCenter).applyQuaternion(deltaQuaternion).add(deformedCenter);
      desiredQuaternion.copy(deltaQuaternion).multiply(restWorldQuaternion);
      inverseParent.copy(parentWorld).invert();
      binding.bone.position.copy(desiredPosition).applyMatrix4(inverseParent);
      if (binding.bone.parent) binding.bone.parent.getWorldQuaternion(parentQuaternion);
      else parentQuaternion.identity();
      binding.bone.quaternion.copy(parentQuaternion.invert()).multiply(desiredQuaternion).normalize();
      binding.bone.scale.copy(binding.restScale);
      binding.bone.updateWorldMatrix(false, true);
      binding.wasActive = true;
      state.activeProps++;
      if (!state.activeMouths.includes(selected.mesh.name)) state.activeMouths.push(selected.mesh.name);
    }
    refreshPropSkeletons();
  }

  return {
    update, reset,
    boundProps: Object.freeze(bindings.map(binding => binding.definition.id)),
    get metrics() { return { ...state, activeMouths: [...state.activeMouths], missingObjects: [...state.missingObjects], invalidSamples: [...state.invalidSamples] }; },
    dispose() { if (!disposed) { reset(); disposed = true; } },
  };
}
