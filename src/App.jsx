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
import CharacterCreator from './components/CharacterCreator';

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

  @media (max-width: 768px) {
    flex-direction: column;
  }

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

  @media (max-width: 768px) {
    flex: none;
    height: 65vh;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
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

  @media (max-width: 768px) {
    flex: none;
    height: 35vh;
    min-width: unset;
    max-width: unset;
    padding: 16px;
    border-left: none;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;

    /* Hide scrollbar for Chrome, Safari and Opera */
    &::-webkit-scrollbar {
      display: none;
    }
    
    /* Hide scrollbar for IE, Edge and Firefox */
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

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

  @media (max-width: 768px) {
    top: 50%;
    right: 10px;
    transform: translateY(-50%);
    flex-direction: column;
    padding: 8px;
    gap: 8px;
    border-radius: 20px;
  }
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

  @media (max-width: 768px) {
    padding: 12px;
    font-size: 1.4em;
    border-radius: 16px;
    width: 48px;
    height: 48px;
    justify-content: center;

    // Hide text on mobile, show only emoji
    span:not(:first-of-type) {
      margin-left: 8px;
    }
  }

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

  @media (max-width: 768px) {
    margin-bottom: 16px;
  }

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

    @media (max-width: 768px) {
      bottom: -8px;
      width: 40px;
    }
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

  @media (max-width: 768px) {
    font-size: 2.5em;
  }
`;

const Subtitle = styled.p`
  font-family: 'SartoshiScript';
  color: rgba(255, 255, 255, 0.7);
  margin: 8px 0 0 0;
  font-size: 1.6em;
  letter-spacing: 0;
  text-shadow: 1px 1px 0px rgba(0, 0, 0, 0.2);

  @media (max-width: 768px) {
    font-size: 1.2em;
    margin: 4px 0 0 0;
  }
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

function Creator({ themeColor, setThemeColor }) {
  const navigate = useNavigate();
  const location = useLocation();
  const characterCreatorRef = useRef(new CharacterCreator());
  const [selectedTraits, setSelectedTraits] = useState(() => {
    return characterCreatorRef.current.getSelectedTraits();
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
  const previewRef = useRef();

  // Initialize theme color
  useEffect(() => {
    const initialThemeColor = characterCreatorRef.current.getThemeColor(selectedTraits);
    setThemeColor(initialThemeColor);
  }, []);

  // Update theme color when background trait changes
  useEffect(() => {
    const newThemeColor = characterCreatorRef.current.getThemeColor(selectedTraits);
    if (newThemeColor !== themeColor) {
      setThemeColor(newThemeColor);
    }
  }, [selectedTraits.background]);

  const handleTraitChange = (traitType, value) => {
    const newTraits = characterCreatorRef.current.handleTraitChange(traitType, value);
    setSelectedTraits({ ...newTraits });
  };

  const handleClearAll = () => {
    const newTraits = characterCreatorRef.current.clearAll();
    setSelectedTraits({ ...newTraits });
  };

  const handleRandom = () => {
    const newTraits = characterCreatorRef.current.randomize();
    setSelectedTraits({ ...newTraits });
  };

  const handleScreenshot = async () => {
    if (previewRef.current?.takeScreenshot) {
      setIsTakingScreenshot(true);
      try {
        await previewRef.current.takeScreenshot();
      } catch (error) {
        console.error('Screenshot failed:', error);
      }
      setIsTakingScreenshot(false);
    }
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
            <span>🎲</span>
            <span>Random</span>
          </Button>
          <Button 
            variant="secondary"
            onClick={handleClearAll}
          >
            <span>↺</span>
            <span>Reset</span>
          </Button>
          <Button 
            variant="primary"
            onClick={handleScreenshot} 
            disabled={!hasSelectedTraits || isTakingScreenshot}
            themeColor={themeColor}
          >
            <span>{isTakingScreenshot ? '⏳' : '📸'}</span>
            <span>{isTakingScreenshot ? 'Processing...' : 'Screenshot'}</span>
          </Button>
          <Button 
            variant="primary"
            onClick={handleExport} 
            disabled={!hasSelectedTraits || isExporting}
            themeColor={themeColor}
          >
            <span>{isExporting ? '⏳' : '⬇️'}</span>
            <span>{isExporting ? 'Exporting...' : 'Export'}</span>
          </Button>
          <Button 
            variant="primary"
            onClick={() => {}} 
            disabled={!hasSelectedTraits}
            themeColor={themeColor}
          >
            <span>🔗</span>
            <span>Mint</span>
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
  const [themeColor, setThemeColor] = useState('#feb66e');

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