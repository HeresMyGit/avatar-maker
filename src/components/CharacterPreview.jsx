import { useRef, useEffect, useState, forwardRef, useImperativeHandle, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Text } from '@react-three/drei';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import gsap from 'gsap';
import { applyTraitVisibility } from '../avatar/traits';
import { createAvatarDriver } from '../avatar/runtime';
import { exportAvatar } from '../avatar/export-avatar';

const GLB_URL = `${import.meta.env.BASE_URL}avatar/mfermashup.glb?v=0f54c685044d`;
const LOADING_MODEL_URL = `${import.meta.env.BASE_URL}sartoshi-head.glb`;

// Cache the pristine GLTFLoader result, including top-level rig metadata.
const modelManager = {
  loadedModels: new Map(),
  currentLoadingPromises: new Map(),
  loadingProgress: new Map(),
  async loadModel(url) {
    if (this.loadedModels.has(url)) return this.loadedModels.get(url);
    if (this.currentLoadingPromises.has(url)) return this.currentLoadingPromises.get(url);
    this.loadingProgress.set(url, 0);
    const promise = new Promise((resolve, reject) => {
      new GLTFLoader().load(url, gltf => {
        this.loadedModels.set(url, gltf);
        this.loadingProgress.set(url, 100);
        resolve(gltf);
      }, progress => {
        if (progress.lengthComputable) this.loadingProgress.set(url, Math.min(99, progress.loaded / progress.total * 100));
      }, reject);
    }).finally(() => this.currentLoadingPromises.delete(url));
    this.currentLoadingPromises.set(url, promise);
    return promise;
  }
};

// The visible percentage is the 69 joke; loading/completion still use 0–100.
const LoadingText = ({ children, progress }) => (
  <Text
    position={[0, 0.4, 0]}
    fontSize={0.3}
    color="white"
    anchorX="center"
    anchorY="middle"
    font="/SartoshiScript-Regular.otf"
    outlineWidth={0.02}
    outlineColor="black"
  >
    {`${children} ${Math.min(69, Math.max(0, progress * 0.69)).toFixed(1)}%`}
  </Text>
);

// Helper function to normalize trait IDs
const LoadingModel = ({ children }) => {
  const groupRef = useRef();
  const modelRef = useRef(null);

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
        clonedScene.traverse(object => {
          if (!object.isMesh) return;
          object.geometry = object.geometry.clone();
          object.material = Array.isArray(object.material)
            ? object.material.map(material => material.clone()) : object.material.clone();
        });
        clonedScene.scale.set(0.6, 0.6, 0.6);
        clonedScene.position.set(0, 0.9, 0);
        clonedScene.rotation.y = -Math.PI/2;  // Rotate 90 degrees clockwise

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
  }, []);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <>
      <group ref={groupRef} />
      {children}
    </>
  );
};

// Each preview owns its bones/materials; exports always use the pristine bank.
const MainModel = ({ selectedTraits, onLoad, onError, sceneRef, sourceRef, driverRef, captureRef }) => {
  const groupRef = useRef();
  const mixerRef = useRef();
  const latest = useRef({ selectedTraits, onLoad, onError });
  latest.current = { selectedTraits, onLoad, onError };

  useEffect(() => {
    let mounted = true;
    let instance, driver, mixer, source;
    const group = groupRef.current;
    const materials = new Set();
    modelManager.loadModel(GLB_URL).then(gltf => {
      if (!mounted) return;
      source = gltf;
      instance = SkeletonUtils.clone(gltf.scene);
      instance.traverse(object => {
        if (!object.isMesh) return;
        const copy = material => { const owned = material.clone(); materials.add(owned); return owned; };
        object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
      });
      applyTraitVisibility(instance, latest.current.selectedTraits);
      group.add(instance);
      sceneRef.current = instance;
      sourceRef.current = gltf;
      driver = createAvatarDriver(instance, gltf);
      driverRef.current = driver;
      mixer = new THREE.AnimationMixer(instance);
      const idle = gltf.animations.find(clip => clip.name.toLowerCase().includes('idle')) || gltf.animations[0];
      if (idle) mixer.clipAction(idle).play();
      mixerRef.current = mixer;
      latest.current.onLoad?.({ scene: instance, animations: gltf.animations, mixer });
    }).catch(error => { if (mounted) latest.current.onError?.(error); });
    return () => {
      mounted = false;
      driver?.dispose();
      if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(instance); }
      if (instance) {
        group.remove(instance);
        const skeletons = new Set();
        instance.traverse(object => { if (object.isSkinnedMesh) skeletons.add(object.skeleton); });
        for (const skeleton of skeletons) skeleton.dispose();
      }
      for (const material of materials) material.dispose();
      if (sceneRef.current === instance) sceneRef.current = null;
      if (sourceRef.current === source) sourceRef.current = null;
      if (driverRef.current === driver) driverRef.current = null;
      mixerRef.current = null;
    };
  }, [sceneRef, sourceRef, driverRef]);

  useEffect(() => {
    if (!sceneRef.current) return;
    driverRef.current?.resetSecondaryMotion();
    applyTraitVisibility(sceneRef.current, selectedTraits);
  }, [selectedTraits, sceneRef, driverRef]);

  useFrame((state, delta) => {
    const capture = captureRef.current;
    if (!capture.active) mixerRef.current?.update(delta);
    driverRef.current?.update(capture.frame, delta, { tracking: capture.active, now: performance.now() });
  });
  return <group ref={groupRef} />;
};

const CharacterPreview = forwardRef(({ selectedTraits, themeColor: themecolor, captureRef }, ref) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [showLoadingModel, setShowLoadingModel] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isMainModelLoading, setIsMainModelLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const sceneRootRef = useRef();
  const sourceRef = useRef();
  const driverRef = useRef();
  const idleCaptureRef = useRef({ active: false, frame: null });
  const activeCaptureRef = captureRef || idleCaptureRef;
  const mainModelRef = useRef(null);
  const exportLockRef = useRef(false);
  const { gl, scene, camera } = useThree();
  const cameraRef = useRef();
  const controlsRef = useRef();

  // Track loading progress
  useEffect(() => {
    let interval;
    if (isMainModelLoading) {
      interval = setInterval(() => {
        const currentProgress = modelManager.loadingProgress.get(GLB_URL) || 0;
        setLoadingProgress(prev => {
          // Only update if the new progress is higher
          return currentProgress > prev ? currentProgress : prev;
        });
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isMainModelLoading]);

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
    console.log('📦 Main model loaded, checking initialization...');
    
    // Store the model reference
    mainModelRef.current = modelRef;
    
    // Verify model is fully initialized
    if (!mainModelRef.current || !mainModelRef.current.scene) {
      console.log('📦 Model not fully initialized, keeping loading view...');
      return;
    }
    
    // If model is fully initialized and loaded, remove loading view
    if (mainModelRef.current && mainModelRef.current.scene) {
      console.log('📦 Model fully initialized and loaded, removing loading view');
      setLoadingProgress(100);
      setModelLoaded(true);
      setLoadError(false);
      setShowLoadingModel(false);
      setIsMainModelLoading(false);
      exportLockRef.current = false;

      // Only do the camera transition if this is the first time the loading view is being removed
      if (!initialLoadComplete && cameraRef.current && controlsRef.current) {
        setInitialLoadComplete(true);
        
        // Calculate new camera position
        const radius = 3; // Distance from target
        const angle = -Math.PI / 7.2; // -25 degrees in radians (increased from -15)
        const height = 1.2; // Camera height
        const x = radius * Math.sin(angle);
        const z = radius * Math.cos(angle);
        
        // Smoothly move camera
        gsap.to(cameraRef.current.position, {
          x: x,
          y: height,
          z: z,
          duration: 1.5,
          ease: "power2.inOut"
        });

        // Update camera settings
        cameraRef.current.fov = 25;
        cameraRef.current.updateProjectionMatrix();

        // Update controls target
        gsap.to(controlsRef.current.target, {
          x: 0,
          y: 1.0,
          z: 0,
          duration: 1.5,
          ease: "power2.inOut"
        });
      }
    } else {
      console.log('📦 Model or loading not complete, keeping loading view');
    }
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

  // Log when loading states change
  useEffect(() => {
    console.log('Loading states changed:', { 
      showLoadingModel, 
      modelLoaded, 
      isMainModelLoading,
      loadingProgress 
    });
  }, [showLoadingModel, modelLoaded, isMainModelLoading, loadingProgress]);

  // Expose functions through ref
  useImperativeHandle(ref, () => ({
    get ready() { return modelLoaded && !!sceneRootRef.current; },
    calibrate: frame => driverRef.current?.calibrate(frame),
    takeScreenshot: async () => {
      if (!modelLoaded || !sceneRootRef.current) return null;

      // Preserve animation state
      let currentAnimationTime = 0;
      let wasPlaying = false;
      
      if (mainModelRef.current && mainModelRef.current.mixer) {
        // Store animation state from main model
        const mixer = mainModelRef.current.mixer;
        const actions = mixer._actions;
        if (actions && actions.length > 0) {
          currentAnimationTime = actions[0].time;
          wasPlaying = !actions[0].paused;
        }
      }

      // Create a new scene for the screenshot
      const screenshotScene = new THREE.Scene();
      
      // Clone the current scene for the screenshot
      const clonedScene = SkeletonUtils.clone(sceneRootRef.current);
      screenshotScene.add(clonedScene);

      // Create a new camera for the screenshot
      const screenshotCamera = new THREE.PerspectiveCamera(
        isMobile ? 35 : 30, // FOV
        1, // Aspect ratio (1:1 for square screenshot)
        0.1,
        1000
      );

      // Position the camera for the screenshot
      let defaultPosition = isMobile ? 
        new THREE.Vector3(-0.2, 1.0, 1.5) : // Mobile position
        new THREE.Vector3(-0.3, 1.1, 1.65);  // Desktop position
      
      // Rotate the camera position 15 degrees counterclockwise around the Y axis
      const angle = -Math.PI / 12; // -15 degrees in radians
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = defaultPosition.x * cos + defaultPosition.z * sin;
      const z = -defaultPosition.x * sin + defaultPosition.z * cos;
      defaultPosition = new THREE.Vector3(x, defaultPosition.y, z);
      
      screenshotCamera.position.copy(defaultPosition);
      screenshotCamera.lookAt(0, 0.9, 0);
      screenshotCamera.updateProjectionMatrix();

      // Create a new renderer for the screenshot
      const screenshotRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
      });
      screenshotRenderer.setSize(1024, 1024);
      screenshotRenderer.setPixelRatio(1);
      screenshotRenderer.setClearColor(0x000000, 0); // Set to transparent

      // Copy environment and lighting settings from main scene
      scene.traverse((obj) => {
        if (obj.isLight) {
          const lightClone = obj.clone();
          // Ensure light properties are copied
          lightClone.intensity = obj.intensity;
          lightClone.color = obj.color.clone();
          lightClone.position.copy(obj.position);
          lightClone.rotation.copy(obj.rotation);
          lightClone.scale.copy(obj.scale);
          screenshotScene.add(lightClone);
        }
      });

      // Add Environment
      const environment = scene.environment;
      if (environment) {
        screenshotScene.environment = environment.clone();
      }

      // Render screenshot scene
      screenshotRenderer.render(screenshotScene, screenshotCamera);

      // Create a canvas to compose the final image
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      // Draw background with theme color
      // Ensure hex color has # prefix
      const bgColor = themecolor.startsWith('#') ? themecolor : `#${themecolor}`;
      ctx.fillStyle = bgColor;
      ctx.globalAlpha = 0.85; // Increased opacity for more vibrant colors
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;

      // Draw the rendered scene on top
      ctx.drawImage(screenshotRenderer.domElement, 0, 0);

      // Get the screenshot as a blob from the composed canvas
      const blob = await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      });

      // The temporary pose shares pristine geometry/materials with the preview.
      const screenshotSkeletons = new Set();
      clonedScene.traverse(object => { if (object.isSkinnedMesh) screenshotSkeletons.add(object.skeleton); });
      for (const skeleton of screenshotSkeletons) skeleton.dispose();
      screenshotScene.environment?.dispose();
      screenshotRenderer.dispose();

      return blob;
    },

    takeViewfinderScreenshot: async () => {
      if (!modelLoaded || !gl) return null;

      try {
        // Get current renderer and camera
        const renderer = gl;
        const currentCamera = cameraRef.current;
        const currentAspect = gl.domElement.width / gl.domElement.height;
        
        // Temporarily disable orbit controls to prevent movement during screenshot
        if (controlsRef.current) {
          controlsRef.current.enabled = false;
        }
        
        // Force a render with the current camera to ensure screenshot captures current view
        renderer.render(scene, currentCamera);
        
        // Create a new high-resolution canvas for the final composition
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = Math.floor(1024 / currentAspect);
        const ctx = canvas.getContext('2d');
        
        // Parse theme color to ensure correct format
        const bgColor = themecolor.startsWith('#') ? themecolor : `#${themecolor}`;
        
        // Fill with solid dark background first (similar to the app background)
        ctx.fillStyle = '#13151a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw a radial gradient background matching the UI more closely
        const gradient = ctx.createRadialGradient(
          canvas.width/2, canvas.height/2, 0,
          canvas.width/2, canvas.height/2, canvas.width * 0.8
        );
        
        // Use color values that match the CSS in PreviewSection
        gradient.addColorStop(0, bgColor + '99'); // ~60% opacity at center (matching CSS)
        gradient.addColorStop(0.7, 'transparent'); // Fade to transparent at 70%
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Get the WebGL canvas content scaled to our high-res canvas
        const tempImg = new Image();
        await new Promise((resolve) => {
          tempImg.onload = resolve;
          tempImg.src = renderer.domElement.toDataURL('image/png');
        });
        
        // Calculate scaling to maintain aspect ratio and center in canvas
        const scale = Math.min(
          canvas.width / tempImg.width,
          canvas.height / tempImg.height
        );
        
        const scaledWidth = tempImg.width * scale;
        const scaledHeight = tempImg.height * scale;
        const offsetX = (canvas.width - scaledWidth) / 2;
        const offsetY = (canvas.height - scaledHeight) / 2;
        
        // Draw the WebGL canvas content on top
        ctx.drawImage(tempImg, offsetX, offsetY, scaledWidth, scaledHeight);
        
        // Optional: Add subtle paper texture effect (if needed)
        // This would require loading and drawing a texture image
        
        // Get the screenshot as a blob
        const blob = await new Promise((resolve) => {
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        });
        
        // Re-enable orbit controls
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
        
        return blob;
      } catch (error) {
        console.error('Error capturing viewfinder screenshot:', error);
        
        // Re-enable orbit controls in case of error
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
        
        return null;
      }
    },

    exportScene: async (exportType = 'animated') => {
      if (!modelLoaded || !sceneRootRef.current || !sourceRef.current || exportLockRef.current) return null;
      exportLockRef.current = true;
      try {
        const names = new Set(['tongue']);
        sceneRootRef.current.traverse(object => {
          if (object.isMesh && object.visible && !object.userData.mferAttachmentReference) names.add(object.name);
        });
        return await exportAvatar(sourceRef.current, names, exportType);
      } finally {
        exportLockRef.current = false;
      }
    }
  }));

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={true}
        minDistance={1.5}
        maxDistance={8}
        target={[0, 1.0, 0]}
      />
      <PerspectiveCamera 
        ref={cameraRef}
        makeDefault 
        position={[0, 1.2, 3.2]} 
        fov={35}
      />
      <Environment preset="studio" />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} />
      <Suspense fallback={null}>
        {(showLoadingModel || !modelLoaded || isMainModelLoading || loadingProgress < 100) && (
          <LoadingModel>
            <LoadingText progress={loadingProgress}>loading...</LoadingText>
          </LoadingModel>
        )}
        {loadError ? (
          <LoadingText progress={0}>Error loading model. Please try refreshing the page.</LoadingText>
        ) : (
          <MainModel 
            key={retryKey}
            selectedTraits={selectedTraits}
            sceneRef={sceneRootRef}
            sourceRef={sourceRef}
            driverRef={driverRef}
            captureRef={activeCaptureRef}
            onLoad={(modelRef) => handleModelLoad(modelRef)}
            onError={handleLoadError}
          />
        )}
      </Suspense>
    </>
  );
});

export default CharacterPreview;
