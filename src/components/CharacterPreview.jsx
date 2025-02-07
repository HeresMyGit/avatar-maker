import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Environment, useAnimations } from '@react-three/drei';
import { TRAIT_CATEGORIES } from '../config/traits';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

const GLB_URL = "https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/builders/mfermashup.glb";

// Helper function to get type-specific mouth
const getTypeMouth = (mouthType, bodyType) => {
  if (bodyType === 'metal') return `${mouthType}_metal`;
  if (bodyType === 'based_mfer') return `${mouthType}_mfercoin`;
  return mouthType;
};

// Mapping of trait categories and their IDs to required mesh names
const TRAIT_MESH_MAPPING = {
  watch: {
    'sub_lantern_green': ['watch_sub_lantern_green', 'watch_sub_strap_white'],
    'sub_blue': ['watch_sub_blue', 'watch_sub_strap_white'],
    'argo_white': ['watch_argo_white'],
    'sub_cola': ['watch_sub_cola_blue_red', 'watch_sub_strap_white'],
    'sub_turquoise': ['watch_sub_turquoise', 'watch_sub_strap_white'],
    'sub_bat': ['watch_sub_bat_blue_black', 'watch_sub_strap_white'],
    'oyster_silver': ['watch_oyster_silver', 'watch_sub_strap_white'],
    'oyster_gold': ['watch_oyster_gold', 'watch_sub_strap_gold'],
    'argo_black': ['watch_argo_black'],
    'sub_black': ['watch_sub_black', 'watch_sub_strap_white'],
    'sub_rose': ['watch_sub_rose', 'watch_sub_strap_white'],
    'timex': ['watch_timex'],
    'sub_red': ['watch_sub_red', 'watch_sub_strap_gray']
  },

  beard: {
    'full': ['beard'],
    'flat': ['beard_flat']
  },

  chain: {
    'silver': ['chain_silver'],
    'gold': ['chain_gold'],
    'onchain': ['chain_onchain']
  },

  eyes: {
    'nerd': ['eyes_normal', 'eyes_glasses', 'eyes_glasses_nerd'],
    'purple_shades': ['eyes_normal', 'eyes_glasses', 'eyes_glasses_purple'],
    '3d': ['eyes_normal', 'eyes_glases_3d', 'eyes_glasses_3d_lenses', 'eyes_glases_3d_rim'],
    'eye_mask': ['eyes_normal', 'eyes_eye_mask'],
    'vr': ['eyes_normal', 'eyes_vr', 'eyes_vr_lense'],
    'zombie': ['eyes_zombie'],
    'shades': ['eyes_normal', 'eyes_glasses', 'eyes_glasses_shades'],
    'matrix': ['eyes_normal', 'eyes_glasses', 'eyes_glasses_shades_matrix'],
    'trippy': ['eyes_normal', 'eyes_glasses', 'eyes_glasses_shades_s34n'],
    'regular': ['eyes_normal'],
    'metal': ['eyes_metal'],
    'mfercoin': ['eyes_mfercoin'],
    'red': ['eyes_red'],
    'alien': ['eyes_alien'],
    'eyepatch': ['eyes_normal', 'eyes_eye_patch']
  },

  hat_over_headphones: {
    'cowboy': ['hat_cowboy_hat'],
    'top': ['hat_tophat', 'hat_tophat_red'],
    'pilot': ['hat_pilot_cap', 'hat_pilot_cap_rims', 'hat_pilot_cap_glasses'],
    'hoodie_gray': ['shirt_hoodie_up_dark_gray', 'shirt_hoodie_dark_gray'],
    'hoodie_pink': ['shirt_hoodie_up_pink', 'shirt_hoodie_pink'],
    'hoodie_red': ['shirt_hoodie_up_red', 'shirt_hoodie_red'],
    'hoodie_blue': ['shirt_hoodie_up_blue', 'shirt_hoodie_blue'],
    'hoodie_white': ['shirt_hoodie_up_white', 'shirt_hoodie_white'],
    'hoodie_green': ['shirt_hoodie_up_green', 'shirt_hoodie_green'],
    'larva_mfer': ['larmf-lowpoly', 'larmf-lowpoly_1', 'larmf-lowpoly_2', 'larmf-lowpoly_3', 'larmf-lowpoly_4', 'larmf-lowpoly_5', 'larmf-lowpoly_6']
  },

  hat_under_headphones: {
    'bandana_dark_gray': ['hat_bandana_dark_gray'],
    'knit_kc': ['hat_knit_kc'],
    'headband_blue_green': ['headband_blue_green'],
    'headband_green_white': ['headband_green_white'],
    'knit_las_vegas': ['hat_knit_las_vegas'],
    'cap_monochrome': ['cap_monochrome'],
    'knit_new_york': ['hat_knit_new_york'],
    'cap_based_blue': ['cap_based_blue'],
    'cap_purple': ['cap_purple'],
    'knit_san_fran': ['hat_knit_san_fran'],
    'knit_miami': ['hat_knit_miami'],
    'knit_chicago': ['hat_knit_chicago'],
    'knit_atlanta': ['hat_knit_atlanta'],
    'bandana_red': ['hat_bandana_red'],
    'knit_cleveland': ['hat_knit_cleveland'],
    'headband_blue_red': ['headband_blue_red'],
    'knit_dallas': ['hat_knit_dallas'],
    'beanie_monochrome': ['hat_beanie_monochrome'],
    'headband_pink_white': ['headband_pink_white'],
    'beanie': ['hat_beanie'],
    'knit_baltimore': ['hat_knit_baltimore'],
    'knit_buffalo': ['hat_knit_buffalo'],
    'bandana_blue': ['hat_bandana_blue'],
    'headband_blue_white': ['headband_blue_white'],
    'knit_pittsburgh': ['hat_knit_pittsburgh']
  },

  headphones: {
    'lined': ['headphones_lined'],
    'gold': ['headphones_gold'],
    'blue': ['headphones_blue'],
    'black': ['headphones_black'],
    'pink': ['headphones_pink'],
    'green': ['headphones_green'],
    'white': ['headphones_white'],
    'red': ['headphones_red'],
    'black_square': ['headphones_square_black'],
    'blue_square': ['headphones_square_blue'],
    'gold_square': ['headphones_square_gold']
  },

  long_hair: {
    'long_yellow': ['hair_long_light'],
    'long_black': ['hair_long_dark'],
    'long_curly': ['hair_long_curly']
  },

  mouth: {
    'smile': ['mouth_smile'],
    'flat': ['mouth_flat']
  },

  shirt: {
    'collared_pink': ['shirt_collared_pink'],
    'collared_green': ['shirt_collared_green'],
    'collared_yellow': ['shirt_collared_yellow'],
    'hoodie_down_red': ['shirt_hoodie_down_red', 'shirt_hoodie_red'],
    'hoodie_down_pink': ['shirt_hoodie_down_pink', 'shirt_hoodie_pink'],
    'collared_white': ['shirt_collared_white'],
    'collared_turquoise': ['shirt_collared_turquoise'],
    'collared_blue': ['shirt_collared_blue'],
    'hoodie_down_white': ['shirt_hoodie_down_white', 'shirt_hoodie_white'],
    'hoodie_down_green': ['shirt_hoodie_down_green', 'shirt_hoodie_green'],
    'hoodie_down_gray': ['shirt_hoodie_down_dark_gray', 'shirt_hoodie_dark_gray'],
    'hoodie_down_blue': ['shirt_hoodie_down_blue', 'shirt_hoodie_blue']
  },

  shoes_and_gloves: {
    'green': ['accessories_christmas_green'],
    'graveyard': ['accessories_christmas_graveyard'],
    'red': ['accessories_christmas_red'],
    'tree': ['accessories_christmas_tree'],
    'teal': ['accessories_christmas_teal'],
    'turquoise': ['accessories_christmas_turquoise'],
    'purple': ['accessories_christmas_purple'],
    'space': ['accessories_christmas_space'],
    'orange': ['accessories_christmas_orange'],
    'blue': ['accessories_christmas_blue'],
    'yellow': ['accessories_christmas_yellow']
  },

  short_hair: {
    'mohawk_purple': ['hair_short_mohawk_purple'],
    'mohawk_red': ['hair_short_mohawk_red'],
    'mohawk_pink': ['hair_short_mohawk_pink'],
    'mohawk_black': ['hair_short_mohawk_black'],
    'mohawk_yellow': ['hair_short_mohawk_yellow'],
    'messy_black': ['hair_short_messy_black'],
    'mohawk_green': ['hair_short_mohawk_green'],
    'messy_yellow': ['hair_short_messy_yellow'],
    'mohawk_blue': ['hair_short_mohawk_blue'],
    'messy_red': ['hair_short_messy_red'],
    'messy_purple': ['hair_short_messy_purple'],
    'messy_black_ape': ['hair_short_messy_black_ape'],
    'messy_yellow_ape': ['hair_short_messy_yellow_ape'],
    'messy_red_ape': ['hair_short_messy_red_ape'],
    'messy_purple_ape': ['hair_short_messy_purple_ape']
  },

  smoke: {
    'pipe': ['smoke_pipe'],
    'pipe_brown': ['smoke_pipe_brown'],
    'cig_white': ['smoke_cig_white', 'smoke'],
    'cig_black': ['smoke_cig_black', 'smoke']
  },

  type: {
    'alien': ['type_alien', 'body', 'heres_my_signature'],
    'charcoal': ['type_charcoal', 'body', 'heres_my_signature'],
    'ape': ['type_ape', 'body', 'heres_my_signature'],
    'plain': ['type_plain', 'body', 'heres_my_signature'],
    'zombie': ['type_zombie', 'body', 'heres_my_signature'],
    'metal': ['type_metal', 'body_metal', 'heres_my_signature'],
    'based': ['type_based_mfer', 'body_mfercoin', 'heres_my_signature']
  }
};

const CharacterPreview = forwardRef(({ selectedTraits }, ref) => {
  const groupRef = useRef();
  const { scene: threeScene } = useThree();
  const [modelLoaded, setModelLoaded] = useState(false);
  const { scene, nodes, animations } = useGLTF(GLB_URL);
  const animationRef = useRef();
  const sceneRootRef = useRef();

  // Set up model with SkeletonUtils
  useEffect(() => {
    // Clear existing scene first
    if (groupRef.current) {
      while (groupRef.current.children.length > 0) {
        const child = groupRef.current.children[0];
        groupRef.current.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    }

    if (!scene) return;

    // Clone the entire scene using SkeletonUtils
    const clonedScene = SkeletonUtils.clone(scene);
    sceneRootRef.current = clonedScene;

    // Set all meshes to invisible initially
    clonedScene.traverse((obj) => {
      if (obj.isMesh) {
        obj.visible = false;
      }
    });

    // Add cloned scene to group
    groupRef.current.add(clonedScene);

    // Set up animation
    if (animations && animations.length > 0) {
      const mixer = new THREE.AnimationMixer(clonedScene);
      const clip = animations[0].clone();
      const action = mixer.clipAction(clip);
      action.play();
      animationRef.current = { mixer, action };
    }

    setModelLoaded(true);

    // Cleanup
    return () => {
      if (animationRef.current) {
        animationRef.current.action.stop();
        animationRef.current.mixer.stopAllAction();
        animationRef.current.mixer.uncacheRoot(clonedScene);
      }
      
      if (groupRef.current) {
        while (groupRef.current.children.length > 0) {
          const child = groupRef.current.children[0];
          groupRef.current.remove(child);
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
      }
    };
  }, [scene, animations]);

  // Update visibility of traits when selections change
  useEffect(() => {
    if (!modelLoaded || !sceneRootRef.current) return;

    // First, hide all meshes
    sceneRootRef.current.traverse((obj) => {
      if (obj.isMesh) {
        obj.visible = false;
      }
    });

    // Create a Set of all meshes that should be visible
    const meshesToShow = new Set();

    // Process each trait category
    Object.entries(selectedTraits).forEach(([traitType, traitId]) => {
      const normalizedTraitId = normalizeTraitId(traitType, traitId);
      if (!normalizedTraitId || !TRAIT_MESH_MAPPING[traitType]) return;
      
      let meshNames = TRAIT_MESH_MAPPING[traitType][normalizedTraitId];
      if (!meshNames) {
        console.warn(`No mesh mapping found for trait: ${normalizedTraitId} in category ${traitType}`);
        return;
      }

      // Handle special case for mouths with different body types
      if (traitType === 'mouth' && selectedTraits.type) {
        const bodyType = selectedTraits.type;
        meshNames = meshNames.map(name => {
          if (name.startsWith('mouth_')) {
            return getTypeMouth(name, bodyType);
          }
          return name;
        });
      }

      // Add all mesh names for this trait to the Set
      meshNames.forEach(meshName => {
        meshesToShow.add(meshName);
      });
    });

    // Show only the meshes in our Set
    sceneRootRef.current.traverse((obj) => {
      if (obj.isMesh) {
        obj.visible = meshesToShow.has(obj.name);
      }
    });
  }, [selectedTraits, modelLoaded]);

  // Update animation
  useFrame((state, delta) => {
    if (animationRef.current) {
      animationRef.current.mixer.update(delta);
    }
  });

  // Helper function to check if a mesh belongs to a category
  const meshBelongsToCategory = (meshName, category) => {
    const prefixes = CATEGORY_MESH_PREFIXES[category] || [];
    return prefixes.some(prefix => meshName.toLowerCase().startsWith(prefix.toLowerCase()));
  };

  // Debug function to log mesh visibility
  const logMeshVisibility = () => {
    const visibleMeshes = [];
    groupRef.current.traverse((obj) => {
      if (obj.isMesh && obj.visible) {
        visibleMeshes.push(obj.name);
      }
    });
    console.log('Visible meshes:', visibleMeshes);
  };

  function normalizeTraitId(traitType, traitId) {
    // Removed the normalization for hat_over_headphones so that "larva mfer" stays as "larva mfer"
    return traitId;
  }

  // Export functionality
  const exportScene = async () => {
    if (!modelLoaded) return;

    // Create a new scene for the export
    const exportScene = new THREE.Scene();
    
    // Clone the current state using SkeletonUtils
    const clonedScene = SkeletonUtils.clone(sceneRootRef.current);
    exportScene.add(clonedScene);

    // Clone animations
    const exportAnimations = animations.map(anim => anim.clone());

    // Create an exporter with specific options
    const exporter = new GLTFExporter();
    const options = {
      binary: true,
      animations: exportAnimations,
      includeCustomExtensions: true,
      embedImages: true,
      onlyVisible: true
    };

    try {
      const gltfData = await new Promise((resolve, reject) => {
        exporter.parse(
          exportScene,
          (gltf) => resolve(gltf),
          (error) => reject(error),
          options
        );
      });

      // Create a blob and download link
      const blob = new Blob([gltfData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mfer-character.glb';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      // Cleanup
      exportScene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  };

  // Expose the exportScene method to the parent component
  useImperativeHandle(ref, () => ({
    exportScene
  }));

  return (
    <>
      <PerspectiveCamera 
        makeDefault 
        position={[-0.3, 1.2, 1.4]} 
        fov={35}
      />
      
      <OrbitControls 
        enableZoom={true} 
        enablePan={true}
        minDistance={1.0}
        maxDistance={2.5}
        target={[0, 1.0, 0]}
        enableDamping={true}
        dampingFactor={0.05}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.5}
        minAzimuthAngle={-Math.PI}
        maxAzimuthAngle={Math.PI}
        rotateSpeed={0.7}
      />
      
      <ambientLight intensity={0.3} />
      
      <directionalLight 
        position={[2, 2, 2]} 
        intensity={0.8} 
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      
      <directionalLight 
        position={[-1.5, 1, -1]} 
        intensity={0.4} 
        color="#b4c7ff"
      />
      
      <spotLight
        position={[0, 2, -2.5]}
        intensity={0.35}
        angle={0.6}
        penumbra={1}
        color="#ffffff"
      />
      
      <pointLight
        position={[0, 0.5, 1.5]}
        intensity={0.2}
        distance={3}
        color="#b4c7ff"
      />

      <Environment preset="studio" />
      
      <group ref={groupRef} />
    </>
  );
});

// Preload the GLB file
useGLTF.preload(GLB_URL);

export default CharacterPreview; 