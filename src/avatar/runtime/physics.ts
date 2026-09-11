import { Matrix3, Matrix4, Object3D, PropertyBinding, Quaternion, Vector3 } from 'three';

export type PhysicsCategory = 'hair' | 'hood' | 'shirt' | 'jewelry';
export type VectorTuple = [number, number, number];

export interface PhysicsBoneDefinition {
  name: string;
  /** Tip in this bone's local coordinates, including its native asset units. */
  tail: VectorTuple;
}

export interface PhysicsChainDefinition {
  id: string;
  category: PhysicsCategory;
  /** A shared recolor chain runs only while at least one of these traits is visible. */
  meshes: string[];
  bones: PhysicsBoneDefinition[];
  /** Spring acceleration coefficient in s^-2; damping in s^-1. */
  stiffness: number;
  damping: number;
  maxAngle: number;
  /** World-space acceleration in asset scene units/s² (scaled with the avatar root). */
  gravity?: VectorTuple;
  /** Tip collision radius in native bone-local units. */
  radius?: number;
  colliderIds?: string[];
  /** Relative response to the breeze; dense jewelry should react mostly to body motion. */
  windInfluence?: number;
}

export interface PhysicsColliderDefinition {
  id: string;
  bone: string;
  offset: VectorTuple;
  /** Omitted type preserves the original spherical collider behavior. */
  type?: 'sphere' | 'plane';
  /** Sphere radius, or optional plane padding, in the attached bone's local units. */
  radius?: number;
  /** Plane's outward-facing normal in the attached bone's local coordinates. */
  normal?: VectorTuple;
}

export interface PhysicsManifest {
  version: number;
  chains: PhysicsChainDefinition[];
  colliders: PhysicsColliderDefinition[];
  [metadata: string]: unknown;
}

export interface PhysicsOptions {
  enabled: boolean;
  hair: boolean;
  hood: boolean;
  shirt: boolean;
  jewelry: boolean;
  /** 0 is rigid/rest; 1 is authored; 2 is exaggerated. */
  strength: number;
  /** Signed breeze strength, -1 through 1. */
  wind: number;
}

export interface PhysicsMetrics {
  activeChains: number;
  activeBones: number;
  totalChains: number;
  totalBones: number;
  substeps: number;
  resets: number;
  collisions: number;
  maxStretchError: number;
  missingObjects: string[];
}

export interface AvatarPhysics {
  /** Call after applying the current tracked/body-animation pose. */
  update(deltaSeconds: number): void;
  /** Call on tracking loss, a pose recenter, or a model/trait switch. */
  reset(): void;
  setOptions(options: Partial<PhysicsOptions>): void;
  dispose(): void;
  readonly metrics: PhysicsMetrics;
  readonly options: Readonly<PhysicsOptions>;
}

interface Particle {
  bone: Object3D;
  tail: Vector3;
  rest: Quaternion;
  position: Vector3;
  velocity: Vector3;
  previousHead: Vector3;
  length: number;
}

interface Chain {
  definition: PhysicsChainDefinition;
  particles: Particle[];
  meshes: Object3D[];
  colliders: Collider[];
  visibleLastFrame: boolean;
  previousAnchor: Vector3;
  phase: number;
}

interface Collider {
  id: string;
  object: Object3D;
  offset: Vector3;
  radius: number;
  worldPosition: Vector3;
  worldRadius: number;
  type: 'sphere' | 'plane';
  normal: Vector3;
  worldNormal: Vector3;
}

const MAX_STEP = 1 / 120;
const MAX_FRAME = 1 / 15;
const EPSILON = 1e-10;
const DEFAULTS: PhysicsOptions = {
  enabled: true, hair: true, hood: true, shirt: true, jewelry: true, strength: 1, wind: 0,
};

const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function visibleInHierarchy(object: Object3D): boolean {
  for (let ancestor: Object3D | null = object; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible) return false;
  }
  return true;
}

/**
 * Small deterministic spring chains for exported hair, garment and jewelry bones.
 * Only bone rotations are changed: every authored local attachment/length stays intact.
 * This is secondary motion, not a triangle cloth or strand collision simulation.
 */
export function createAvatarPhysics(avatar: Object3D, manifest: PhysicsManifest): AvatarPhysics {
  if (manifest.version !== 1) throw new Error(`Unsupported physics manifest ${manifest.version}`);
  const options = { ...DEFAULTS };
  const metrics: PhysicsMetrics = {
    activeChains: 0, activeBones: 0, totalChains: 0, totalBones: 0,
    substeps: 0, resets: 0, collisions: 0, maxStretchError: 0, missingObjects: [],
  };
  const missing = new Set<string>();
  const lookup = (name: string) => {
    const object = avatar.getObjectByName(name) ?? avatar.getObjectByName(PropertyBinding.sanitizeNodeName(name));
    if (!object) missing.add(name);
    return object;
  };
  const colliders: Collider[] = manifest.colliders.flatMap(definition => {
    const object = lookup(definition.bone);
    const normal = new Vector3(...(definition.normal ?? [0, 0, 1]));
    if (definition.type === 'plane' && (!normal.toArray().every(Number.isFinite) || normal.lengthSq() < EPSILON)) {
      throw new Error(`Plane collider has an invalid normal: ${definition.id}`);
    }
    return object ? [{
      id: definition.id, object,
      offset: new Vector3(...definition.offset), radius: Math.max(0, finite(definition.radius ?? 0, 0)),
      worldPosition: new Vector3(), worldRadius: 0,
      type: definition.type ?? 'sphere', normal: normal.normalize(), worldNormal: new Vector3(),
    }] : [];
  });
  avatar.updateWorldMatrix(true, true);
  const usedBones = new Set<Object3D>();
  const chains: Chain[] = manifest.chains.flatMap((definition, index) => {
    const particles: Particle[] = [];
    for (const entry of definition.bones) {
      const bone = lookup(entry.name);
      if (!bone) continue;
      if (usedBones.has(bone)) throw new Error(`Spring bone is in multiple chains: ${entry.name}`);
      usedBones.add(bone);
      const tail = new Vector3(...entry.tail);
      if (tail.lengthSq() < EPSILON) throw new Error(`Spring bone has a zero-length tail: ${entry.name}`);
      particles.push({
        bone, tail, rest: bone.quaternion.clone(), position: bone.localToWorld(tail.clone()),
        velocity: new Vector3(), previousHead: bone.getWorldPosition(new Vector3()), length: 0,
      });
    }
    const meshes = definition.meshes.map(lookup).filter((object): object is Object3D => !!object);
    return particles.length ? [{
      definition, particles, meshes,
      colliders: definition.colliderIds ? colliders.filter(c => definition.colliderIds!.includes(c.id)) : colliders,
      visibleLastFrame: false, previousAnchor: new Vector3(), phase: index * 2.39996323,
    }] : [];
  });
  metrics.missingObjects = [...missing];
  metrics.totalChains = chains.length;
  metrics.totalBones = chains.reduce((total, chain) => total + chain.particles.length, 0);

  // Scratch allocations stay outside the hot update loop.
  const head = new Vector3(), target = new Vector3(), direction = new Vector3();
  const restDirection = new Vector3(), tangent = new Vector3(), oldPosition = new Vector3();
  const normal = new Vector3(), anchorDelta = new Vector3(), scale = new Vector3();
  const actualTip = new Vector3(), localDirection = new Vector3(), localRestDirection = new Vector3();
  const identity = new Matrix4(), inverseParent = new Matrix4(), deltaRotation = new Quaternion();
  const normalMatrix = new Matrix3();
  const rootPosition = new Vector3(), lastRootPosition = new Vector3();
  const rootRotation = new Quaternion(), lastRootRotation = new Quaternion();
  let disposed = false;
  let elapsed = 0;

  function restore(chain: Chain) {
    for (const particle of chain.particles) particle.bone.quaternion.copy(particle.rest);
    for (const particle of chain.particles) {
      particle.bone.updateWorldMatrix(true, false);
      particle.bone.getWorldPosition(particle.previousHead);
      particle.position.copy(particle.tail).applyMatrix4(particle.bone.matrixWorld);
      particle.length = particle.position.distanceTo(particle.previousHead);
      particle.velocity.set(0, 0, 0);
    }
    chain.previousAnchor.copy(chain.particles[0].previousHead);
  }

  function reset() {
    if (disposed) return;
    for (const chain of chains) {
      restore(chain);
      chain.visibleLastFrame = false;
    }
    avatar.getWorldPosition(lastRootPosition);
    avatar.getWorldQuaternion(lastRootRotation);
    metrics.resets++;
    metrics.activeChains = 0;
    metrics.activeBones = 0;
    metrics.substeps = 0;
    metrics.collisions = 0;
    metrics.maxStretchError = 0;
  }

  function constrain(particle: Particle, chain: Chain, radius: number, maxAngle: number) {
    const minimumCos = Math.cos(maxAngle), maximumSin = Math.sin(maxAngle);
    // Alternate sphere/length/cone constraints. Anchored segment lengths are invariant.
    for (let iteration = 0; iteration < 4; iteration++) {
      for (const collider of chain.colliders) {
        normal.subVectors(particle.position, collider.worldPosition);
        const minimumDistance = radius + collider.worldRadius;
        if (collider.type === 'plane') {
          const distance = normal.dot(collider.worldNormal);
          if (distance < minimumDistance) {
            particle.position.addScaledVector(collider.worldNormal, minimumDistance - distance);
            if (iteration === 0) metrics.collisions++;
          }
          continue;
        }
        const distanceSquared = normal.lengthSq();
        if (distanceSquared >= minimumDistance * minimumDistance) continue;
        if (distanceSquared < EPSILON) {
          normal.subVectors(head, collider.worldPosition);
          if (normal.lengthSq() < EPSILON) normal.copy(restDirection);
        }
        particle.position.copy(collider.worldPosition).addScaledVector(normal.normalize(), minimumDistance);
        if (iteration === 0) metrics.collisions++;
      }
      direction.subVectors(particle.position, head);
      if (direction.lengthSq() < EPSILON) direction.copy(restDirection);
      else direction.normalize();
      const cosine = clamp(direction.dot(restDirection), -1, 1);
      if (cosine < minimumCos) {
        tangent.copy(direction).addScaledVector(restDirection, -cosine);
        if (tangent.lengthSq() < EPSILON) {
          tangent.set(1, 0, 0).cross(restDirection);
          if (tangent.lengthSq() < EPSILON) tangent.set(0, 0, 1).cross(restDirection);
        }
        direction.copy(restDirection).multiplyScalar(minimumCos).addScaledVector(tangent.normalize(), maximumSin);
      }
      particle.position.copy(head).addScaledVector(direction, particle.length);
    }
  }

  function rotateToParticle(particle: Particle) {
    const bone = particle.bone;
    inverseParent.copy(bone.parent?.matrixWorld ?? identity).invert();
    localDirection.copy(particle.position).applyMatrix4(inverseParent).sub(bone.position).normalize();
    localRestDirection.copy(particle.tail).multiply(bone.scale).applyQuaternion(particle.rest).normalize();
    deltaRotation.setFromUnitVectors(localRestDirection, localDirection);
    bone.quaternion.copy(deltaRotation).multiply(particle.rest).normalize();
    bone.updateWorldMatrix(false, false);
    // Account for even nonuniform parent scale: state follows the actual rigid bone tip.
    actualTip.copy(particle.tail).applyMatrix4(bone.matrixWorld);
    metrics.maxStretchError = Math.max(metrics.maxStretchError, Math.abs(actualTip.distanceTo(head) - particle.length));
    particle.position.copy(actualTip);
  }

  function step(chain: Chain, dt: number, avatarScale: number, firstStep: boolean) {
    const definition = chain.definition;
    const strength = options.strength;
    const stiffness = clamp(finite(definition.stiffness, 60), 1, 600) / Math.max(0.35, strength);
    const damping = Math.exp(-clamp(finite(definition.damping, 7), 0.1, 50) * dt);
    const maxAngle = clamp(finite(definition.maxAngle, 0.4) * strength, 0, 1.3);
    const gravity = definition.gravity ?? [0, -0.08, 0];
    const gust = (0.72 + Math.sin(elapsed * 1.9 + chain.phase) * 0.18 + Math.sin(elapsed * 3.7 + chain.phase) * 0.1)
      * options.wind * strength * avatarScale
      * clamp(finite(definition.windInfluence ?? (definition.category === 'jewelry' ? .08 : 1), 1), 0, 2);
    for (const particle of chain.particles) {
      const bone = particle.bone;
      bone.quaternion.copy(particle.rest);
      bone.updateWorldMatrix(true, false);
      bone.getWorldPosition(head);
      target.copy(particle.tail).applyMatrix4(bone.matrixWorld);
      particle.length = target.distanceTo(head);
      restDirection.subVectors(target, head).normalize();
      if (firstStep && strength < 1) {
        anchorDelta.subVectors(head, particle.previousHead).multiplyScalar(1 - strength);
        particle.position.add(anchorDelta);
      }
      particle.previousHead.copy(head);
      oldPosition.copy(particle.position);
      particle.velocity.addScaledVector(direction.subVectors(target, particle.position), stiffness * dt);
      particle.velocity.x += (gravity[0] * avatarScale * strength + gust * 0.65) * dt;
      particle.velocity.y += gravity[1] * avatarScale * strength * dt;
      particle.velocity.z += (gravity[2] * avatarScale * strength + gust * 0.16 * Math.sin(elapsed + chain.phase)) * dt;
      particle.velocity.multiplyScalar(damping);
      particle.position.addScaledVector(particle.velocity, dt);
      bone.getWorldScale(scale);
      const radius = Math.max(0, finite(definition.radius ?? 0, 0)) * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
      constrain(particle, chain, radius, maxAngle);
      rotateToParticle(particle);
      particle.velocity.subVectors(particle.position, oldPosition).multiplyScalar(1 / dt);
      // Removes radial numerical energy introduced by length/collision projection.
      direction.subVectors(particle.position, head).normalize();
      particle.velocity.addScaledVector(direction, -particle.velocity.dot(direction));
    }
  }

  function update(deltaSeconds: number) {
    if (disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    metrics.activeChains = 0;
    metrics.activeBones = 0;
    metrics.collisions = 0;
    metrics.maxStretchError = 0;
    metrics.substeps = 0;
    avatar.updateWorldMatrix(true, false);
    avatar.getWorldPosition(rootPosition);
    avatar.getWorldQuaternion(rootRotation);
    avatar.getWorldScale(scale);
    const avatarScale = Math.max(EPSILON, (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3);
    const wasTeleported = rootPosition.distanceTo(lastRootPosition) > 0.65 * avatarScale
      || rootRotation.angleTo(lastRootRotation) > Math.PI * 0.65;
    // Long suspended tabs and discontinuous tracking changes resume in a stable rest pose.
    if (deltaSeconds > 0.25 || wasTeleported) {
      reset();
      return;
    }
    lastRootPosition.copy(rootPosition);
    lastRootRotation.copy(rootRotation);
    const frame = Math.min(MAX_FRAME, deltaSeconds);
    const substeps = Math.max(1, Math.ceil(frame / MAX_STEP));
    const dt = frame / substeps;
    const active: Chain[] = [];
    for (const chain of chains) {
      const enabled = options.enabled && options[chain.definition.category] && options.strength > 0
        && chain.meshes.some(visibleInHierarchy);
      if (!enabled) {
        if (chain.visibleLastFrame) restore(chain);
        chain.visibleLastFrame = false;
        continue;
      }
      if (!chain.visibleLastFrame) restore(chain);
      chain.particles[0].bone.getWorldPosition(head);
      // Also catch a head/body teleport inside an otherwise stationary avatar root.
      const span = chain.particles.reduce((total, particle) => total + particle.length, 0);
      if (head.distanceTo(chain.previousAnchor) > Math.max(span * 2.5, 0.25 * avatarScale)) restore(chain);
      chain.previousAnchor.copy(head);
      chain.visibleLastFrame = true;
      active.push(chain);
      metrics.activeChains++;
      metrics.activeBones += chain.particles.length;
    }
    if (!active.length) return;
    metrics.substeps = substeps;
    for (const collider of colliders) {
      collider.object.updateWorldMatrix(true, false);
      collider.worldPosition.copy(collider.offset).applyMatrix4(collider.object.matrixWorld);
      collider.object.getWorldScale(scale);
      collider.worldRadius = collider.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
      if (collider.type === 'plane') collider.worldNormal.copy(collider.normal).applyMatrix3(normalMatrix.getNormalMatrix(collider.object.matrixWorld)).normalize();
    }
    for (let substep = 0; substep < substeps; substep++) {
      elapsed += dt;
      for (const chain of active) step(chain, dt, avatarScale, substep === 0);
    }
  }

  reset();
  return {
    update, reset,
    get options() { return { ...options }; },
    get metrics() { return { ...metrics, missingObjects: [...metrics.missingObjects] }; },
    setOptions(next) {
      if (disposed) return;
      for (const key of ['enabled', 'hair', 'hood', 'shirt', 'jewelry'] as const) {
        if (typeof next[key] === 'boolean') options[key] = next[key];
      }
      if (next.strength !== undefined) options.strength = clamp(finite(next.strength, 1), 0, 2);
      if (next.wind !== undefined) options.wind = clamp(finite(next.wind, 0), -1, 1);
      if (!options.enabled || options.strength === 0) reset();
    },
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
    },
  };
}
