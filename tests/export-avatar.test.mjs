import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AnimationMixer, Box3, Euler, InterpolateDiscrete, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { exportAvatar } from '../src/avatar/export-avatar.js';
import { hydrateAvatarReferences } from '../src/avatar/hydrate-avatar-references.js';
import { createMouthProps } from '../src/avatar/integration/mouth-props.ts';
import { createTongue } from '../src/avatar/integration/tongue.ts';
import { createAvatarDriver } from '../src/avatar/runtime.ts';
import { applyTraitVisibility } from '../src/avatar/traits.js';

const outputDirectory = new URL('../test-results/exports/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

// Geometry/metadata/controller round trip, not a rendered-material test. Retain
// original image bytes while stubbing browser raster decoding and canvas encode.
class ImageBitmapStub {
  constructor(blob) { this.blob = blob; this.width = this.height = 1; }
  close() {}
}
class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    return { drawImage: image => { this.blob = image.blob; }, translate() {}, scale() {}, fillRect() {},
      getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }), putImageData() {} };
  }
  async convertToBlob() { return this.blob ?? new Blob([new Uint8Array(4)], { type: 'image/png' }); }
}
class FileReaderStub {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
}
Object.assign(globalThis, { self: globalThis, ImageBitmap: ImageBitmapStub, OffscreenCanvas: CanvasStub,
  FileReader: FileReaderStub, createImageBitmap: async blob => new ImageBitmapStub(blob) });

const bytes = await readFile(new URL(process.env.MFER_EXPORT_MODEL ?? '../public/avatar/mfermashup.glb', import.meta.url));
const load = buffer => new GLTFLoader().parseAsync(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
const source = await load(bytes);
assert.equal(source.scene.userData.beardMotion, undefined, 'Restored source has no beard-motion manifest');
assert.equal(source.scene.userData.mferAvatar?.beardMotion, undefined, 'Restored source does not advertise beard motion');
const hash = values => createHash('sha256').update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)).digest('hex');
function snapshot(scene) {
  const values = [];
  scene.traverse(node => values.push({ name: node.name, transform: [...node.position, ...node.quaternion, ...node.scale], visible: node.visible,
    morphs: node.morphTargetInfluences ? [...node.morphTargetInfluences] : null,
    vertices: node.isMesh ? hash(node.geometry.attributes.position.array) : null,
    attributes: node.isMesh ? Object.fromEntries(['normal', 'skinIndex', 'skinWeight'].filter(name => node.geometry.attributes[name])
      .map(name => [name, hash(node.geometry.attributes[name].array)])) : null,
    morphGeometry: node.isMesh ? Object.fromEntries(Object.entries(node.geometry.morphAttributes).map(([name, attributes]) => [name, attributes.map(attribute => hash(attribute.array))])) : null,
    material: node.isMesh ? (Array.isArray(node.material) ? node.material : [node.material]).map(material => ({ uuid: material.uuid, color: material.color?.toArray(), emissive: material.emissive?.toArray(), emissiveIntensity: material.emissiveIntensity })) : null,
    data: JSON.stringify(node.userData) }));
  return values;
}
const pristine = snapshot(source.scene);
const sourceAnimations = source.animations.map(clip => clip.toJSON());
const robotNames = ['body', 'type_robot', 'eyes_robot', 'mouth_robot', 'robot_light', 'chain_gold', 'smoke_cig_white', 'smoke'];
const flatNames = ['body_metal', 'type_metal', 'eyes_metal', 'mouth_flat_metal', 'hair_long_dark', 'shirt_hoodie_blue', 'shirt_hoodie_down_blue', 'smoke_pipe'];

function decode(buffer) {
  const view = new DataView(buffer);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, view.getUint32(12, true))));
}
function meshNames(scene) {
  const names = [];
  scene.traverse(node => { if (node.isMesh) names.push(node.name); });
  return names.sort();
}
function setVisibility(scene, names) {
  scene.traverse(node => { if (node.isMesh) node.visible = names.includes(node.name); });
}
function worldBounds(scene) {
  scene.updateMatrixWorld(true);
  const bounds = new Box3();
  scene.traverse(node => {
    if (!node.isMesh || !node.visible || node.userData.mferAttachmentReference) return;
    node.skeleton?.update();
    if (node.isSkinnedMesh) {
      node.computeBoundingBox();
      bounds.union(node.boundingBox.clone().applyMatrix4(node.matrixWorld));
    } else {
      node.geometry.computeBoundingBox();
      bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    }
  });
  return bounds;
}
function assertClose(a, b, message, tolerance = 2e-5) {
  assert.equal(a.length, b.length, message);
  assert.ok(a.every((value, i) => Math.abs(value - b[i]) < tolerance), `${message}: ${a} vs ${b}`);
}
function pose(scene, mouthName) {
  const mouth = scene.getObjectByName(mouthName);
  for (const [name, value] of Object.entries(mouthName === 'mouth_robot'
    ? { robotGrilleOpen: .8, robotCornerUpLeft: .35, robotCornerDownRight: .2, robotShiftLeft: .2 }
    : { jawOpen: .8, mouthCornerUpLeft: .3, mouthCornerDownRight: .2 })) {
    mouth.morphTargetInfluences[mouth.morphTargetDictionary[name]] = value;
  }
  for (const [boneName, rotation] of [['mixamorigHead', [.14, -.23, .12]], ['mixamorigSpine2', [.04, .08, -.1]]]) {
    const bone = scene.getObjectByName(boneName);
    bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...rotation)));
  }
  scene.updateMatrixWorld(true);
}

async function check(names, exportType, mouthName) {
  const buffer = await exportAvatar(source, names, exportType);
  const json = decode(buffer);
  const reloaded = await load(buffer);
  const expectedNames = [...names, 'tongue'].sort();
  const hasBeacon = exportType === 'animated' && names.includes('robot_light');
  const renderedNames = hasBeacon ? [...expectedNames, 'robot_light_glow'].sort() : expectedNames;
  const beardNames = names.filter(name => ['beard', 'beard_flat'].includes(name));
  // The untouched trait bank is already in its bind pose. Check world space
  // independently: matching local geometry alone misses a doubled Armature
  // rotation/scale when a T-pose export reconstructs root-bone transforms.
  const reference = clone(source.scene);
  setVisibility(reference, expectedNames);
  const referenceBounds = worldBounds(reference), exportedBounds = worldBounds(reloaded.scene);
  assertClose(exportedBounds.min.toArray(), referenceBounds.min.toArray(), `${exportType} world bounds min`, 2e-5);
  assertClose(exportedBounds.max.toArray(), referenceBounds.max.toArray(), `${exportType} world bounds max`, 2e-5);
  const exportedHeight = exportedBounds.getSize(new Vector3()).y;
  assert.ok(exportedHeight > .5 && exportedHeight < 3, `${exportType} remains full-size and upright (${exportedHeight}m)`);
  assert.deepEqual(meshNames(reloaded.scene), renderedNames, 'Only selected traits, dormant tongue, and any lamp glow helper appear');
  assert.equal(json.nodes.filter(node => node.mesh !== undefined).length, renderedNames.length);
  assert.equal(json.nodes.filter(node => node.name?.startsWith('MFER_Reference_')).length, 0, 'Reference geometry is metadata, never a rendered primitive');
  assert.deepEqual(json.extras.mferSecondaryMotion, reloaded.scene.userData.mferSecondaryMotion);
  assert.equal(reloaded.scene.userData.mferAvatar.defaults.robotArticulation, 'expressive');
  assert.equal(reloaded.scene.userData.mferAvatar.defaults.robotVoice, 'independent');
  assert.equal(reloaded.scene.userData.mferAvatar.defaults.robotVoiceLevel, 0);
  assert.equal(reloaded.scene.userData.mferAvatar.defaults.robotVoiceMode, 'speaker');
  assert.equal(reloaded.scene.userData.mferAvatar.defaults.tongue, 'neural');
  assert.deepEqual(reloaded.scene.userData.mferAvatar.dormantMeshes, ['tongue']);
  assert.deepEqual(reloaded.scene.userData.mferAvatar.selectedMeshes, expectedNames);
  assert.equal(reloaded.scene.userData.beardMotion, undefined, 'Static avatar export has no beard-motion manifest');
  assert.equal(reloaded.scene.userData.mferAvatar?.beardMotion, undefined);
  assert.equal(json.extras?.beardMotion, undefined);
  assert.equal(json.extras?.mferAvatar?.beardMotion, undefined);
  for (const chain of json.extras.mferSecondaryMotion.chains) assert.ok(chain.meshes.every(name => names.includes(name)));
  assert.equal(reloaded.animations.length, exportType === 'animated' ? source.animations.length + Number(hasBeacon) : 0);
  if (exportType === 'animated') assert.equal(reloaded.animations[0].tracks.length, source.animations[0].tracks.length + Number(hasBeacon));
  if (hasBeacon) {
    const glow = reloaded.scene.getObjectByName('robot_light_glow');
    const lamp = reloaded.scene.getObjectByName('robot_light');
    const blink = reloaded.animations.find(clip => clip.name === 'Beacon Blink');
    assert(blink && blink.tracks.length === 1);
    assert.equal(blink.tracks[0].getInterpolation(), InterpolateDiscrete);
    assert(!json.extensionsUsed?.includes('KHR_animation_pointer'), 'Blink uses core morph animation');
    assert.deepEqual(reloaded.scene.userData.mferAvatar.auxiliaryMeshes, ['robot_light_glow']);
    assert.deepEqual(reloaded.scene.userData.mferAvatar.beaconBlink.onPhase, [.15, .37]);
    for (const attribute of ['skinIndex', 'skinWeight']) assert.equal(hash(glow.geometry.attributes[attribute].array), hash(lamp.geometry.attributes[attribute].array));
    assertClose(glow.bindMatrix.toArray(), lamp.bindMatrix.toArray(), 'Glow retains lamp binding');
    assert.deepEqual(glow.skeleton.bones, lamp.skeleton.bones);
    assert(lamp.material.emissiveIntensity < glow.material.emissiveIntensity / 10, 'Blink has a dim base and bright shell');
    const mixer = new AnimationMixer(reloaded.scene);
    mixer.clipAction(blink).play();
    for (const [fraction, value] of [[0, 0], [.24, 1], [.65, 0], [1.24, 1]]) {
      mixer.setTime(blink.duration * fraction);
      assert.equal(glow.morphTargetInfluences[0], value, 'Standalone clip blinks without runtime or body animation');
    }
    mixer.stopAllAction();
    mixer.clipAction(reloaded.animations[0]).play();
    mixer.setTime(blink.duration * .24);
    assert.equal(glow.morphTargetInfluences[0], 1, 'Default body clip also blinks');
    mixer.stopAllAction(); mixer.uncacheRoot(reloaded.scene);
    const visibility = [];
    reloaded.scene.traverse(object => visibility.push([object, object.visible]));
    applyTraitVisibility(reloaded.scene, { type: 'robot' }); assert(glow.visible);
    applyTraitVisibility(reloaded.scene, { type: 'plain' }); assert(!glow.visible);
    visibility.forEach(([object, visible]) => { object.visible = visible; });
  } else {
    assert.equal(reloaded.scene.userData.mferAvatar.beaconBlink, undefined);
    assert.equal(reloaded.scene.getObjectByName('robot_light_glow'), undefined);
  }
  for (const name of expectedNames) {
    const before = source.scene.getObjectByName(name), after = reloaded.scene.getObjectByName(name);
    assert.equal(hash(after.geometry.attributes.position.array), hash(before.geometry.attributes.position.array), `${name} original vertex order/data`);
    if (beardNames.includes(name)) {
      for (const attribute of ['position', 'normal', 'skinIndex', 'skinWeight']) {
        assert.equal(hash(after.geometry.attributes[attribute].array), hash(before.geometry.attributes[attribute].array), `${name} original ${attribute} data`);
      }
      assert.deepEqual(before.geometry.morphAttributes, {}, `${name} source uses original static geometry`);
      assert.deepEqual(after.geometry.morphAttributes, {}, `${name} export has no experimental beard morphs`);
      assert.equal(after.morphTargetInfluences, undefined, `${name} export has no beard morph weights`);
    }
    assert.deepEqual(after.morphTargetDictionary, before.morphTargetDictionary, `${name} morph names`);
    if (after.morphTargetInfluences) assert.ok(after.morphTargetInfluences.every(value => value === 0));
    for (const attribute of ['position', 'normal']) {
      const beforeMorphs = before.geometry.morphAttributes[attribute] ?? [];
      const afterMorphs = after.geometry.morphAttributes[attribute] ?? [];
      assert.deepEqual(afterMorphs.map(item => hash(item.array)), beforeMorphs.map(item => hash(item.array)), `${name} ${attribute} morph geometry`);
    }
    assert.equal(after.skeleton.bones.length, before.skeleton.bones.length);
    const referenceMesh = reference.getObjectByName(name);
    for (const index of [0, Math.floor(after.geometry.attributes.position.count / 2), after.geometry.attributes.position.count - 1]) {
      const actual = after.getVertexPosition(index, new Vector3()).applyMatrix4(after.matrixWorld);
      const expected = referenceMesh.getVertexPosition(index, new Vector3()).applyMatrix4(referenceMesh.matrixWorld);
      assertClose(actual.toArray(), expected.toArray(), `${exportType} ${name} skinned world vertex ${index}`, 2e-5);
    }
    assertClose(after.material.color.toArray(), before.material.color.toArray(), `${name} material base color`);
    assert.equal(Boolean(after.material.map), Boolean(before.material.map), `${name} base texture retained`);
  }
  const hydration = hydrateAvatarReferences(reloaded.scene);
  assert.equal(hydration.meshes.length, names.includes('mouth_smile') ? 0 : 1);
  if (hydration.meshes.length) {
    assert.ok(hydration.meshes[0].geometry.attributes.position.count < source.scene.getObjectByName('mouth_smile').geometry.attributes.position.count);
    assert.equal(hydration.meshes[0].visible, false);
  }
  const secondHydration = hydrateAvatarReferences(reloaded.scene);
  assert.equal(secondHydration.meshes.length, 0, 'Idempotent hydration');
  const full = clone(source.scene);
  setVisibility(full, names);
  const pairs = [full, reloaded.scene].map(scene => ({ scene, props: createMouthProps(scene), tongue: createTongue(scene) }));
  for (const pair of pairs) {
    assert.deepEqual(pair.props.metrics.invalidSamples, []);
    assert.deepEqual(pair.tongue.metrics.invalidSamples, []);
    if (pair.scene === reloaded.scene) {
      assert.deepEqual(pair.props.metrics.missingObjects, []);
      assert.deepEqual(pair.tongue.metrics.missingObjects, []);
    }
    pose(pair.scene, mouthName);
    pair.tongue.setOptions({ out: .75, x: .25, y: -.2 });
    for (let i = 0; i < 25; i++) { pair.props.update(); pair.tongue.update(1 / 60); }
    assert.equal(pair.props.metrics.activeProps, 1);
    assert.equal(pair.tongue.metrics.active, true);
  }
  for (const boneName of ['MFER_Tongue', mouthName === 'mouth_robot' ? 'MFER_Prop_Cigarette' : 'MFER_Prop_Pipe']) {
    const originalBone = full.getObjectByName(boneName), exportedBone = reloaded.scene.getObjectByName(boneName);
    assertClose(originalBone.getWorldPosition(new Vector3()).toArray(), exportedBone.getWorldPosition(new Vector3()).toArray(), `${boneName} attachment world position`, .0001);
    assertClose(originalBone.quaternion.toArray(), exportedBone.quaternion.toArray(), `${boneName} attachment orientation`, .0001);
  }
  for (const pair of pairs) { pair.props.dispose(); pair.tongue.dispose(); }
  hydration.dispose(); secondHydration.dispose();
  assert.equal(reloaded.scene.getObjectByName('MFER_Reference_mouth_smile'), undefined);
  const driver = createAvatarDriver(reloaded.scene, reloaded);
  assert.deepEqual(driver.metrics.physics.missingObjects, []);
  assert.deepEqual(driver.metrics.tongue.invalidSamples, []);
  assert.deepEqual(driver.metrics.mouthProps.invalidSamples, []);
  const originalPerformance = globalThis.performance;
  let now = 10000;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  try {
    const runDriver = (tongue = false) => {
      for (let i = 0; i < 60; i++) {
        now += 1000 / 60;
        driver.update({ timestamp: now, faceTimestamp: now, faceTracked: true, calibrated: true,
          face: { jawOpen: .6, mouthSmileLeft: .4, mouthSmileRight: .1 }, faceMatrix: null,
          pose: null, poseWorld: null, poseTracked: false, audioLevel: 0,
          tongue: tongue ? { timestamp: now, state: 'detected', calibrated: true, confidence: .95, amount: .72, x: .3, y: .1 } : undefined,
        }, 1 / 60, { tracking: true, now });
      }
    };
    runDriver();
    for (const name of beardNames) assert.equal(reloaded.scene.getObjectByName(name).morphTargetInfluences, undefined, 'Webcam driver leaves beard geometry static');
    assert.equal(driver.metrics.tongue.active, false, 'Open webcam mouth does not reveal a tongue');
    if (mouthName === 'mouth_robot') {
      assert.equal(driver.metrics.grille.articulation, 'expressive');
      assert.equal(driver.metrics.grille.mode, 'speaker');
      assert.ok(driver.metrics.grille.open > .5, 'Pruned robot-only capture works without any human mouth mesh');
      assert.equal(driver.metrics.grille.weights.robotGrillePulse, 0, 'Exported robot articulation is independent of voice by default');
      assert.equal(reloaded.scene.userData.robotGrille.cameraDrivesVibration, false);
      for (const key of ['robotGrillePulse', 'robotGrilleRipple', 'robotGrilleCounter', 'robotGrilleOpen']) {
        assert(Number.isInteger(reloaded.scene.getObjectByName('mouth_robot').morphTargetDictionary[key]), `${key} remains available after export`);
      }
      for (let i = 0; i < 36; i++) {
        now += 1000 / 60;
        driver.update(null, 1 / 60, { tracking: false, now, robotVoiceLevel: .65 });
      }
      assert.equal(driver.metrics.grille.open, 0, 'Independent voice keeps exported robot rows closed');
      assert(driver.metrics.grille.weights.robotGrillePulse > .05, 'Independent pulse works on reloaded selected GLB');
    }
    runDriver(true);
    assert.equal(driver.metrics.tongue.active, true, 'Driver hydrates reference and animates detected tongue on exported avatar');
    assert.ok(driver.metrics.physics.activeChains > 0);
    driver.update(null, 1 / 60, { tracking: false, now: now + 1000 / 60 });
    assert.equal(driver.metrics.tongue.active, false);
  } finally {
    driver.dispose();
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: originalPerformance });
  }
  assert.equal(reloaded.scene.getObjectByName('MFER_Reference_mouth_smile'), undefined, 'Driver disposes hydrated reference');
  assert.deepEqual(snapshot(source.scene), pristine, 'Export did not mutate cached model, geometry, materials, pose or metadata');
  assert.deepEqual(source.animations.map(clip => clip.toJSON()), sourceAnimations);
  await writeFile(new URL(`avatar-${mouthName}${beardNames.length ? `-${beardNames.join('-')}` : ''}-${exportType}.glb`, outputDirectory), new Uint8Array(buffer));
  return { exportType, mouthName, beardNames, bytes: buffer.byteLength, meshCount: renderedNames.length, height: exportedHeight,
    referenceVertices: json.scenes[0].extras.mferRuntimeReferences?.meshes.reduce((sum, reference) => sum + reference.positions.length / 3, 0) ?? 0 };
}

const results = [await check(robotNames, 'animated', 'mouth_robot'), await check(flatNames, 't-pose', 'mouth_flat_metal'),
  await check(['body', 'type_plain', 'eyes_normal', 'mouth_smile', 'beard', 'hair_short_messy_black', 'smoke_pipe'], 'animated', 'mouth_smile'),
  await check([...robotNames, 'beard_flat'], 't-pose', 'mouth_robot'),
  await check([...flatNames, 'beard_flat'], 'animated', 'mouth_flat_metal')];
// Exported GLBs can be imported and exported again without stacking helpers or
// losing the sampled attachment references used by the robot's mouth props.
const importedRobot = await load(await exportAvatar(source, robotNames, 'animated'));
const importedSnapshot = snapshot(importedRobot.scene);
const exportedAgain = await load(await exportAvatar(importedRobot, meshNames(importedRobot.scene), 'animated'));
assert.deepEqual(meshNames(exportedAgain.scene), meshNames(importedRobot.scene));
assert.deepEqual(exportedAgain.scene.userData.mferRuntimeReferences, importedRobot.scene.userData.mferRuntimeReferences);
assert.deepEqual(exportedAgain.animations.map(clip => [clip.name, clip.tracks.length]), importedRobot.animations.map(clip => [clip.name, clip.tracks.length]));
assert.deepEqual(snapshot(importedRobot.scene), importedSnapshot, 'Re-export keeps its imported source untouched');
const smile = await load(await exportAvatar(source, ['body', 'type_plain', 'eyes_normal', 'mouth_smile'], 't-pose'));
assert.equal(smile.scene.userData.mferRuntimeReferences, undefined, 'Selected original reference mouth needs no metadata-only reference');
const smileDriver = createAvatarDriver(smile.scene, smile);
smileDriver.update(null, 1 / 60, { tracking: false, now: performance.now() });
assert.deepEqual(smileDriver.metrics.tongue.invalidSamples, []);
smileDriver.dispose();
await assert.rejects(exportAvatar(source, ['missing_mesh']), /Unknown selected mesh/);
await assert.rejects(exportAvatar(source, [], 't-pose'), /Select an avatar/);
await assert.rejects(exportAvatar(source, robotNames, 'webcam-pose'), /Unsupported avatar export/);
const report = { passed: true, assetSHA256: createHash('sha256').update(bytes).digest('hex'), results,
  checks: ['Selected geometry/morphs/textures/skeleton retained', 'Core morph beacon blinks in default and standalone clips; T-pose remains static', 'Zero export weights and original world bounds', 'Static Full/Flat beard position, normal and skin data retained',
    'No beard motion targets or metadata', 'Mouth/prop/tongue/physics driver preserved on static beard exports', 'Pristine source pose/material/geometry/morph/metadata isolation'],
  textureVerification: 'Texture presence and material properties checked; raster decoding/encoding stubbed. Browser visual review remains separate.' };
await writeFile(new URL('validation.json', outputDirectory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
