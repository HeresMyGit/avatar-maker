import { Matrix4, Scene } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const CURATED_AVATAR_DEFAULTS = Object.freeze({
  tracking: 'enhanced', tongue: 'neural', robotArticulation: 'expressive',
  robotVoice: 'independent', robotVoiceLevel: 0, robotVoiceMode: 'speaker',
  hair: true, hood: true, shirt: true, jewelry: true,
});

const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const filterMouths = (mouths, selected) => Object.fromEntries(Object.entries(mouths ?? {}).filter(([name]) => selected.has(name)));

function restoreBindPose(model, skeletons) {
  const bindWorld = new Map();
  for (const skeleton of skeletons) skeleton.bones.forEach((bone, index) => {
    if (!bindWorld.has(bone)) bindWorld.set(bone, skeleton.boneInverses[index].clone().invert());
  });
  const local = new Matrix4();
  // Skeleton.pose() treats a root joint's world transform as its local transform
  // when its parent is not a Bone. This rig's Armature is a rotated/scaled Group:
  // applying that transform twice shrinks and tips the exported character.
  // Traverse parents first and convert every bind-world matrix through its real
  // parent, including non-bone armature groups.
  model.traverse(node => {
    const target = bindWorld.get(node);
    if (target) {
      if (node.parent) local.copy(node.parent.matrixWorld).invert().multiply(target);
      else local.copy(target);
      local.decompose(node.position, node.quaternion, node.scale);
    }
    node.updateWorldMatrix(false, false);
  });
}

function curatedMetadata(scene, gltf, selected) {
  const metadata = copy(scene.userData);
  const physics = copy(gltf.parser?.json?.extras?.mferSecondaryMotion ?? metadata.mferSecondaryMotion);
  if (physics) {
    physics.chains = physics.chains.flatMap(chain => {
      const meshes = chain.meshes.filter(name => selected.has(name));
      return meshes.length ? [{ ...chain, meshes }] : [];
    });
    const colliders = new Set(physics.chains.flatMap(chain => chain.colliderIds ?? []));
    physics.colliders = physics.colliders.filter(collider => colliders.has(collider.id));
    if (physics.coverage) physics.coverage = Object.fromEntries(Object.entries(physics.coverage).filter(([name]) => selected.has(name)));
    physics.asset = 'Selected avatar with authored secondary motion';
    metadata.mferSecondaryMotion = physics;
  }
  if (metadata.mouthProps) metadata.mouthProps.props = metadata.mouthProps.props.flatMap(prop => {
    const meshes = prop.meshes.filter(name => selected.has(name));
    return meshes.length ? [{ ...prop, meshes, mouths: filterMouths(prop.mouths, selected) }] : [];
  });
  if (metadata.tongue) {
    metadata.tongue.meshes = metadata.tongue.meshes.filter(name => selected.has(name));
    metadata.tongue.mouths = filterMouths(metadata.tongue.mouths, selected);
  }
  if (!selected.has('mouth_robot')) {
    delete metadata.robotGrille; delete metadata.robotGrilleSplit; delete metadata.robotExpressive;
  } else {
    if (metadata.robotGrille) {
      metadata.robotGrille.mode = 'speaker';
      metadata.robotGrille.voiceSource = 'explicit-independent-input';
      metadata.robotGrille.defaultVoiceLevel = 0;
      metadata.robotGrille.cameraDrivesVibration = false;
      metadata.robotGrille.tonguePolicy = 'Shared tongue follows the lower checker seam on explicit tongue input.';
    }
    if (metadata.robotExpressive) {
      metadata.robotExpressive.defaultMode = 'expressive';
      delete metadata.robotExpressive.experimentalMode;
      metadata.robotExpressive.mixing = 'Camera controls expression and row opening. Speaker pulse requires an explicit independent voice input; default voice level is zero.';
    }
  }
  if (metadata.robotTraits) {
    metadata.robotTraits.mouthSurface = 'Expressive split checker rows with a recessed mouth interior.';
    metadata.robotTraits = Object.fromEntries(Object.entries(metadata.robotTraits).filter(([key, value]) =>
      !['type', 'eyes', 'mouth', 'beacon'].includes(key) || selected.has(value)));
    if (!['type', 'eyes', 'mouth', 'beacon'].some(key => metadata.robotTraits[key])) delete metadata.robotTraits;
  }
  metadata.mferAvatar = {
    version: 1, kind: 'selected-avatar', defaults: { ...CURATED_AVATAR_DEFAULTS },
    selectedMeshes: [...selected].sort(), dormantMeshes: selected.has('tongue') ? ['tongue'] : [],
    runtime: 'Morph targets and skinning are portable. Tracking, springs, mouth attachments and material pulses require the companion runtime.',
    referenceAdapter: 'hydrateAvatarReferences(avatar) before mouth/tongue controllers',
  };
  return metadata;
}

/** Store only sampled neutral reference vertices; no extra mesh enters the GLB. */
function bakeReferences(scene, original, metadata, selected) {
  const requested = [];
  for (const prop of metadata.mouthProps?.props ?? []) {
    const source = original.mouthProps.props.find(candidate => candidate.id === prop.id);
    if (!selected.has(prop.referenceMouth)) requested.push({ destination: prop, source });
  }
  if (metadata.tongue?.meshes.length && Object.keys(metadata.tongue.mouths).length && !selected.has(metadata.tongue.referenceMouth)) {
    requested.push({ destination: metadata.tongue, source: original.tongue });
  }
  const groups = new Map();
  for (const request of requested) {
    const name = request.source.referenceMouth;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(request);
  }
  const baked = [];
  for (const [name, requests] of groups) {
    const mesh = scene.getObjectByName(name);
    if (!mesh?.isSkinnedMesh) throw new Error(`Missing attachment reference mouth: ${name}`);
    const vertices = [...new Set(requests.flatMap(({ source }) => Object.values(source.mouths[name]).flatMap(samples => samples.map(sample => sample.vertex))))].sort((a, b) => a - b);
    const remap = new Map(vertices.map((vertex, index) => [vertex, index]));
    const referenceName = `MFER_Reference_${name}`;
    const read = (attributeName, size) => {
      const attribute = mesh.geometry.getAttribute(attributeName);
      if (!attribute) throw new Error(`Missing ${attributeName} on reference mouth: ${name}`);
      return vertices.flatMap(vertex => Array.from({ length: size }, (_, component) => attribute.getComponent(vertex, component)));
    };
    baked.push({ name: referenceName, sourceMouth: name, parentName: mesh.parent === scene ? null : mesh.parent.name,
      positions: read('position', 3), skinIndices: read('skinIndex', 4), skinWeights: read('skinWeight', 4),
      position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(), scale: mesh.scale.toArray(),
      bindMode: mesh.bindMode, bindMatrix: mesh.bindMatrix.toArray(),
      bones: mesh.skeleton.bones.map(bone => bone.name), boneInverses: mesh.skeleton.boneInverses.map(matrix => matrix.toArray()),
    });
    for (const { destination, source } of requests) {
      destination.referenceMouth = referenceName;
      destination.mouths[referenceName] = Object.fromEntries(Object.entries(source.mouths[name]).map(([key, samples]) =>
        [key, samples.map(sample => ({ vertex: remap.get(sample.vertex), weight: sample.weight }))]));
    }
  }
  if (baked.length) metadata.mferRuntimeReferences = { version: 1, meshes: baked };
  else delete metadata.mferRuntimeReferences;
}

/**
 * Export selected traits from the pristine loader result, never the live webcam
 * instance. Unselected meshes are removed, while joints and dormant tongue stay.
 * `animated` retains authored clips; `t-pose` restores skeleton bind pose, no clips.
 */
export async function exportAvatar(gltf, visibleMeshNames, exportType = 'animated') {
  if (!gltf?.scene) throw new Error('Load the avatar before exporting.');
  if (!['animated', 't-pose'].includes(exportType)) throw new Error(`Unsupported avatar export: ${exportType}`);
  const selected = new Set(visibleMeshNames);
  const model = clone(gltf.scene);
  if (model.getObjectByName('tongue')?.isMesh) selected.add('tongue');
  for (const name of selected) if (!model.getObjectByName(name)?.isMesh) throw new Error(`Unknown selected mesh: ${name}`);
  if (![...selected].some(name => name !== 'tongue')) throw new Error('Select an avatar before exporting.');
  const skeletons = new Set();
  model.traverse(node => {
    if (node.isSkinnedMesh) skeletons.add(node.skeleton);
    if (node.morphTargetInfluences) node.morphTargetInfluences.fill(0);
  });
  if (exportType === 't-pose') restoreBindPose(model, skeletons);
  model.updateMatrixWorld(true);
  const metadata = curatedMetadata(model, gltf, selected);
  metadata.mferAvatar.exportType = exportType;
  bakeReferences(model, model.userData, metadata, selected);
  const removed = [], geometries = new Set(), materials = new Set();
  model.traverse(node => { if (node.isMesh && !selected.has(node.name)) removed.push(node); });
  for (const node of removed) node.removeFromParent();
  // Exporter may temporarily normalize a normal attribute. Isolate even those
  // temporary writes from shared/cached loader geometry and materials.
  model.traverse(node => {
    node.visible = true;
    if (!node.isMesh) return;
    node.geometry = node.geometry.clone(); geometries.add(node.geometry);
    const cloneMaterial = source => { const material = source.clone(); materials.add(material); return material; };
    node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
  });
  model.userData = {};
  const scene = new Scene();
  scene.name = gltf.scene.name || 'Avatar';
  scene.userData = metadata;
  scene.add(model);
  const rootExtras = copy(gltf.parser?.json?.extras ?? {});
  if (metadata.mferSecondaryMotion) rootExtras.mferSecondaryMotion = copy(metadata.mferSecondaryMotion);
  rootExtras.mferAvatar = copy(metadata.mferAvatar);
  const exporter = new GLTFExporter();
  exporter.register(writer => ({ afterParse() { writer.json.extras = rootExtras; } }));
  try {
    return await exporter.parseAsync(scene, {
      binary: true, onlyVisible: false, trs: true, includeCustomExtensions: true,
      animations: exportType === 'animated' ? (gltf.animations ?? []).map(clip => clip.clone()) : [],
    });
  } finally {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
  }
}
