import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Environment } from '@react-three/drei';
import { TRAIT_CATEGORIES } from '../config/traits';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import * as THREE from 'three';

// Helper component to load and display a single trait model
function TraitModel({ traitType, traitId, onLoad }) {
  // Skip loading model for background trait
  if (traitType === 'background') return null;
  
  // Skip if no trait is selected
  if (!traitId) return null;
  
  const trait = TRAIT_CATEGORIES[traitType]?.options.find(opt => opt.id === traitId);
  if (!trait?.model) return null;

  const { scene } = useGLTF(`/avatar-maker/3d-models/${trait.model}`);
  
  useEffect(() => {
    if (scene && onLoad) {
      // Clone the scene to avoid modifying the original
      const clonedScene = scene.clone();
      onLoad(traitType, clonedScene);
    }
  }, [scene, traitType, onLoad]);
  
  if (!scene) return null;
  
  return <primitive object={scene} />;
}

const CharacterPreview = forwardRef(({ selectedTraits }, ref) => {
  const groupRef = useRef();
  const { scene: threeScene } = useThree();
  const loadedModels = useRef({});

  // Handle model loading
  const handleModelLoad = (traitType, modelScene) => {
    // Only store currently selected traits
    if (selectedTraits[traitType]) {
      loadedModels.current[traitType] = modelScene;
    }
  };

  // Clear out removed traits
  useEffect(() => {
    // Remove any stored models that are no longer selected
    Object.keys(loadedModels.current).forEach(traitType => {
      if (!selectedTraits[traitType]) {
        delete loadedModels.current[traitType];
      }
    });
  }, [selectedTraits]);

  // Export functionality
  const exportScene = async () => {
    // Create a new scene for the combined model
    const combinedScene = new THREE.Scene();
    
    // Only add currently selected traits to the combined scene
    Object.entries(selectedTraits).forEach(([traitType, traitId]) => {
      if (traitId && loadedModels.current[traitType]) {
        combinedScene.add(loadedModels.current[traitType].clone());
      }
    });

    // Create an exporter
    const exporter = new GLTFExporter();

    // Export the combined scene
    try {
      const gltfData = await new Promise((resolve, reject) => {
        exporter.parse(
          combinedScene,
          (gltf) => resolve(gltf),
          (error) => reject(error),
          { binary: true }
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
      {/* Adjusted camera position with slight rotation */}
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
        // Allow more vertical rotation
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.5}
        // Allow full horizontal rotation
        minAzimuthAngle={-Math.PI}
        maxAzimuthAngle={Math.PI}
        // Add rotation speed
        rotateSpeed={0.7}
      />
      
      {/* Adjusted lighting for better all-around view */}
      <ambientLight intensity={0.3} />
      
      {/* Main key light - adjusted for more dynamic lighting */}
      <directionalLight 
        position={[2, 2, 2]} 
        intensity={0.8} 
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      
      {/* Fill light - adjusted position */}
      <directionalLight 
        position={[-1.5, 1, -1]} 
        intensity={0.4} 
        color="#b4c7ff"
      />
      
      {/* Rim light for edge definition */}
      <spotLight
        position={[0, 2, -2.5]}
        intensity={0.35}
        angle={0.6}
        penumbra={1}
        color="#ffffff"
      />
      
      {/* Ground fill light */}
      <pointLight
        position={[0, 0.5, 1.5]}
        intensity={0.2}
        distance={3}
        color="#b4c7ff"
      />

      {/* Environment lighting */}
      <Environment preset="studio" />
      
      <group ref={groupRef}>
        {Object.entries(selectedTraits).map(([traitType, traitId]) => (
          traitId && (
            <TraitModel
              key={`${traitType}-${traitId}`}
              traitType={traitType}
              traitId={traitId}
              onLoad={handleModelLoad}
            />
          )
        ))}
      </group>
    </>
  );
});

export default CharacterPreview; 