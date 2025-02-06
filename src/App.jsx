import { useState, useRef, useCallback } from 'react';
import styled from '@emotion/styled';
import { Canvas } from '@react-three/fiber';
import CharacterPreview from './components/CharacterPreview';
import TraitSelector from './components/TraitSelector';
import { TRAIT_CATEGORIES } from './config/traits';

const AppContainer = styled.div`
  display: flex;
  height: 100vh;
  width: 100vw;
`;

const PreviewSection = styled.div`
  flex: 2;
  background-color: #1a1a1a;
  position: relative;
`;

const SelectorSection = styled.div`
  flex: 1;
  padding: 20px;
  background-color: #2a2a2a;
  color: white;
  overflow-y: auto;
  min-width: 300px;
  max-width: 400px;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #4a4a4a;
    border-radius: 4px;
  }
`;

const Title = styled.h1`
  margin-bottom: 24px;
  font-size: 1.8em;
  color: #4CAF50;
`;

const TopBar = styled.div`
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  display: flex;
  gap: 10px;
`;

const Button = styled.button`
  background: ${props => {
    if (props.variant === 'secondary') return '#666';
    if (props.variant === 'primary') return '#4CAF50';
    if (props.variant === 'fun') return '#2196F3';
    return '#4CAF50';
  }};
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1em;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => {
      if (props.variant === 'secondary') return '#777';
      if (props.variant === 'primary') return '#45a049';
      if (props.variant === 'fun') return '#1976D2';
      return '#45a049';
    }};
    transform: translateY(-1px);
  }

  &:disabled {
    background: #666;
    cursor: not-allowed;
    transform: none;
  }
`;

// Helper function to get a random item from an array
const getRandomItem = (array) => array[Math.floor(Math.random() * array.length)];

// Generate random traits, ensuring required traits are included
const generateRandomTraits = () => {
  const traits = Object.keys(TRAIT_CATEGORIES).reduce((acc, category) => {
    const options = TRAIT_CATEGORIES[category].options;
    // Randomly decide whether to include this trait (50% chance)
    const shouldInclude = Math.random() > 0.5;
    
    // Always include type, eyes, and mouth, or include by random chance
    if (category === 'type' || category === 'eyes' || category === 'mouth' || shouldInclude) {
      acc[category] = getRandomItem(options).id;
    } else {
      acc[category] = '';
    }
    return acc;
  }, {});

  // Ensure we have the required traits
  if (!traits.type) traits.type = 'plain';
  if (!traits.eyes) traits.eyes = TRAIT_CATEGORIES.eyes.options[0].id;
  if (!traits.mouth) traits.mouth = TRAIT_CATEGORIES.mouth.options[0].id;

  return traits;
};

function App() {
  const [selectedTraits, setSelectedTraits] = useState(generateRandomTraits);
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef();

  const handleTraitChange = (traitType, value) => {
    setSelectedTraits(prev => ({
      ...prev,
      [traitType]: value
    }));
  };

  const handleClearAll = () => {
    setSelectedTraits(prev => ({
      ...Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: '' }), {}),
      // Keep the basic traits
      type: 'plain',
      eyes: TRAIT_CATEGORIES.eyes.options[0].id,
      mouth: TRAIT_CATEGORIES.mouth.options[0].id,
    }));
  };

  const handleRandom = () => {
    setSelectedTraits(generateRandomTraits());
  };

  const handleExport = async () => {
    if (previewRef.current?.exportScene) {
      setIsExporting(true);
      try {
        await previewRef.current.exportScene();
      } catch (error) {
        console.error('Export failed:', error);
      }
      setIsExporting(false);
    }
  };

  const hasSelectedTraits = Object.values(selectedTraits).some(Boolean);

  return (
    <AppContainer>
      <PreviewSection>
        <TopBar>
          <Button 
            variant="fun"
            onClick={handleRandom}
          >
            Random
          </Button>
          <Button 
            variant="secondary"
            onClick={handleClearAll}
          >
            Clear All
          </Button>
          <Button 
            variant="primary"
            onClick={handleExport} 
            disabled={!hasSelectedTraits || isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export Model'}
          </Button>
        </TopBar>
        <Canvas>
          <CharacterPreview 
            ref={previewRef}
            selectedTraits={selectedTraits} 
          />
        </Canvas>
      </PreviewSection>
      <SelectorSection>
        <Title>mfer Character Creator</Title>
        <TraitSelector 
          selectedTraits={selectedTraits} 
          onTraitChange={handleTraitChange} 
        />
      </SelectorSection>
    </AppContainer>
  );
}

export default App; 