import { useState } from 'react';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { COLOR_MAP } from '../config/colors';
import TraitSelector from './TraitSelector';

const float = keyframes`
  0% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(2deg); }
  100% { transform: translateY(0px) rotate(0deg); }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const shimmer = keyframes`
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
`;

const GalleryContainer = styled.div`
  display: grid;
  grid-template-columns: 300px 1fr;
  min-height: 100vh;
  position: relative;
  gap: 2rem;
  padding: 2rem;
  max-width: 1800px;
  margin: 0 auto;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
    padding: 1rem;
  }

  &::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 20% 20%, ${props => props.themeColor}11 0%, transparent 40%),
      radial-gradient(circle at 80% 80%, ${props => props.themeColor}11 0%, transparent 40%);
    z-index: -1;
    pointer-events: none;
  }
`;

const Sidebar = styled.div`
  position: sticky;
  top: 2rem;
  height: calc(100vh - 4rem);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 24px;
  border: 2px solid ${props => props.themeColor}22;
  backdrop-filter: blur(10px);

  @media (max-width: 1024px) {
    position: relative;
    top: 0;
    height: auto;
  }
`;

const Title = styled.h1`
  font-family: 'SartoshiScript';
  font-size: clamp(2.5em, 4vw, 3.5em);
  font-weight: 400;
  margin: 0;
  position: relative;
  background: linear-gradient(135deg, 
    ${props => props.themeColor} 0%, 
    ${props => props.themeColor}DD 50%,
    ${props => props.themeColor} 100%);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ${fadeIn} 1s ease-out;
  text-align: left;
  line-height: 1.2;
`;

const SearchContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;

const Input = styled.input`
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid ${props => props.themeColor}33;
  border-radius: 12px;
  padding: 16px 20px;
  color: white;
  font-size: 1.1em;
  outline: none;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  width: 100%;

  &:focus {
    border-color: ${props => props.themeColor};
    box-shadow: 0 0 0 4px ${props => props.themeColor}22;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
    font-family: 'SartoshiScript';
  }
`;

const Button = styled.button`
  background: linear-gradient(135deg, 
    ${props => props.themeColor} 0%, 
    ${props => props.themeColor}DD 100%);
  font-family: 'SartoshiScript';
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 1.4em;
  font-weight: 400;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px ${props => props.themeColor}44;
  }
`;

const MarketplaceButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
`;

const MarketplaceButton = styled.a`
  background: linear-gradient(135deg, 
    ${props => props.themeColor}15 0%, 
    ${props => props.themeColor}05 100%);
  font-family: 'SartoshiScript';
  color: ${props => props.themeColor};
  text-decoration: none;
  padding: 12px 20px;
  border-radius: 12px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  font-size: 1.4em;
  font-weight: 400;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid ${props => props.themeColor}33;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${props => props.disabled ? 0.5 : 1};
  pointer-events: ${props => props.disabled ? 'none' : 'auto'};
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    border-color: ${props => props.themeColor}66;
    box-shadow: 0 8px 20px ${props => props.themeColor}22;
  }
`;

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3rem;
`;

const GridControls = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  justify-content: flex-end;
`;

const GridButton = styled.button`
  background: ${props => props.active ? 
    `linear-gradient(135deg, ${props.themeColor}88 0%, ${props.themeColor}66 100%)` : 
    'rgba(0, 0, 0, 0.2)'};
  border: 1px solid ${props => props.active ? props.themeColor : props.themeColor + '22'};
  color: ${props => props.active ? 'white' : props.themeColor};
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-family: 'SartoshiScript';
  font-size: 1em;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  backdrop-filter: blur(10px);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px ${props => props.themeColor}22;
    background: ${props => !props.active && `linear-gradient(135deg, ${props.themeColor}22 0%, ${props.themeColor}11 100%)`};
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ModelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${props => props.gridSize}px, 1fr));
  gap: ${props => props.gridSize === 160 ? '1rem' : props.gridSize === 250 ? '1.5rem' : '2rem'};
  align-content: start;
`;

const ModelCard = styled.div`
  position: relative;
  aspect-ratio: 1;
  border-radius: 20px;
  overflow: hidden;
  transform-style: preserve-3d;
  perspective: 1000px;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      transparent 70%,
      rgba(0, 0, 0, 0.9) 100%
    );
    z-index: 1;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  &:hover {
    &::before {
      opacity: 1;
    }

    .model-info {
      transform: translateY(0);
      opacity: 1;
    }

    model-viewer {
      transform: scale(1.05);
    }
  }

  model-viewer {
    width: 100%;
    height: 100%;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    background: ${props => props.bgColor ? `#${props.bgColor}` : 'transparent'};
  }
`;

const ViewDetailsButton = styled(Button)`
  width: 100%;
  background: linear-gradient(135deg, 
    ${props => props.themeColor}88 0%, 
    ${props => props.themeColor}66 100%);
  font-size: 1.2em;
  padding: 12px;
  border: 1px solid ${props => props.themeColor}44;
`;

const ModelInfo = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  z-index: 2;
  transform: translateY(100%);
  opacity: 0;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;

  ${ViewDetailsButton} {
    pointer-events: auto;
  }
`;

const SectionTitle = styled.h2`
  font-family: 'SartoshiScript';
  font-size: 2em;
  color: ${props => props.themeColor};
  margin: 0;
  position: relative;
  padding-left: 1rem;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 70%;
    background: ${props => props.themeColor};
    border-radius: 2px;
  }
`;

const LoadingText = styled.p`
  color: ${props => props.themeColor};
  font-size: 1.6em;
  font-family: 'SartoshiScript';
  text-align: center;
  animation: ${float} 3s ease-in-out infinite;
  margin: 2rem 0;
`;

const SidebarDivider = styled.div`
  height: 1px;
  background: ${props => props.themeColor}22;
  margin: 1rem 0;
`;

const MferGallery = ({ 
  title,
  themeColor,
  models,
  loading,
  searchId,
  setSearchId,
  onSearch,
  searchPlaceholder,
  type,
  featuredModels = [],
  marketplaceButtons = [],
  selectedTraits,
  onTraitChange
}) => {
  const [gridSize, setGridSize] = useState(250);

  const handleDownload = (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <GalleryContainer themeColor={themeColor}>
      <Sidebar themeColor={themeColor}>
        <Title themeColor={themeColor}>{title}</Title>
        
        <SearchContainer>
          <Input
            type="text"
            placeholder={searchPlaceholder || "Enter mfer ID"}
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            themeColor={themeColor}
          />
          <Button onClick={onSearch} themeColor={themeColor}>
            Search
          </Button>
        </SearchContainer>

        <TraitSelector
          themeColor={themeColor}
          selectedTraits={selectedTraits}
          onTraitChange={onTraitChange}
        />

        {marketplaceButtons.length > 0 && (
          <MarketplaceButtons>
            {marketplaceButtons.map((button, index) => (
              <MarketplaceButton
                key={index}
                href={button.url}
                target="_blank"
                rel="noopener noreferrer"
                themeColor={themeColor}
                disabled={button.disabled}
              >
                {button.label}
              </MarketplaceButton>
            ))}
          </MarketplaceButtons>
        )}
      </Sidebar>

      <MainContent>
        <GridControls themeColor={themeColor}>
          <GridButton 
            onClick={() => setGridSize(160)} 
            active={gridSize === 160}
            themeColor={themeColor}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zm-12 6h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zm-12 6h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z"/>
            </svg>
            S
          </GridButton>
          <GridButton 
            onClick={() => setGridSize(250)} 
            active={gridSize === 250}
            themeColor={themeColor}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h7v7H4zm9 0h7v7h-7zm-9 9h7v7H4zm9 0h7v7h-7z"/>
            </svg>
            M
          </GridButton>
          <GridButton 
            onClick={() => setGridSize(350)} 
            active={gridSize === 350}
            themeColor={themeColor}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h16v7H4zm0 9h16v7H4z"/>
            </svg>
            L
          </GridButton>
        </GridControls>

        {featuredModels.length > 0 && (
          <>
            <SectionTitle themeColor={themeColor}>Featured Models</SectionTitle>
            <ModelsGrid gridSize={gridSize}>
              {featuredModels.map((model, index) => (
                <ModelCard key={model.id} bgColor={COLOR_MAP[model.color]}>
                  <model-viewer
                    src={model.glb}
                    ios-src={model.usdz}
                    alt={model.id}
                    ar-status="not-presenting"
                    shadow-intensity="1"
                    camera-controls=""
                    auto-rotate=""
                    ar=""
                    autoplay=""
                    loop=""
                  />
                  <ModelInfo className="model-info">
                    <ViewDetailsButton
                      onClick={() => handleDownload(model.glb, `${model.id}.glb`)}
                      themeColor={themeColor}
                    >
                      Download
                    </ViewDetailsButton>
                  </ModelInfo>
                </ModelCard>
              ))}
            </ModelsGrid>
          </>
        )}

        {models.length > 0 && (
          <>
            <SectionTitle themeColor={themeColor}>All Models</SectionTitle>
            <ModelsGrid gridSize={gridSize}>
              {models.map((model, index) => (
                <ModelCard key={model.id} bgColor={model.bgColor}>
                  <model-viewer
                    src={model.glb}
                    ios-src={model.usdz}
                    alt={`${type} mfer #${model.id}`}
                    ar-status="not-presenting"
                    shadow-intensity="1"
                    camera-controls=""
                    auto-rotate=""
                    ar=""
                    autoplay=""
                    loop=""
                  />
                  <ModelInfo className="model-info">
                    <ViewDetailsButton
                      onClick={() => window.location.href = `details?id=${model.id}${type ? `&${type}=true` : ''}`}
                      themeColor={themeColor}
                    >
                      View mfer #{model.id}
                    </ViewDetailsButton>
                  </ModelInfo>
                </ModelCard>
              ))}
            </ModelsGrid>
          </>
        )}

        {loading && (
          <LoadingText themeColor={themeColor}>
            Loading {type || ''} mfers...
          </LoadingText>
        )}
      </MainContent>
    </GalleryContainer>
  );
};

export default MferGallery; 