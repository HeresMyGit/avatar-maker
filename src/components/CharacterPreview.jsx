import { useRef, useEffect, useState, forwardRef, useImperativeHandle, Suspense, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Environment, useAnimations, Text } from '@react-three/drei';
import { TRAIT_CATEGORIES } from '../config/traits';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import styled from '@emotion/styled';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

// Add retry constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const GLB_URL = new URL("https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/builders/mfermashup.glb").toString();
const EXPORT_GLB_URL = new URL("https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/builders/mfermashup-t.glb").toString();
const LOADING_MODEL_URL = "/avatar-maker/sartoshi-head.glb";

// Create a model manager to handle loading and caching
const modelManager = {
  loadedModels: new Map(),
  currentLoadingPromise: null,
  
  loadModel: async (url) => {
    console.log('Starting model load:', url);
    
    // If there's already a loading promise, return it
    if (modelManager.currentLoadingPromise) {
      console.log('Using existing load promise');
      return modelManager.currentLoadingPromise;
    }

    // If model is already loaded, return it
    if (modelManager.loadedModels.has(url)) {
      console.log('Using cached model');
      return modelManager.loadedModels.get(url);
    }

    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');

    // Create new loading promise
    modelManager.currentLoadingPromise = new Promise((resolve, reject) => {
      try {
        console.log('Loading model...');
        loader.load(
          url,
          (gltf) => {
            try {
              console.log('Model loaded, processing...');
              
              // Basic scene optimization
              gltf.scene.traverse((obj) => {
                if (obj.isMesh) {
                  // Optimize geometry
                  if (obj.geometry) {
                    obj.geometry.dispose();
                    obj.geometry = obj.geometry.clone(); // Create fresh geometry
                    obj.geometry.attributes.position.needsUpdate = true;
                  }
                  
                  // Optimize materials
                  if (obj.material) {
                    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                    materials.forEach(mat => {
                      // Remove unused properties
                      ['lightMap', 'aoMap', 'emissiveMap'].forEach(prop => {
                        if (mat[prop]) {
                          mat[prop].dispose();
                          mat[prop] = null;
                        }
                      });
                      
                      // Force material update
                      mat.needsUpdate = true;
                    });
                  }
                }
              });

              // Create optimized clone
              const clonedScene = SkeletonUtils.clone(gltf.scene);
              const clonedAnimations = gltf.animations.map(anim => anim.clone());
              
              const model = {
                scene: clonedScene,
                animations: clonedAnimations
              };
              
              modelManager.loadedModels.set(url, model);
              console.log('Model processed and cached');
              resolve(model);
            } catch (error) {
              console.error('Error processing model:', error);
              reject(error);
            }
          },
          (progress) => {
            if (progress.lengthComputable) {
              const percent = (progress.loaded / progress.total * 100).toFixed(1);
              console.log(`Loading progress: ${percent}%`);
            }
          },
          (error) => {
            console.error('Model loading error:', error);
            reject(error);
          }
        );
      } catch (error) {
        console.error('Error in loader setup:', error);
        reject(error);
      }
    });

    try {
      const result = await modelManager.currentLoadingPromise;
      modelManager.currentLoadingPromise = null;
      return result;
    } catch (error) {
      modelManager.currentLoadingPromise = null;
      throw error;
    }
  },

  disposeModel: (url) => {
    console.log('Disposing model:', url);
    const model = modelManager.loadedModels.get(url);
    if (model) {
      try {
        model.scene.traverse((obj) => {
          if (obj.geometry) {
            obj.geometry.dispose();
          }
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(mat => {
                Object.values(mat).forEach(value => {
                  if (value && typeof value === 'object' && 'dispose' in value) {
                    value.dispose();
                  }
                });
                mat.dispose();
              });
            } else {
              Object.values(obj.material).forEach(value => {
                if (value && typeof value === 'object' && 'dispose' in value) {
                  value.dispose();
                }
              });
              obj.material.dispose();
            }
          }
        });
        modelManager.loadedModels.delete(url);
        console.log('Model disposed');
      } catch (error) {
        console.error('Error disposing model:', error);
      }
    }
  }
};

// Create a custom texture loader hook
const useTextureLoader = () => {
  const { gl } = useThree();
  return useMemo(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    return loader;
  }, [gl]);
};

// Create a hook for loading textures with retry
const useLoadTextureWithRetry = () => {
  const loader = useTextureLoader();
  
  return useMemo(() => (url, retries = MAX_RETRIES) => {
    return new Promise((resolve, reject) => {
      // Keep track of blob URLs to clean up
      const blobUrls = new Set();
      
      const cleanup = () => {
        blobUrls.forEach(url => {
          try {
            URL.revokeObjectURL(url);
          } catch (e) {
            console.warn('Error cleaning up blob URL:', e);
          }
        });
        blobUrls.clear();
      };

      const attemptLoad = async (attemptsLeft) => {
        try {
          // If URL is a blob URL, try to fetch it first to ensure it's still valid
          if (url.startsWith('blob:')) {
            blobUrls.add(url);
            const response = await fetch(url);
            const blob = await response.blob();
            // Create a new blob URL that we control
            url = URL.createObjectURL(blob);
            blobUrls.add(url);
          }

          loader.load(
            url,
            (texture) => {
              try {
                // Ensure texture is properly initialized
                texture.needsUpdate = true;
                texture.encoding = THREE.sRGBEncoding;
                
                // Set good defaults for common texture properties
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.flipY = false;
                
                // Only clean up blob URLs after texture is successfully loaded
                cleanup();
                resolve(texture);
              } catch (error) {
                console.warn('Error initializing texture:', error);
                if (attemptsLeft > 0) {
                  console.log(`Retrying texture initialization (${attemptsLeft} attempts left)`);
                  setTimeout(() => attemptLoad(attemptsLeft - 1), RETRY_DELAY);
                } else {
                  cleanup();
                  reject(error);
                }
              }
            },
            (progressEvent) => {
              if (progressEvent.lengthComputable) {
                const progress = (progressEvent.loaded / progressEvent.total * 100).toFixed(1);
                if (progress % 20 === 0) {
                  console.log(`Loading texture: ${progress}%`);
                }
              }
            },
            async (error) => {
              console.warn(`Texture load error (${attemptsLeft} attempts left):`, error);
              if (attemptsLeft > 0) {
                // Clean up the current blob URL before retrying
                cleanup();
                console.log(`Retrying texture load in ${RETRY_DELAY}ms...`);
                setTimeout(() => attemptLoad(attemptsLeft - 1), RETRY_DELAY);
              } else {
                console.warn('Creating fallback texture after all retries failed');
                cleanup();
                
                // Create a simple fallback texture
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#808080';
                ctx.fillRect(0, 0, 64, 64);
                
                const fallbackTexture = new THREE.Texture(canvas);
                fallbackTexture.needsUpdate = true;
                resolve(fallbackTexture);
              }
            }
          );
        } catch (error) {
          console.error('Error in texture load attempt:', error);
          if (attemptsLeft > 0) {
            cleanup();
            setTimeout(() => attemptLoad(attemptsLeft - 1), RETRY_DELAY);
          } else {
            cleanup();
            reject(error);
          }
        }
      };
      
      attemptLoad(retries);
    });
  }, [loader]);
};

// Instead, use Text component from @react-three/drei for 3D text
const LoadingText = ({ children }) => (
  <Text
    position={[0, 0.4, 0]}
    fontSize={0.3}
    color="white"
    anchorX="center"
    anchorY="middle"
    font="/avatar-maker/SartoshiScript-Regular.otf"
    outlineWidth={0.02}
    outlineColor="black"
  >
    {children}
  </Text>
);

// Helper function to normalize trait IDs
const normalizeTraitId = (traitType, traitId) => {
  if (!traitId) return null;
  return traitId;
};

// Helper function to get type-specific mouth
const getTypeMouth = (mouthType, bodyType) => {
  if (bodyType === 'metal') return `${mouthType}_metal`;
  if (bodyType === 'based') return `${mouthType}_mfercoin`;
  return mouthType;
};

// Helper function to get type-specific eyes
const getTypeEyes = (eyesType, bodyType) => {
  // Base eyeball types that can be manually selected (removed zombie)
  const baseEyeTypes = ['eyes_normal', 'eyes_metal', 'eyes_mfercoin', 'eyes_alien', 'eyes_red'];
  
  // If the selected eye type is a base type, use it directly
  if (baseEyeTypes.includes(eyesType)) {
    return eyesType;
  }
  
  // For accessories (glasses, etc), use the character type's default eyes
  const defaultEyes = bodyType === 'metal' ? 'eyes_metal' :
                     bodyType === 'based' ? 'eyes_mfercoin' :
                     bodyType === 'zombie' ? 'eyes_zombie' :
                     bodyType === 'alien' ? 'eyes_alien' :
                     'eyes_normal';
  
  return defaultEyes;
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
    'shades': ['eyes_normal', 'eyes_glasses', 'eyes_glasses_shades'],
    'matrix': ['eyes_normal', 'eyes_glasses', 'eyes_glasses_shades_matrix'],
    'trippy': ['eyes_normal', 'eyes_glasses', 'eyes_glasses_shades_s34n'],
    'regular': ['eyes_normal'],
    'metal': ['eyes_metal'],
    'mfercoin': ['eyes_mfercoin'],
    'red': ['eyes_red'],
    'alien': ['eyes_alien'],
    'zombie': ['eyes_zombie'],
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
    // Hidden ape versions (only used by trait rules)
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

// Loading model component with manual loading
const LoadingModel = () => {
  const groupRef = useRef();
  const modelRef = useRef(null);
  const loadTexture = useLoadTextureWithRetry();

  useEffect(() => {
    let isMounted = true;
    console.log('🔄 Loading view mounted');

    const loadModel = async () => {
      try {
        console.log('🔄 Loading view - Loading placeholder model');
        const model = await modelManager.loadModel(LOADING_MODEL_URL);
        
        if (!isMounted) {
          console.log('🔄 Loading view - Component unmounted during load, aborting');
          return;
        }

        const clonedScene = SkeletonUtils.clone(model.scene);
        clonedScene.scale.set(0.8, 0.8, 0.8);
        clonedScene.position.set(0, 0.9, 0);
        clonedScene.rotation.y = -Math.PI/2;

        modelRef.current = { scene: clonedScene };
        
        if (groupRef.current) {
          console.log('🔄 Loading view - Adding placeholder model to scene');
          groupRef.current.clear();
          groupRef.current.add(clonedScene);
        }
      } catch (error) {
        console.error('🔄 Loading view - Error loading placeholder model:', error);
      }
    };

    loadModel();

    return () => {
      console.log('🔄 Loading view - Unmounting and cleaning up');
      isMounted = false;
      if (modelRef.current) {
        modelRef.current.scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(mat => mat.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });
      }
    };
  }, [loadTexture]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <>
      <group ref={groupRef} />
      <LoadingText>loading...</LoadingText>
    </>
  );
};

// Main model component
const MainModel = ({ selectedTraits, onLoad, onError, sceneRef }) => {
  const groupRef = useRef();
  const modelRef = useRef(null);
  const mixerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMobile = window.innerWidth <= 768;
  const { gl } = useThree();

  // Animation setup function
  const setupAnimation = (scene, animations) => {
    try {
      if (!animations || animations.length === 0) {
        console.warn('No animations found in model');
        return null;
      }

      console.log('Setting up animation mixer');
      const mixer = new THREE.AnimationMixer(scene);
      
      // Find the idle animation
      const idleClip = animations.find(clip => clip.name.toLowerCase().includes('idle')) || animations[0];
      console.log('Using animation clip:', idleClip.name);
      
      const action = mixer.clipAction(idleClip);
      
      // Configure the animation
      action.setLoop(THREE.LoopRepeat);
      action.clampWhenFinished = false;
      action.timeScale = 1.0;
      
      // Play the animation
      action.reset().play();
      
      return mixer;
    } catch (error) {
      console.error('Error setting up animation:', error);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const loadModel = async () => {
      try {
        console.log('Starting model load process');
        setIsLoading(true);

        // Clear old model if it exists
        if (modelRef.current) {
          console.log('Cleaning up old model');
          if (mixerRef.current) {
            mixerRef.current.stopAllAction();
            mixerRef.current.uncacheRoot(mixerRef.current.getRoot());
            mixerRef.current = null;
          }
          modelRef.current = null;
        }

        console.log('Loading model from manager');
        const model = await modelManager.loadModel(GLB_URL);
        
        if (!isMounted) {
          console.log('Component unmounted during load');
          return;
        }

        console.log('Creating scene clone');
        const clonedScene = SkeletonUtils.clone(model.scene);
        const clonedAnimations = model.animations.map(anim => anim.clone());

        // Log available animations
        console.log('Available animations:', clonedAnimations.map(a => a.name));

        modelRef.current = {
          scene: clonedScene,
          animations: clonedAnimations
        };

        if (groupRef.current) {
          console.log('Updating scene group');
          groupRef.current.clear();
          groupRef.current.add(clonedScene);
        }

        sceneRef.current = clonedScene;
        
        // Setup animation (not mobile-dependent anymore)
        if (clonedAnimations.length > 0) {
          console.log('Setting up animations');
          mixerRef.current = setupAnimation(clonedScene, clonedAnimations);
        }

        console.log('Updating mesh visibility');
        updateMeshVisibility();
        
        // Wait for next frame to ensure everything is initialized
        requestAnimationFrame(() => {
          console.log('Model fully initialized and ready');
          setIsLoading(false);
          onLoad(modelRef.current);
        });
      } catch (error) {
        console.error('Model loading error:', error);
        if (retryCount < MAX_RETRIES && isMounted) {
          retryCount++;
          console.log(`Retrying model load (${retryCount}/${MAX_RETRIES})`);
          setTimeout(loadModel, 1000);
        } else if (isMounted) {
          onError(error);
        }
      }
    };

    loadModel();

    return () => {
      console.log('Component cleanup');
      isMounted = false;
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current.uncacheRoot(mixerRef.current.getRoot());
        mixerRef.current = null;
      }
      if (modelRef.current) {
        modelRef.current.scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(mat => mat.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });
        modelRef.current = null;
      }
    };
  }, [onLoad, onError]);

  // Update animation mixer in render loop (removed mobile check)
  useFrame((state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  // Function to update mesh visibility based on selected traits
  const updateMeshVisibility = () => {
    if (!sceneRef.current) return;

    // First, hide all meshes
    sceneRef.current.traverse((obj) => {
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
      if (traitType === 'mouth') {
        const bodyType = selectedTraits.type;
        meshNames = meshNames.map(name => {
          if (name.startsWith('mouth_')) {
            return getTypeMouth(name, bodyType);
          }
          return name;
        });
      }

      // Handle special case for eyes with different body types
      if (traitType === 'eyes') {
        const bodyType = selectedTraits.type;
        const originalMeshes = [...meshNames];
        meshNames = [];

        const selectedEyeType = normalizedTraitId ? `eyes_${normalizedTraitId}` : 'eyes_normal';
        const baseEyeType = getTypeEyes(selectedEyeType, bodyType);
        const baseEyeMeshes = [baseEyeType];
        meshNames.push(...baseEyeMeshes);

        originalMeshes.forEach(name => {
          if (!name.includes('eyes_normal') && 
              !name.includes('eyes_metal') && 
              !name.includes('eyes_mfercoin') && 
              !name.includes('eyes_zombie') && 
              !name.includes('eyes_alien') && 
              !name.includes('eyes_red')) {
            meshNames.push(name);
          }
        });
      }

      // Add all mesh names for this trait to the Set
      meshNames.forEach(meshName => {
        meshesToShow.add(meshName);
      });
    });

    // Show only the meshes in our Set
    sceneRef.current.traverse((obj) => {
      if (obj.isMesh) {
        obj.visible = meshesToShow.has(obj.name);
      }
    });
  };

  return <group ref={groupRef} />;
};

const CharacterPreview = forwardRef(({ selectedTraits, themeColor: themecolor }, ref) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [showLoadingModel, setShowLoadingModel] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const sceneRootRef = useRef();
  const mainModelRef = useRef(null);
  const exportLockRef = useRef(false);
  const { gl, scene, camera } = useThree();

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle model loading sequence
  const handleModelLoad = (modelRef) => {
    console.log('📦 Main model loaded, waiting for full initialization...');
    
    // Store the model reference
    mainModelRef.current = modelRef;
    
    // Don't hide loading view until model is fully loaded and processed
    if (!mainModelRef.current || !mainModelRef.current.scene) {
      console.log('📦 Model not fully initialized, keeping loading view...');
      return;
    }
    
    // Add a small delay to ensure the model is fully rendered
    setTimeout(() => {
      console.log('📦 Setting final states:', {
        modelLoaded: true,
        showLoadingModel: false,
        loadError: false
      });
      setModelLoaded(true);
      setLoadError(false);
      setShowLoadingModel(false);
      exportLockRef.current = false;
    }, 1000);
  };

  const handleLoadError = (error) => {
    console.error('❌ Model loading error:', error);
    if (error.message === 'Retrying model load') {
      console.log('🔄 Retrying load - Resetting view state');
      setRetryKey(prev => prev + 1);
      setShowLoadingModel(true);
    } else {
      console.log('❌ Load failed - Showing error state');
      setLoadError(true);
      setShowLoadingModel(false);
    }
    exportLockRef.current = false;
  };

  // Log when loading view visibility changes
  useEffect(() => {
    console.log('👁️ Loading view visibility changed:', { showLoadingModel });
  }, [showLoadingModel]);

  // Log when model loaded state changes
  useEffect(() => {
    console.log('📦 Model loaded state changed:', { modelLoaded });
  }, [modelLoaded]);

  // Expose functions through ref
  useImperativeHandle(ref, () => ({
    takeScreenshot: async () => {
      if (!modelLoaded || !sceneRootRef.current) return null;

      // Store current camera state
      const originalPosition = camera.position.clone();
      const originalRotation = camera.rotation.clone();
      const originalFov = camera.fov;
      const originalAspect = camera.aspect;
      const originalTarget = camera.target?.clone();

      // Set camera to square aspect ratio (1:1)
      camera.aspect = 1;
      camera.updateProjectionMatrix();

      // Set camera to zoomed portrait position
      let defaultPosition = isMobile ? 
        new THREE.Vector3(-0.2, 1.0, 1.5) : // Further back and slightly lower for mobile
        new THREE.Vector3(-0.3, 1.1, 1.65);  // Further back and slightly lower for desktop
      
      // Rotate the camera position 15 degrees counterclockwise around the Y axis
      const angle = -Math.PI / 12; // -15 degrees in radians (negative for counterclockwise)
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = defaultPosition.x * cos + defaultPosition.z * sin;
      const z = -defaultPosition.x * sin + defaultPosition.z * cos;
      defaultPosition = new THREE.Vector3(x, defaultPosition.y, z);
      
      camera.position.copy(defaultPosition);
      camera.fov = isMobile ? 35 : 30; // Tighter FOV for more zoom
      camera.lookAt(0, 0.9, 0);
      camera.updateProjectionMatrix(); // Required after FOV change

      // Store original renderer size and pixel ratio
      const originalSize = {
        width: gl.domElement.width,
        height: gl.domElement.height
      };
      const originalPixelRatio = window.devicePixelRatio;

      // Set renderer size to 1024x1024
      gl.setSize(1024, 1024);
      gl.setPixelRatio(1); // Set to 1 since we're already at target resolution

      // Store original clear color
      const originalClearColor = gl.getClearColor(new THREE.Color());
      const originalClearAlpha = gl.getClearAlpha();

      // Create gradient colors based on theme
      const gradientColor = new THREE.Color(themecolor);
      
      // Set clear color to match the preview gradient
      gl.setClearColor(gradientColor, 0.6);

      // Render scene
      gl.render(scene, camera);

      // Convert to blob
      return new Promise((resolve) => {
        gl.domElement.toBlob((blob) => {
          // Restore all original settings
          gl.setClearColor(originalClearColor, originalClearAlpha);
          gl.setSize(originalSize.width, originalSize.height);
          gl.setPixelRatio(originalPixelRatio);
          camera.position.copy(originalPosition);
          camera.rotation.copy(originalRotation);
          camera.fov = originalFov;
          camera.aspect = originalAspect;
          camera.updateProjectionMatrix();
          if (originalTarget) {
            camera.target = originalTarget;
          }
          resolve(blob);
        }, 'image/png');
      });
    },

    exportScene: async (exportType = 'animated') => {
      console.log(`Starting export process for type: ${exportType}`);
      
      // Add loading state check with timeout
      const waitForLoad = async (maxWaitTime = 10000) => {
        const startTime = Date.now();
        while (!modelLoaded && Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!modelLoaded) {
          throw new Error('Model loading timeout exceeded');
        }
      };

      try {
        // Wait for model to load with timeout
        await waitForLoad();

        if (exportLockRef.current) {
          console.log('Export already in progress, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!sceneRootRef.current) {
          throw new Error('Scene reference not available');
        }

        exportLockRef.current = true;

        // Rest of the export process remains the same...
        const modelUrl = exportType === 't-pose' ? EXPORT_GLB_URL : GLB_URL;
        console.log('Loading model from URL:', modelUrl);

        const loadedModel = await new Promise((resolve, reject) => {
          const loader = new GLTFLoader();
          let retryCount = 0;
          const MAX_LOAD_RETRIES = 3;
          
          const attemptLoad = () => {
            console.log(`Loading model attempt ${retryCount + 1}/${MAX_LOAD_RETRIES}`);
            loader.load(
              modelUrl,
              async (gltf) => {
                try {
                  // Create a deep clone of the scene to avoid modifying the original
                  const clonedScene = SkeletonUtils.clone(gltf.scene);
                  
                  // Process all materials and textures
                  const texturePromises = [];
                  const textureLoader = new THREE.TextureLoader();
                  
                  clonedScene.traverse(async (node) => {
                    if (node.material) {
                      // Handle both single materials and material arrays
                      const materials = Array.isArray(node.material) ? node.material : [node.material];
                      
                      materials.forEach((material) => {
                        // List of texture properties to process
                        const textureProps = [
                          'map', 'normalMap', 'roughnessMap', 'metalnessMap',
                          'emissiveMap', 'aoMap', 'displacementMap', 'alphaMap'
                        ];
                        
                        textureProps.forEach((prop) => {
                          if (material[prop] && material[prop].image) {
                            const texture = material[prop];
                            
                            // Create a new texture from the image data
                            const promise = new Promise((resolve) => {
                              // Create a canvas to draw the texture
                              const canvas = document.createElement('canvas');
                              canvas.width = texture.image.width;
                              canvas.height = texture.image.height;
                              const ctx = canvas.getContext('2d');
                              ctx.drawImage(texture.image, 0, 0);
                              
                              // Create new texture from canvas
                              const newTexture = new THREE.Texture(canvas);
                              
                              // Copy all texture properties
                              newTexture.wrapS = texture.wrapS;
                              newTexture.wrapT = texture.wrapT;
                              newTexture.magFilter = texture.magFilter;
                              newTexture.minFilter = texture.minFilter;
                              newTexture.encoding = texture.encoding;
                              newTexture.format = texture.format;
                              newTexture.type = texture.type;
                              newTexture.flipY = false; // Important for GLB export
                              newTexture.needsUpdate = true;
                              
                              // Replace the original texture
                              material[prop] = newTexture;
                              resolve();
                            });
                            
                            texturePromises.push(promise);
                          }
                        });
                      });
                    }
                  });

                  // Wait for all textures to be processed
                  await Promise.all(texturePromises);
                  
                  // Copy animations if they exist
                  const clonedAnimations = gltf.animations.map(anim => anim.clone());
                  
                  resolve({
                    scene: clonedScene,
                    animations: clonedAnimations
                  });
                } catch (error) {
                  console.error('Error processing model:', error);
                  if (retryCount < MAX_LOAD_RETRIES - 1) {
                    retryCount++;
                    console.log(`Retrying due to processing error...`);
                    setTimeout(attemptLoad, 1000);
                  } else {
                    reject(error);
                  }
                }
              },
              (progress) => {
                const percent = (progress.loaded / progress.total * 100);
                if (percent === 0 || percent === 33 || percent === 66 || percent === 100) {
                  console.log(`Loading model: ${percent.toFixed(0)}%`);
                }
              },
              (error) => {
                console.error(`Error loading model (attempt ${retryCount + 1}):`, error);
                if (retryCount < MAX_LOAD_RETRIES - 1) {
                  retryCount++;
                  console.log(`Retrying in 1 second...`);
                  setTimeout(attemptLoad, 1000);
                } else {
                  reject(error);
                }
              }
            );
          };

          attemptLoad();
        });

        console.log('Getting visible meshes from current scene');
        const visibleMeshes = new Set();
        sceneRootRef.current.traverse((obj) => {
          if (obj.isMesh && obj.visible) {
            visibleMeshes.add(obj.name);
          }
        });
        console.log('Visible meshes:', Array.from(visibleMeshes));

        console.log('Applying visibility to export scene');
        loadedModel.scene.traverse((node) => {
          if (node.isMesh) {
            node.visible = visibleMeshes.has(node.name);
            if (node.visible) {
              console.log('Set visible:', node.name);
            }
          }
        });

        let animations = [];
        if (exportType === 'animated' && loadedModel.animations) {
          console.log('Processing animations:', {
            count: loadedModel.animations.length,
            names: loadedModel.animations.map(a => a.name)
          });
          animations = loadedModel.animations;
        }

        console.log('Creating GLTFExporter');
        const exporter = new GLTFExporter();
        const options = {
          binary: true,
          animations: animations,
          includeCustomExtensions: true,
          embedImages: true,
          onlyVisible: true,
          forceIndices: true,
          truncateDrawRange: false,
          maxTextureSize: 2048,
          trs: false, // Use matrix transform instead of TRS
          forcePowerOfTwoTextures: true // Force textures to be power of 2
        };
        console.log('Export options:', options);

        return new Promise((resolve, reject) => {
          console.log('Starting export...');
          let exportRetryCount = 0;
          const MAX_EXPORT_RETRIES = 3;

          const attemptExport = () => {
            exporter.parse(
              loadedModel.scene,
              (gltfData) => {
                console.log('Export successful:', {
                  dataSize: gltfData.byteLength,
                  type: typeof gltfData
                });
                resolve(gltfData);
              },
              (error) => {
                console.error(`Export failed (attempt ${exportRetryCount + 1}):`, error);
                if (exportRetryCount < MAX_EXPORT_RETRIES - 1) {
                  exportRetryCount++;
                  console.log('Retrying export...');
                  setTimeout(attemptExport, 1000);
                } else {
                  reject(error);
                }
              },
              options
            );
          };

          attemptExport();
        });
      } catch (error) {
        console.error('Error in exportScene:', error);
        exportLockRef.current = false;
        throw error;
      }
    }
  }));

  return (
    <>
      <PerspectiveCamera 
        makeDefault 
        position={isMobile ? [-0.3, 1.2, 1.8] : [-0.5, 1.4, 2.0]} 
        fov={isMobile ? 40 : 35}
      />
      
      <OrbitControls 
        enableZoom={true} 
        enablePan={false}
        minDistance={isMobile ? 1.2 : 1.5}
        maxDistance={isMobile ? 2.5 : 3.0}
        target={[0, 0.9, 0]}
        enableDamping={true}
        dampingFactor={0.05}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.5}
        minAzimuthAngle={-Math.PI}
        maxAzimuthAngle={Math.PI}
        rotateSpeed={isMobile ? 0.5 : 0.7}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN
        }}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        }}
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

      {/* Add backlight matching theme color */}
      <spotLight
        position={[0, 2.0, -1.5]}
        intensity={1.5}
        angle={Math.PI / 3}
        penumbra={0.8}
        distance={5}
        color={themecolor}
      />

      <Environment preset="studio" />
      
      <Suspense fallback={null}>
        {showLoadingModel && <LoadingModel />}
        {loadError ? (
          <LoadingText>Error loading model. Please try refreshing the page.</LoadingText>
        ) : (
          <MainModel 
            key={retryKey}
            selectedTraits={selectedTraits}
            sceneRef={sceneRootRef}
            onLoad={(modelRef) => handleModelLoad(modelRef)}
            onError={handleLoadError}
          />
        )}
      </Suspense>
    </>
  );
});

export default CharacterPreview; 