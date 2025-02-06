import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Environment } from '@react-three/drei';
import { TRAIT_CATEGORIES } from '../config/traits';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import * as THREE from 'three';

// Helper component to load and display a single trait model
function TraitModel({ traitType, traitId, onLoad }) {
  const trait = TRAIT_CATEGORIES[traitType]?.options.find(opt => opt.id === traitId);
  const { scene } = useGLTF(trait ? `/3d-models/${trait.model}` : null);
  
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
  const [rotation, setRotation] = useState(0);
  const { scene: threeScene } = useThree();
  const loadedModels = useRef({});

  // Handle model loading
  const handleModelLoad = (traitType, modelScene) => {
    loadedModels.current[traitType] = modelScene;
  };

  // Export functionality
  const exportScene = async () => {
    // Create a new scene for the combined model
    const combinedScene = new THREE.Scene();
    
    // Add all loaded models to the combined scene
    Object.values(loadedModels.current).forEach(modelScene => {
      combinedScene.add(modelScene.clone());
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

  // Slow automatic rotation when not interacting
  useFrame(() => {
    if (groupRef.current) {
      setRotation(prev => prev + 0.001);
      groupRef.current.rotation.y = rotation;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.5, 4]} />
      <OrbitControls 
        enableZoom={true} 
        enablePan={true}
        minDistance={2}
        maxDistance={10}
        target={[0, 1, 0]}
      />
      
      {/* Ambient light for overall illumination */}
      <ambientLight intensity={0.2} />
      
      {/* Main key light */}
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={0.7} 
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      
      {/* Fill light */}
      <directionalLight 
        position={[-5, 3, -5]} 
        intensity={0.3} 
        color="#b4c7ff"
      />
      
      {/* Rim light for edge definition */}
      <spotLight
        position={[0, 5, -8]}
        intensity={0.3}
        angle={0.6}
        penumbra={1}
        color="#ffffff"
      />
      
      {/* Ground fill light */}
      <pointLight
        position={[0, -3, 0]}
        intensity={0.1}
        distance={10}
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