import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Euler, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CaptureTracker, createAvatarDriver, type TrackingFrame } from '../src/avatar/runtime';
import { robotGrilleInput } from '../src/avatar/runtime/robot-grille-input';

// CPU-only rig validation: texture pixels and a physical camera are unnecessary.
Object.assign(globalThis, { self: globalThis, createImageBitmap: async () => ({ width: 1, height: 1, close() {} }) });
const data = readFileSync(new URL('../public/avatar/mfermashup.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
const avatar = clone(gltf.scene);
const sourceLight = (gltf.scene.getObjectByName('robot_light') as Mesh).material;
const mesh = (name: string) => avatar.getObjectByName(name) as Mesh;
const influence = (name: string, key: string) => mesh(name).morphTargetInfluences![mesh(name).morphTargetDictionary![key]];
const select = (...names: string[]) => avatar.traverse(object => {
  if ((object as Mesh).isMesh) object.visible = names.includes(object.name);
});
select('type_plain', 'eyes_normal', 'mouth_smile', 'hair_long_dark', 'chain_gold', 'cig_white');
avatar.scale.setScalar(.01);
avatar.updateMatrixWorld(true);
const bone = (part: string) => avatar.getObjectByName(`mixamorig${part}`)!;
const originalArms = ['Left', 'Right'].map(side => bone(`${side}Arm`).quaternion.clone());
const driver = createAvatarDriver(avatar, gltf);
for (const [i, side] of ['Left', 'Right'].entries()) assert.deepEqual(bone(`${side}Arm`).quaternion.toArray(), originalArms[i].toArray(), 'Driver construction preserves host/source pose');
assert.equal(driver.metrics.physics?.totalChains, 27);
assert.deepEqual(driver.metrics.physics?.missingObjects, []);
assert.deepEqual(driver.metrics.mouthProps.invalidSamples, []);
assert.deepEqual(driver.metrics.tongue.invalidSamples, []);
assert.notEqual(mesh('robot_light').material, sourceLight);

let now = 10000;
const realPerformance = globalThis.performance;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
const frame = (face: Record<string, number>, tongue?: TrackingFrame['tongue']): TrackingFrame => ({
  timestamp: now, faceTimestamp: now, face, faceTracked: true, faceMatrix: null,
  pose: null, poseWorld: null, poseTracked: false, audioLevel: 0, calibrated: true, tongue,
});
const run = (face: Record<string, number>, count = 90, tongue?: TrackingFrame['tongue']) => {
  for (let i = 0; i < count; i++) {
    now += 1000 / 60;
    driver.update(frame(face, tongue ? { ...tongue, timestamp: now } : undefined), 1 / 60, { now, tracking: true });
  }
};
try {
  const capture = new CaptureTracker({ video: {} as HTMLVideoElement, vendorBase: '/avatar-maker/avatar/vendor',
    onFrame() {}, onStatus() {} });
  assert.equal(capture.running, false);
  assert.equal((capture as any).vendorBase, '/avatar-maker/avatar/vendor');
  capture.setTongueEnabled(true);
  assert.equal(capture.running, false, 'Enabling tongue alone never accesses a camera');

  run({ jawOpen: .6, eyeWideLeft: .45, eyeWideRight: .45, mouthSmileLeft: .4, mouthSmileRight: .1 });
  assert(influence('mouth_smile', 'mouthOpenExtra') > .5);
  assert(influence('eyes_normal', 'eyeWide') > .6);
  assert.equal(driver.metrics.tongue.active, false, 'Opening a mouth does not request tongue');
  assert(driver.metrics.physics!.activeChains > 0);
  assert(driver.metrics.physics!.activeBones > 0);

  const armDirection = (side: string) => bone(`${side}ForeArm`).getWorldPosition(new Vector3())
    .sub(bone(`${side}Arm`).getWorldPosition(new Vector3())).normalize();
  for (const side of ['Left', 'Right']) assert(armDirection(side).y < -.85, 'A face-only crop keeps unobserved arms relaxed');
  const armsFrame = (visible: boolean): TrackingFrame => {
    const poseWorld = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
    for (const [i, x, y] of [[11, .25, -.5], [12, -.25, -.5], [13, .5, -.78], [14, -.5, -.78],
      [15, .72, -1], [16, -.72, -1], [23, .14, 0], [24, -.14, 0]]) {
      poseWorld[i] = { x, y, z: 0, visibility: visible || ![13, 14, 15, 16].includes(i) ? 1 : 0, presence: 1 };
    }
    return { ...frame({}), poseWorld, poseTracked: true };
  };
  for (const visible of [true, false]) {
    for (let i = 0; i < 120; i++) { now += 1000 / 60; driver.update(armsFrame(visible), 1 / 60, { now, tracking: true }); }
    for (const side of ['Left', 'Right']) assert(visible ? armDirection(side).y > .6 : armDirection(side).y < -.85,
      visible ? 'Usable arm landmarks raise the arms despite the relaxed fallback' : 'Low-confidence arms return to relaxed rest');
  }

  const detected: TrackingFrame['tongue'] = { state: 'detected', timestamp: now, calibrated: true, calibrationId: 0,
    confidence: .95, amount: .72, x: .5, y: .2, reason: 'Synthetic positive observation' };
  run({ jawOpen: .6 }, 90, detected);
  assert.equal(driver.metrics.tongue.active, true);
  assert(driver.metrics.tongue.x < -.2, 'Camera tongue x is mirrored');
  assert(driver.metrics.tongue.y > .1);

  select('type_robot', 'eyes_robot', 'mouth_robot', 'robot_light', 'robot_antenna');
  run({ jawOpen: .6, mouthSmileLeft: .5, mouthSmileRight: .1 }, 90, detected);
  assert.equal(driver.metrics.grille.articulation, 'expressive');
  assert.equal(driver.metrics.grille.mode, 'speaker');
  assert(driver.metrics.grille.open > .5);
  assert.equal(influence('mouth_robot', 'robotGrillePulse'), 0, 'Camera articulation never automatically drives vibration');
  assert.equal(influence('mouth_robot', 'robotGrilleRipple'), 0);
  assert.equal(influence('mouth_robot', 'robotGrilleCounter'), 0);
  assert.equal(driver.metrics.tongue.activeMouth, 'mouth_robot');

  const voiceFrame = { ...frame({ jawOpen: .6 }), audioLevel: .2 };
  const voiceInputOptions = { now, microphone: false, camera: true, face: true };
  assert.equal(robotGrilleInput(voiceFrame, voiceInputOptions), 0, 'Input helper has no camera-to-voice fallback');
  assert(robotGrilleInput(voiceFrame, { ...voiceInputOptions, microphone: true }) > 0, 'Explicit microphone adapter retains an independent voice envelope');
  assert.equal(robotGrilleInput(voiceFrame, { ...voiceInputOptions, microphone: true, now: now + 1000 }), 0, 'Stale microphone input releases vibration');
  for (let i = 0; i < 90; i++) {
    now += 1000 / 60;
    driver.update(null, 1 / 60, { tracking: false, now, robotVoiceLevel: .65 });
  }
  assert.equal(driver.metrics.grille.open, 0, 'Explicit voice without camera data keeps the rows closed');
  assert(influence('mouth_robot', 'robotGrillePulse') > .1, 'Explicit voice drives pulse with capture off');
  assert(Object.values(driver.metrics.grille.expressiveWeights).every(value => value === 0), 'Voice alone does not introduce expression');
  for (let i = 0; i < 90; i++) {
    now += 1000 / 60;
    driver.update(frame({ jawOpen: .6 }), 1 / 60, { tracking: true, now, robotVoiceLevel: .65, robotVoiceStrength: 0 });
  }
  assert(driver.metrics.grille.open > .5, 'Muting vibration strength preserves camera articulation');
  assert.equal(influence('mouth_robot', 'robotGrillePulse'), 0);
  for (let i = 0; i < 30; i++) {
    now += 1000 / 60;
    driver.update(null, 1 / 60, { tracking: false, now, robotVoiceLevel: NaN });
  }
  assert.equal(driver.metrics.grille.drive, 0, 'Nonfinite voice input is silent');
  assert.equal(influence('mouth_robot', 'robotGrillePulse'), 0);
  driver.reset();
  assert.equal(driver.metrics.grille.open, 0, 'Reset closes articulation');
  assert(Object.values(driver.metrics.grille.weights).every(value => value === 0), 'Reset clears voice and mouth targets');

  // A shirt/background change must not reinterpret a person's current lean as
  // their neutral pose. Hold the same capture calibration while changing traits.
  driver.reset();
  const calibration = { id: 77, faceMatrix: new Matrix4().toArray(), face: {} };
  const torsoFrame = (rotation: Quaternion): TrackingFrame => {
    const poseWorld = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
    for (const [index, xyz] of [[11, [.25, .5, 0]], [12, [-.25, .5, 0]], [23, [.14, 0, 0]], [24, [-.14, 0, 0]]] as const) {
      const point = new Vector3(...xyz).applyQuaternion(rotation);
      poseWorld[index] = { x: point.x, y: -point.y, z: -point.z, visibility: 1, presence: 1 };
    }
    return { ...frame({}), poseWorld, poseTracked: true, calibration, faceMatrix: calibration.faceMatrix };
  };
  const holdTorso = (rotation: Quaternion, count = 120) => {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      driver.update(torsoFrame(rotation), 1 / 60, { now, tracking: true });
    }
  };
  const chest = avatar.getObjectByName('mixamorigSpine2')!;
  holdTorso(new Quaternion());
  const neutralChest = chest.getWorldQuaternion(new Quaternion());
  const lean = new Quaternion().setFromEuler(new Euler(.2, .1, .22));
  holdTorso(lean);
  const leanedChest = chest.getWorldQuaternion(new Quaternion());
  assert(leanedChest.angleTo(neutralChest) > .15, 'Fixture has a meaningful calibrated spine lean');
  driver.resetSecondaryMotion();
  select('type_plain', 'eyes_normal', 'mouth_smile', 'shirt_hoodie_blue', 'shirt_hoodie_down_blue');
  assert(chest.getWorldQuaternion(new Quaternion()).angleTo(leanedChest) < 1e-7, 'Trait reset leaves the tracked body pose in place');
  holdTorso(lean);
  assert.equal(driver.metrics.torso.torsoSource, 'hips');
  assert(chest.getWorldQuaternion(new Quaternion()).angleTo(leanedChest) < .005,
    'Changing traits retains the original neutral calibration rather than recentering on the current lean');

  // The root mixer runs before update(). Both the first camera-off frame and all
  // later camera-off frames must preserve its current body and hand rotations.
  const bodyBones: Object3D[] = [];
  avatar.traverse(object => { if ((object as any).isBone && object.name.startsWith('mixamorig')) bodyBones.push(object); });
  const idlePose = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .21);
  for (let i = 0; i < 100; i++) {
    bodyBones.forEach(bone => bone.quaternion.copy(idlePose));
    now += 1000 / 60;
    driver.update(null, 1 / 60, { now, tracking: false });
    for (const bone of bodyBones) assert(bone.quaternion.angleTo(idlePose) < 1e-7, `Idle pose overwritten: ${bone.name}`);
  }
  assert.equal(driver.metrics.tongue.active, false);
  assert.equal(driver.metrics.grille.open, 0);
  assert.equal(influence('mouth_robot', 'robotGrillePulse'), 0);
  driver.dispose(); driver.dispose();
  assert.equal(mesh('robot_light').material, sourceLight);
  console.log('PASS avatar runtime: real asset morphs, physics, tongue, robot, calibrated lean through trait changes, idle body preservation, lazy capture, and teardown');
} finally {
  driver.dispose();
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: realPerformance });
}
