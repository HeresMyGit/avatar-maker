import { BufferGeometry, Float32BufferAttribute, Matrix4, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';

/**
 * Restore non-rendering attachment samples from a selected-avatar export.
 * Call once, before createMouthProps/createTongue; dispose after those controllers.
 * These are sampled neutral vertices, not an extra visible mouth trait.
 */
export function hydrateAvatarReferences(avatar) {
  const metadata = avatar.userData.mferRuntimeReferences;
  const meshes = [];
  if (!metadata) return { meshes, dispose() {} };
  if (metadata.version !== 1) throw new Error('Unsupported avatar reference data.');
  try {
    for (const entry of metadata.meshes) {
      if (avatar.getObjectByName(entry.name)) continue;
      const parent = entry.parentName ? avatar.getObjectByName(entry.parentName) : avatar;
      const bones = entry.bones.map(name => avatar.getObjectByName(name));
      if (!parent || bones.some(bone => !bone?.isBone)) throw new Error(`Missing attachment reference skeleton: ${entry.name}`);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(entry.positions, 3));
      geometry.setAttribute('skinIndex', new Uint16BufferAttribute(entry.skinIndices, 4));
      geometry.setAttribute('skinWeight', new Float32BufferAttribute(entry.skinWeights, 4));
      const material = new MeshBasicMaterial();
      const mesh = new SkinnedMesh(geometry, material);
      mesh.name = entry.name;
      mesh.position.fromArray(entry.position);
      mesh.quaternion.fromArray(entry.quaternion);
      mesh.scale.fromArray(entry.scale);
      mesh.visible = false;
      mesh.userData.mferAttachmentReference = true;
      parent.add(mesh);
      mesh.updateWorldMatrix(true, false);
      mesh.bind(new Skeleton(bones, entry.boneInverses.map(values => new Matrix4().fromArray(values))),
        new Matrix4().fromArray(entry.bindMatrix));
      mesh.bindMode = entry.bindMode;
      mesh.updateMatrixWorld(true);
      meshes.push(mesh);
    }
  } catch (error) {
    for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); mesh.skeleton.dispose(); }
    throw error;
  }
  let disposed = false;
  return {
    meshes,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); mesh.skeleton.dispose(); }
    },
  };
}
