import { type Material, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { createAvatarRetarget } from './runtime/retarget';
import { createAvatarPhysics, type PhysicsManifest } from './runtime/physics';
import { robotGrillePose } from './runtime/robot-grille-input';
import { resolveTonguePose } from './runtime/tongue-control';
import type { TrackingFrame } from './runtime/tracking';
import { createMouthProps } from './integration/mouth-props';
import { createTongue } from './integration/tongue';
import { createRobotGrille } from './integration/robot-grille';
import { hydrateAvatarReferences } from './hydrate-avatar-references.js';

export { CaptureTracker } from './runtime/tracking';
export type { TrackingFrame, TrackingStatus, CaptureMetrics } from './runtime/tracking';

interface AvatarSource {
  scene?: Object3D;
  parser?: { json?: { extras?: { mferSecondaryMotion?: PhysicsManifest } } };
}

export interface AvatarDriverOptions {
  tracking: boolean;
  /** performance.now() in milliseconds, matching CaptureTracker timestamps. */
  now: number;
  /** Optional independent voice/playback envelope, 0..1. Omitted means silence;
   * camera mouth opening never creates a vibration signal. No capture is started.
   */
  robotVoiceLevel?: number;
  /** Vibration gain, 0..2, default 1. Zero leaves mouth articulation active. */
  robotVoiceStrength?: number;
}

/** Attach to an instance, never to the cached source asset. The mixer runs first.
 * Webcam tracking replaces the upper-body pose; idle animation remains owned by
 * the host app. Springs and prop/tongue attachments run after both pose sources.
 */
export function createAvatarDriver(avatar: Object3D, gltf: AvatarSource = {}) {
  const references = hydrateAvatarReferences(avatar);
  // Capture may see only a face. Give unobserved arms the studio's relaxed rest
  // stance, while preserving the imported pose for the host mixer and exporters.
  const savedArms = new Map<Object3D, Quaternion>();
  let retarget: ReturnType<typeof createAvatarRetarget>;
  try {
    avatar.updateWorldMatrix(true, true);
    const avatarRotation = avatar.getWorldQuaternion(new Quaternion());
    for (const side of ['Left', 'Right']) {
      const find = (part: string) => avatar.getObjectByName(`mixamorig${side}${part}`)
        ?? avatar.getObjectByName(`mixamorig:${side}${part}`);
      const arm = find('Arm'), forearm = find('ForeArm');
      if (!arm || !forearm) continue;
      savedArms.set(arm, arm.quaternion.clone());
      const from = forearm.getWorldPosition(new Vector3()).sub(arm.getWorldPosition(new Vector3())).normalize();
      const to = new Vector3(side === 'Left' ? .4 : -.4, -.91, .03).normalize().applyQuaternion(avatarRotation);
      const world = new Quaternion().setFromUnitVectors(from, to).multiply(arm.getWorldQuaternion(new Quaternion()));
      const parent = arm.parent?.getWorldQuaternion(new Quaternion()).invert() ?? new Quaternion();
      arm.quaternion.copy(parent.multiply(world));
      avatar.updateWorldMatrix(true, true);
    }
    retarget = createAvatarRetarget(avatar);
  } finally {
    for (const [arm, pose] of savedArms) arm.quaternion.copy(pose);
    avatar.updateWorldMatrix(true, true);
  }
  const manifest: PhysicsManifest | undefined = avatar.userData.mferSecondaryMotion
    ?? gltf.parser?.json?.extras?.mferSecondaryMotion;
  const physics = manifest ? createAvatarPhysics(avatar, manifest) : null;
  const mouthProps = createMouthProps(avatar);
  const tongue = createTongue(avatar);
  const grille = createRobotGrille(avatar);
  grille.setOptions({ articulation: 'expressive', mode: 'speaker', strength: 1 });

  const beacon = avatar.getObjectByName('robot_light') as Mesh | undefined;
  const beaconGlow = avatar.getObjectByName('robot_light_glow') as Mesh | undefined;
  const beaconMorph = beaconGlow?.morphTargetDictionary?.beaconBlink;
  const bakedBeacon = beaconMorph !== undefined && !!beaconGlow?.morphTargetInfluences;
  const beaconRestWeight = bakedBeacon ? beaconGlow!.morphTargetInfluences![beaconMorph!] : 0;
  const exportedPeriod = avatar.userData.mferAvatar?.beaconBlink?.periodSeconds;
  const beaconPeriod = Number.isFinite(exportedPeriod) && exportedPeriod > 0 ? exportedPeriod : 1 / .9;
  const beaconOriginal = beacon?.material;
  const beaconMaterials: Material[] = [];
  if (beacon?.isMesh && !bakedBeacon) {
    const cloneMaterial = (source: Material) => {
      const copy = source.clone();
      if ((copy as MeshStandardMaterial).isMeshStandardMaterial) {
        (copy as MeshStandardMaterial).emissive.set(0xff0800);
        (copy as MeshStandardMaterial).emissiveIntensity = .12;
      }
      beaconMaterials.push(copy);
      return copy;
    };
    beacon.material = Array.isArray(beacon.material)
      ? beacon.material.map(cloneMaterial) : cloneMaterial(beacon.material);
  }

  const bones: Object3D[] = [];
  avatar.traverse(object => { if ((object as any).isBone) bones.push(object); });
  const previousBonePose = bones.map(() => new Quaternion());
  let disposed = false;
  let wasTracking = false;
  let lastFrame: TrackingFrame | null = null;
  let idleSeconds = 0;

  /** Trait changes restart attachments/springs without recentering the person. */
  function resetSecondaryMotion() {
    if (disposed) return;
    physics?.reset(); mouthProps.reset(); tongue.reset(); grille.reset();
  }

  function reset() {
    if (disposed) return;
    retarget.reset(); resetSecondaryMotion();
    lastFrame = null;
  }

  return {
    get metrics() {
      return { torso: { ...retarget.metrics }, hands: { ...retarget.handMetrics },
        physics: physics?.metrics ?? null, mouthProps: mouthProps.metrics,
        tongue: tongue.metrics, grille: { ...grille.metrics } };
    },
    calibrate(frame: TrackingFrame | null = lastFrame) {
      if (disposed) return false;
      physics?.reset();
      return retarget.calibrate(frame);
    },
    reset,
    resetSecondaryMotion,
    update(frame: TrackingFrame | null, deltaSeconds: number, options: AvatarDriverOptions) {
      if (disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const dt = Math.min(deltaSeconds, .05);
      idleSeconds += dt;
      const fresh = options.tracking && frame && Number.isFinite(options.now)
        && options.now >= frame.timestamp && options.now - frame.timestamp < 750 ? frame : null;
      lastFrame = fresh;
      const tonguePose = resolveTonguePose({ enabled: true, manual: 0, manualX: 0, manualY: 0,
        webcam: options.tracking, mirror: true, now: options.now, detection: fresh?.tongue });
      if (options.tracking) {
        retarget.update(fresh, dt, { body: true, face: true, hands: true, mirror: true,
          microphone: false, mode: 'enhanced', mouthSensitivity: 1, tongueOut: tonguePose.out });
      } else {
        if (wasTracking) {
          // Keep this frame's host-mixer pose while clearing capture history.
          bones.forEach((bone, i) => previousBonePose[i].copy(bone.quaternion));
          retarget.reset();
          bones.forEach((bone, i) => bone.quaternion.copy(previousBonePose[i]));
        }
        retarget.face.mouth.silence();
        const blink = Math.max(0, 1 - Math.abs(idleSeconds % 4.7 - 4.35) / .13);
        const phase = idleSeconds % 9;
        const glance = phase > 5 && phase < 8
          ? Math.sin(Math.min(1, (phase - 5) / .5) * Math.PI / 2)
            * Math.sin(Math.min(1, (8 - phase) / .5) * Math.PI / 2) : 0;
        retarget.face.eyes.setBlink(blink);
        retarget.face.eyes.setGaze(glance * (Math.floor(idleSeconds / 9) % 2 === 0 ? .22 : -.22), glance * .06);
        retarget.face.eyes.setWide(0);
        retarget.face.update(dt);
      }
      wasTracking = options.tracking;

      const capture = { now: options.now, camera: options.tracking, face: true,
        microphone: false, mirror: true, mouthSensitivity: 1 };
      const pose = robotGrillePose(fresh, capture);
      grille.setOptions({ strength: options.robotVoiceStrength ?? 1 });
      grille.update(deltaSeconds, options.robotVoiceLevel ?? 0,
        Math.max(pose.open, .45 * Math.min(1, tonguePose.out * 5)), pose);
      avatar.updateMatrixWorld(true);
      physics?.update(deltaSeconds);
      mouthProps.update();
      // Visibility belongs to this controller, independent of trait filtering.
      tongue.setOptions({ enabled: true, ...tonguePose });
      tongue.update(dt);
      const pulse = Math.pow((1 + Math.sin(idleSeconds * Math.PI * 2 * .9)) / 2, 6);
      if (bakedBeacon) {
        const phase = (idleSeconds % beaconPeriod) / beaconPeriod;
        beaconGlow!.morphTargetInfluences![beaconMorph!] = phase >= .15 && phase < .37 ? 1 : 0;
      }
      for (const material of beaconMaterials) if ((material as MeshStandardMaterial).isMeshStandardMaterial) {
        (material as MeshStandardMaterial).emissiveIntensity = .12 + 1.5 * pulse;
      }
    },
    dispose() {
      if (disposed) return;
      retarget.dispose(); physics?.dispose(); mouthProps.dispose(); tongue.dispose(); grille.dispose();
      if (beacon && beaconOriginal) beacon.material = beaconOriginal;
      if (bakedBeacon) beaconGlow!.morphTargetInfluences![beaconMorph!] = beaconRestWeight;
      for (const material of beaconMaterials) material.dispose();
      references.dispose();
      disposed = true;
    },
  };
}
