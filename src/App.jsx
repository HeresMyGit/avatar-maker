import { useState, useRef, useMemo } from 'react';
import styled from '@emotion/styled';
import { Canvas } from '@react-three/fiber';
import CharacterPreview from './components/CharacterPreview';
import TraitSelector from './components/TraitSelector';
import { TRAIT_CATEGORIES } from './config/traits';
import { css, keyframes } from '@emotion/react';

const gradientMove = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const getThemeGradient = (props) => css`
  background: linear-gradient(
    90deg,
    transparent,
    ${props.themeColor}80,
    transparent
  );
`;

const getRadialGradient = (props) => css`
  background: radial-gradient(
    circle at 50% 50%,
    ${props.themeColor}0D 0%,
    transparent 50%
  );
`;

const getPreviewGradient = (props) => css`
  background: radial-gradient(
    circle at center,
    ${props.themeColor}1A 0%,
    transparent 60%
  );
`;

const getScrollbarStyles = (props) => css`
  &::-webkit-scrollbar-thumb {
    background: ${props.themeColor}33;
    border: 1px solid ${props.themeColor}4D;
    
    &:hover {
      background: ${props.themeColor}4D;
    }
  }
`;

const getTitleGradient = (props) => css`
  background: linear-gradient(
    135deg,
    ${props.themeColor} 0%,
    ${props.themeColor}DD 50%,
    ${props.themeColor} 100%
  );
`;

const getButtonGradient = (props) => css`
  background: ${
    props.variant === 'secondary' 
      ? 'rgba(255, 255, 255, 0.1)' 
      : `linear-gradient(135deg, ${props.themeColor} 0%, ${props.themeColor}DD 100%)`
  };

  &:hover {
    background: ${
      props.variant === 'secondary'
        ? 'rgba(255, 255, 255, 0.15)'
        : `linear-gradient(135deg, ${props.themeColor}EE 0%, ${props.themeColor} 100%)`
    };
  }
`;

const AppContainer = styled.div`
  display: flex;
  height: 100vh;
  width: 100vw;
  background: linear-gradient(135deg, #13151a 0%, #1a1c23 100%);
  color: #fff;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    ${props => getThemeGradient(props)}
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    ${props => getRadialGradient(props)}
    pointer-events: none;
  }
`;

const PreviewSection = styled.div`
  flex: 2;
  position: relative;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  ${props => getPreviewGradient(props)}
`;

const SelectorSection = styled.div`
  flex: 1;
  padding: 30px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  overflow-y: auto;
  min-width: 340px;
  max-width: 400px;
  position: relative;
  z-index: 1;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  ${props => getScrollbarStyles(props)}
`;

const Title = styled.div`
  margin-bottom: 32px;
  text-align: center;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -16px;
    left: 50%;
    transform: translateX(-50%);
    width: 60px;
    height: 2px;
    ${props => getThemeGradient(props)}
  }
`;

const MainTitle = styled.h1`
  font-family: 'SartoshiScript';
  font-size: 4em;
  font-weight: 400;
  margin: 0;
  ${props => getTitleGradient(props)}
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ${gradientMove} 4s linear infinite;
  letter-spacing: -0.5px;
  text-transform: none;
`;

const Subtitle = styled.p`
  font-family: 'SartoshiScript';
  color: rgba(255, 255, 255, 0.6);
  margin: 8px 0 0 0;
  font-size: 1.6em;
  letter-spacing: 0;
`;

const TopBar = styled.div`
  position: absolute;
  top: 30px;
  right: 30px;
  z-index: 10;
  display: flex;
  gap: 12px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
`;

const Button = styled.button`
  ${props => getButtonGradient(props)}
  font-family: 'SartoshiScript';
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.8em;
  font-weight: 400;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  text-transform: none;
  letter-spacing: 0;
  position: relative;
  overflow: hidden;

  &:disabled {
    background: rgba(255, 255, 255, 0.1);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

// Helper function to get a random item from an array
const getRandomItem = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

// Apply trait selection rules in the exact order specified
const applyTraitRules = (traits) => {
  // Rule 1: Conflict Between Two Hat Categories
  if (traits.hat_over_headphones && traits.hat_under_headphones) {
    const hatOver = traits.hat_over_headphones;
    const hatUnder = traits.hat_under_headphones;
    const isHoodieOver = hatOver.includes('hoodie');
    const isBandanaOrBeanieUnder = hatUnder.includes('bandana') || hatUnder.includes('beanie');
    
    if (!isHoodieOver || !isBandanaOrBeanieUnder) {
      Math.random() > 0.5 ? delete traits.hat_over_headphones : delete traits.hat_under_headphones;
    }
  }

  // Rule 2: Incompatibility of Hair Lengths
  if (traits.short_hair && traits.long_hair) {
    Math.random() > 0.5 ? delete traits.short_hair : delete traits.long_hair;
  }

  // Rule 3: Shirt/Hoodie Versus Chain Conflict
  const hasHoodieUp = traits.hat_over_headphones?.includes('hoodie');
  const hasShirt = traits.shirt;
  const hasChain = traits.chain;

  if ((hasShirt || hasHoodieUp) && hasChain) {
    if (Math.random() > 0.5) {
      delete traits.chain;
    } else {
      if (hasHoodieUp) delete traits.hat_over_headphones;
      if (hasShirt) delete traits.shirt;
    }
  }

  // Rule 4: Conflict Between Shirt and Hoodie
  if (hasShirt && hasHoodieUp) {
    Math.random() > 0.5 ? delete traits.hat_over_headphones : delete traits.shirt;
  }

  // Rule 5a & 5b: Headwear Conflicts with Hair
  const mohawkVariants = [
    'mohawk_blue', 'mohawk_pink', 'mohawk_green', 'mohawk_black',
    'mohawk_yellow', 'mohawk_purple', 'mohawk_red'
  ];

  const messyVariants = [
    'messy_red', 'messy_yellow', 'messy_purple', 'messy_black',
    'messy_black_ape', 'messy_yellow_ape', 'messy_red_ape', 'messy_purple_ape'
  ];

  const hasMohawk = traits.short_hair && mohawkVariants.some(variant => traits.short_hair === variant);
  const hasMessy = traits.short_hair && messyVariants.some(variant => traits.short_hair === variant);

  // Any headwear (except hoodies) conflicts with mohawks and messy hair
  if (traits.hat_over_headphones || traits.hat_under_headphones) {
    const headwearId = traits.hat_over_headphones || traits.hat_under_headphones;
    const isHoodie = headwearId.includes('hoodie');
    
    if (!isHoodie && (hasMohawk || hasMessy)) {
      // If it's not a hoodie and we have mohawk/messy hair, remove one randomly
      if (Math.random() > 0.5) {
        delete traits.short_hair;
      } else {
        delete traits.hat_over_headphones;
        delete traits.hat_under_headphones;
      }
    }
  }

  // Top headwear conflicts with ALL hair
  const topHeadwear = ['top', 'pilot', 'cowboy'];
  const hasTopHeadwear = traits.hat_over_headphones && topHeadwear.some(hw => traits.hat_over_headphones === hw);
  
  if (hasTopHeadwear) {
    delete traits.short_hair;
    delete traits.long_hair;
  }

  // Rule 7: Hoodie Versus Long Hair Conflict
  if (hasHoodieUp) {
    delete traits.long_hair;
    delete traits.short_hair;
  }

  // Rules 8-13: Type-specific eye rules
  // Rule 8: Zombie Type – Adjusting Eye Trait
  if (traits.type === 'zombie' && ['regular', 'red'].includes(traits.eyes)) {
    traits.eyes = 'zombie';
  }

  // Rule 9: Non-Zombie Type – Correcting Erroneous Zombie Eyes
  if (traits.type !== 'zombie' && traits.eyes === 'zombie') {
    traits.eyes = 'red';
  }

  // Rule 10: Alien Type – Adjusting Eye Trait
  if (traits.type === 'alien' && traits.eyes === 'regular') {
    traits.eyes = 'alien';
  }

  // Rule 11: Ape Type – Removing Long Hair
  if (traits.type === 'ape') {
    delete traits.long_hair;
  }

  // Rule 12: Based $mfer Type – Adjusting Eye Trait
  if (traits.type === 'based' && ['alien', 'zombie', 'red'].includes(traits.eyes)) {
    traits.eyes = 'mfercoin';
  }

  // Rule 13: Metal Mfer Type – Adjusting Eye Trait
  if (traits.type === 'metal' && ['alien', 'zombie', 'red'].includes(traits.eyes)) {
    traits.eyes = 'metal';
  }

  // Rule 14: Long Hair (Curly) Incompatible with Square Headphones
  const squareHeadphones = ['black_square', 'blue_square', 'gold_square'];
  if (traits.long_hair === 'long_curly' && squareHeadphones.includes(traits.headphones)) {
    delete traits.long_hair;
  }

  // Rule 15: Pilot Helmet Incompatible with Square Headphones
  if (traits.hat_over_headphones === 'pilot' && squareHeadphones.includes(traits.headphones)) {
    delete traits.hat_over_headphones;
  }

  // Final Cleanup: Remove any empty traits
  Object.keys(traits).forEach(key => {
    if (!traits[key]) delete traits[key];
  });

  return traits;
};

// Generate random traits, ensuring required traits are included
const generateRandomTraits = () => {
  // Start with mandatory traits
  const traits = {
    background: getRandomItem(TRAIT_CATEGORIES.background.options).id,
    type: getRandomItem(TRAIT_CATEGORIES.type.options).id,
    eyes: getRandomItem(TRAIT_CATEGORIES.eyes.options).id,
    mouth: getRandomItem(TRAIT_CATEGORIES.mouth.options).id,
    headphones: getRandomItem(TRAIT_CATEGORIES.headphones.options).id
  };

  // Add optional traits with 50% chance each
  const optionalCategories = Object.entries(TRAIT_CATEGORIES)
    .filter(([key]) => !['background', 'type', 'eyes', 'mouth', 'headphones'].includes(key));

  optionalCategories.forEach(([category, data]) => {
    if (Math.random() > 0.5) {
      traits[category] = getRandomItem(data.options).id;
    }
  });

  // Apply rules to ensure valid combinations
  return applyTraitRules(traits);
};

const getThemeColor = (selectedTraits) => {
  const background = TRAIT_CATEGORIES.background.options.find(opt => opt.id === selectedTraits.background);
  return background?.color || '#4CAF50'; // Default to green if no background selected
};

function App() {
  const [selectedTraits, setSelectedTraits] = useState(() => ({
    ...generateRandomTraits()
  }));
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef();

  const themeColor = useMemo(() => getThemeColor(selectedTraits), [selectedTraits.background]);

  const handleTraitChange = (traitType, value) => {
    setSelectedTraits(prev => ({
      ...prev,
      [traitType]: value
    }));
  };

  const handleClearAll = () => {
    setSelectedTraits(prev => ({
      ...Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: '' }), {}),
      // Keep only the basic traits
      type: 'plain',
      eyes: TRAIT_CATEGORIES.eyes.options[0].id,
      mouth: TRAIT_CATEGORIES.mouth.options[0].id,
      background: TRAIT_CATEGORIES.background.options[0].id // Set default background
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
    <AppContainer themeColor={themeColor}>
      <PreviewSection themeColor={themeColor}>
        <TopBar>
          <Button 
            variant="fun"
            onClick={handleRandom}
            themeColor={themeColor}
          >
            🎲 Random
          </Button>
          <Button 
            variant="secondary"
            onClick={handleClearAll}
          >
            ↺ Reset
          </Button>
          <Button 
            variant="primary"
            onClick={handleExport} 
            disabled={!hasSelectedTraits || isExporting}
            themeColor={themeColor}
          >
            {isExporting ? '⏳ Exporting...' : '⬇️ Export'}
          </Button>
        </TopBar>
        <Canvas>
          <CharacterPreview 
            ref={previewRef}
            selectedTraits={selectedTraits} 
          />
        </Canvas>
      </PreviewSection>
      <SelectorSection themeColor={themeColor}>
        <Title>
          <MainTitle themeColor={themeColor}>mfer Creator</MainTitle>
          <Subtitle>Build your unique character</Subtitle>
        </Title>
        <TraitSelector 
          selectedTraits={selectedTraits} 
          onTraitChange={handleTraitChange}
          themeColor={themeColor}
        />
      </SelectorSection>
    </AppContainer>
  );
}

export default App; 