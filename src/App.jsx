import { useState, useRef, useMemo, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import styled from '@emotion/styled';
import { Canvas } from '@react-three/fiber';
import CharacterPreview from './components/CharacterPreview';
import TraitSelector from './components/TraitSelector';
import Layout, { NAVIGATION_ITEMS } from './components/Layout';
import Home from './pages/Home';
import Customs from './pages/Customs';
import Based from './pages/Based';
import Details from './pages/Details';
import OGMfers from './pages/OGMfers';
import MyMfers from './pages/MyMfers';
import { TRAIT_CATEGORIES } from './config/traits';
import { css, keyframes } from '@emotion/react';
import { useNavigate } from 'react-router-dom';
import { COLOR_MAP } from './config/colors';

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
    ${props.themeColor}99 0%,
    transparent 70%
  );
  position: relative;
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url('/avatar-maker/paper-texture.png');
    opacity: 0.03;
    pointer-events: none;
  }
`;

const getScrollbarStyles = (props) => css`
  &::-webkit-scrollbar-thumb {
    background: ${props.themeColor}33;
    border: 2px solid ${props.themeColor}22;
    border-radius: 10px;
    
    &:hover {
      background: ${props.themeColor}55;
      border: 2px solid ${props.themeColor}33;
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
  text-shadow: 2px 2px 0px ${props.themeColor}33;
`;

const getButtonGradient = (props) => css`
  background: ${
    props.variant === 'secondary' 
      ? 'rgba(255, 255, 255, 0.07)' 
      : `linear-gradient(135deg, ${props.themeColor}CC 0%, ${props.themeColor}99 100%)`
  };
  border: 2px solid ${
    props.variant === 'secondary'
      ? 'rgba(255, 255, 255, 0.1)'
      : `${props.themeColor}33`
  };

  &:hover {
    background: ${
      props.variant === 'secondary'
        ? 'rgba(255, 255, 255, 0.12)'
        : `linear-gradient(135deg, ${props.themeColor}EE 0%, ${props.themeColor}BB 100%)`
    };
    border-color: ${
      props.variant === 'secondary'
        ? 'rgba(255, 255, 255, 0.15)'
        : `${props.themeColor}66`
    };
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const CreatorContainer = styled.div`
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
    bottom: 0;
    background: url('/avatar-maker/paper-texture.png');
    opacity: 0.02;
    pointer-events: none;
  }
`;

const PreviewSection = styled.div`
  flex: 2;
  position: relative;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  overflow: hidden;
  ${props => getPreviewGradient(props)}
`;

const SelectorSection = styled.div`
  flex: 1;
  padding: 30px;
  background: rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(20px);
  overflow-y: auto;
  min-width: 340px;
  max-width: 400px;
  position: relative;
  z-index: 1;
  border-left: 1px solid rgba(255, 255, 255, 0.07);

  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 5px;
  }

  ${props => getScrollbarStyles(props)}
`;

const TopBar = styled.div`
  position: absolute;
  top: 30px;
  right: 30px;
  z-index: 10;
  display: flex;
  gap: 12px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
`;

const Button = styled.button`
  ${props => getButtonGradient(props)}
  font-family: 'SartoshiScript';
  color: white;
  padding: 14px 28px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 1.8em;
  font-weight: 400;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px ${props => props.themeColor}22;
  text-transform: none;
  letter-spacing: 0;
  position: relative;
  overflow: hidden;

  &:disabled {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.05);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
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
    background: ${props => props.themeColor}33;
    border-radius: 2px;
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
  color: rgba(255, 255, 255, 0.7);
  margin: 8px 0 0 0;
  font-size: 1.6em;
  letter-spacing: 0;
  text-shadow: 1px 1px 0px rgba(0, 0, 0, 0.2);
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const MenuButton = styled.button`
  position: fixed;
  top: 30px;
  left: 30px;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.1);
    background: rgba(0, 0, 0, 0.6);
  }

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 24px;
    height: 2px;
    background: white;
    transition: all 0.3s ease;
  }

  &::before {
    transform: translateY(-6px) ${props => props.isOpen ? 'rotate(45deg) translateY(6px)' : ''};
  }

  &::after {
    transform: translateY(6px) ${props => props.isOpen ? 'rotate(-45deg) translateY(-6px)' : ''};
  }
`;

const NavigationOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${props => props.isOpen ? 1 : 0};
  pointer-events: ${props => props.isOpen ? 'all' : 'none'};
  transition: opacity 0.3s ease;
`;

const NavigationContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  animation: ${fadeIn} 0.5s ease forwards;
`;

const NavLink = styled(Link)`
  font-family: 'SartoshiScript';
  font-size: 4em;
  color: white;
  text-decoration: none;
  position: relative;
  transition: all 0.3s ease;
  opacity: 0.6;
  text-align: center;

  &:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 50%;
    width: ${props => props.active ? '100%' : '0'};
    height: 2px;
    background: ${props => props.themeColor};
    transform: translateX(-50%);
    transition: all 0.3s ease;
  }

  &:hover::after {
    width: 100%;
  }
`;

// Helper function to get a random item from an array
const getRandomItem = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

// Apply trait selection rules in the exact order specified
const applyTraitRules = (traits, isRandomGeneration = false) => {
  // Rule 1: Conflict Between Two Hat Categories
  if (isRandomGeneration && traits.hat_over_headphones && traits.hat_under_headphones) {
    const hatOver = traits.hat_over_headphones;
    const hatUnder = traits.hat_under_headphones;
    const isHoodieOver = hatOver.includes('hoodie');
    const isBandanaOrBeanieUnder = hatUnder.includes('bandana') || hatUnder.includes('beanie');
    
    if (!isHoodieOver || !isBandanaOrBeanieUnder) {
      Math.random() > 0.5 ? delete traits.hat_over_headphones : delete traits.hat_under_headphones;
    }
  }

  // Rule 2: Incompatibility of Hair Lengths
  if (isRandomGeneration && traits.short_hair && traits.long_hair) {
    Math.random() > 0.5 ? delete traits.short_hair : delete traits.long_hair;
  }

  // Rule 3: Shirt/Hoodie Versus Chain Conflict
  const hasHoodieUp = traits.hat_over_headphones?.includes('hoodie');
  const hasShirt = traits.shirt;
  const hasChain = traits.chain;

  if (isRandomGeneration && (hasShirt || hasHoodieUp) && hasChain) {
    if (Math.random() > 0.5) {
      delete traits.chain;
    } else {
      if (hasHoodieUp) delete traits.hat_over_headphones;
      if (hasShirt) delete traits.shirt;
    }
  }

  // Rule 4: Conflict Between Shirt and Hoodie
  if (isRandomGeneration && hasShirt && hasHoodieUp) {
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
  if (isRandomGeneration && (traits.hat_over_headphones || traits.hat_under_headphones)) {
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
  
  if (isRandomGeneration && hasTopHeadwear) {
    delete traits.short_hair;
    delete traits.long_hair;
  }

  // Rule 7: Hoodie Versus Long Hair Conflict
  if (isRandomGeneration && hasHoodieUp) {
    delete traits.long_hair;
    delete traits.short_hair;
  }

  // Rules 8-13: Type-specific eye rules - ALWAYS apply these regardless of random generation
  // Rule 8: Zombie Type – Adjusting Eye Trait
  if (traits.type === 'zombie') {
    // If zombie type and regular/red eyes, force zombie eyes
    if (['regular', 'red'].includes(traits.eyes)) {
      traits.eyes = 'zombie';
    }
  } else if (traits.eyes === 'zombie') {
    // If not zombie type but has zombie eyes, convert to regular
    traits.eyes = 'regular';
  }

  // Rule 9: Non-Zombie Type – Correcting Erroneous Zombie Eyes
  if (traits.type !== 'zombie' && traits.eyes === 'zombie') {
    traits.eyes = 'regular';
  }

  // Rule 10: Alien Type – Adjusting Eye Trait
  if (traits.type === 'alien' && traits.eyes === 'regular') {
    traits.eyes = 'alien';
  }

  // Rule 11: Ape Type – Converting Messy Hair
  if (traits.type === 'ape') {
    // Convert messy hair to ape versions
    if (traits.short_hair && traits.short_hair.startsWith('messy_') && !traits.short_hair.includes('_ape')) {
      const color = traits.short_hair.replace('messy_', '');
      traits.short_hair = `messy_${color}_ape`;
    }
  } else {
    // Convert ape messy hair back to regular versions when not ape type
    if (traits.short_hair && traits.short_hair.includes('_ape')) {
      const color = traits.short_hair.replace('messy_', '').replace('_ape', '');
      traits.short_hair = `messy_${color}`;
    }
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
  if (isRandomGeneration && traits.long_hair === 'long_curly' && squareHeadphones.includes(traits.headphones)) {
    delete traits.long_hair;
  }

  // Rule 15: Pilot Helmet Incompatible with Square Headphones
  if (isRandomGeneration && traits.hat_over_headphones === 'pilot' && squareHeadphones.includes(traits.headphones)) {
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
    // Filter out special eye types for random selection
    eyes: getRandomItem(TRAIT_CATEGORIES.eyes.options.filter(eye => 
      !['metal', 'mfercoin', 'zombie', 'alien'].includes(eye.id)
    )).id,
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

  // Apply rules to ensure valid combinations, with isRandomGeneration = true
  return applyTraitRules(traits, true);
};

const getThemeColor = (selectedTraits) => {
  const background = TRAIT_CATEGORIES.background.options.find(opt => opt.id === selectedTraits.background);
  return background ? `#${COLOR_MAP[background.id] || '4CAF50'}` : '#4CAF50'; // Default to green if no background selected
};

function Creator({ themeColor, setThemeColor }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedTraits, setSelectedTraits] = useState(() => {
    const initialTraits = generateRandomTraits();
    // Set initial theme color based on the randomly generated background
    const initialThemeColor = getThemeColor(initialTraits);
    setThemeColor(initialThemeColor);
    return initialTraits;
  });
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef();
  const [isThemeChanging, setIsThemeChanging] = useState(false);

  // Update theme color when traits change
  useEffect(() => {
    if (!isThemeChanging) {
      const newThemeColor = getThemeColor(selectedTraits);
      setThemeColor(newThemeColor);
    }
  }, [selectedTraits.background, setThemeColor, isThemeChanging]);

  // Update background trait when theme color changes
  useEffect(() => {
    // Find the background color that matches the theme color
    const colorEntry = Object.entries(COLOR_MAP).find(([_, color]) => `#${color}` === themeColor);
    if (colorEntry) {
      setIsThemeChanging(true);
      setSelectedTraits(prev => {
        const newTraits = {
          ...prev,
          background: colorEntry[0]
        };
        return applyTraitRules(newTraits, false);
      });
      setIsThemeChanging(false);
    }
  }, [themeColor]);

  const handleTraitChange = (traitType, value) => {
    setSelectedTraits(prev => {
      const newTraits = {
        ...prev,
        [traitType]: value
      };
      // Apply rules with isRandomGeneration = false for manual changes
      return applyTraitRules(newTraits, false);
    });
  };

  const handleClearAll = () => {
    setSelectedTraits(prev => ({
      ...Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: '' }), {}),
      type: 'plain',
      eyes: 'regular',
      mouth: 'smile',
      background: 'blue',
      headphones: 'white'  // Add default headphones
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
    <CreatorContainer themeColor={themeColor}>
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
            themeColor={themeColor}
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
    </CreatorContainer>
  );
}

function App() {
  const [themeColor, setThemeColor] = useState('#6D28D9');

  return (
    <Router basename="/avatar-maker">
      <Routes>
        <Route path="/" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Home themeColor={themeColor} /></Layout>} />
        <Route path="/creator" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Creator themeColor={themeColor} setThemeColor={setThemeColor} /></Layout>} />
        <Route path="/og" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><OGMfers themeColor={themeColor} /></Layout>} />
        <Route path="/customs" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Customs themeColor={themeColor} /></Layout>} />
        <Route path="/based" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Based themeColor={themeColor} /></Layout>} />
        <Route path="/my" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><MyMfers themeColor={themeColor} /></Layout>} />
        <Route path="/details" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Details themeColor={themeColor} /></Layout>} />
      </Routes>
    </Router>
  );
}

export default App; 