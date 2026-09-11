import { AnimationClip, Float32BufferAttribute, InterpolateDiscrete, NumberKeyframeTrack, Vector3 } from 'three';

const GLOW_NAME = 'robot_light_glow';
const CLIP_NAME = 'Beacon Blink';

function blinkTrack(duration, cycles) {
  const period = duration / cycles;
  const times = [0], values = [0];
  for (let cycle = 0; cycle < cycles; cycle++) {
    times.push((cycle + .15) * period, (cycle + .37) * period);
    values.push(1, 0);
  }
  times.push(duration); values.push(0);
  return new NumberKeyframeTrack(`${GLOW_NAME}.morphTargetInfluences`, times, values, InterpolateDiscrete);
}

/** A core-glTF weight animation reveals a bright shell over a fixed dim lamp.
 * STEP interpolation never renders the shell crossing the lamp surface.
 * Call only on the export clone, after its materials/geometry have been isolated.
 */
export function addExportBeacon(model, clips, geometries, materials) {
  const beacon = model.getObjectByName('robot_light');
  if (!beacon?.isSkinnedMesh) return null;
  const glow = beacon.clone(false); // Retain the clone's skeleton and bind matrices.
  glow.name = GLOW_NAME;
  glow.userData = { mferBeaconGlow: { source: beacon.name } };
  glow.geometry = beacon.geometry.clone();
  geometries.add(glow.geometry);
  glow.geometry.computeBoundingBox();
  const center = glow.geometry.boundingBox.getCenter(new Vector3());
  const original = beacon.geometry.attributes.position;
  const positions = [], deltas = [];
  for (let index = 0; index < original.count; index++) {
    for (let axis = 0; axis < 3; axis++) {
      const offset = original.getComponent(index, axis) - center.getComponent(axis);
      positions.push(center.getComponent(axis) + offset * .97);
      deltas.push(offset * (1.006 - .97));
    }
  }
  glow.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const target = new Float32BufferAttribute(deltas, 3); target.name = 'beaconBlink';
  glow.geometry.morphAttributes = { position: [target] };
  glow.geometry.morphTargetsRelative = true;
  glow.geometry.computeBoundingBox(); glow.geometry.computeBoundingSphere();
  glow.updateMorphTargets();
  const brightMaterial = source => {
    const material = source.clone(); materials.add(material);
    material.emissive.set(0xff0800);
    material.emissiveIntensity = 1;
    return material;
  };
  glow.material = Array.isArray(beacon.material) ? beacon.material.map(brightMaterial) : brightMaterial(beacon.material);
  for (const material of [].concat(beacon.material)) material.emissiveIntensity = .035;
  beacon.parent.add(glow);

  // Close each existing clip on the dim phase so looping has no seam. The
  // standalone clip uses the first idle's period to stay in phase when started together.
  const firstDuration = clips.find(clip => clip.duration > 0)?.duration;
  const period = firstDuration ? firstDuration / Math.max(1, Math.round(firstDuration * .9)) : 1 / .9;
  for (const clip of clips) {
    const duration = clip.duration > 0 ? clip.duration : period;
    clip.duration = duration;
    clip.tracks.push(blinkTrack(duration, Math.max(1, Math.round(duration / period))));
  }
  clips.push(new AnimationClip(CLIP_NAME, period, [blinkTrack(period, 1)]));
  return { version: 1, source: beacon.name, mesh: GLOW_NAME, morph: 'beaconBlink', clip: CLIP_NAME,
    periodSeconds: period, onPhase: [.15, .37], interpolation: 'STEP',
    playback: 'Loop an included body clip, or loop Beacon Blink alongside a body clip without its own beacon track. Play one beacon-driving clip at a time.' };
}
