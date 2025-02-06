import { useState } from 'react';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { COLOR_MAP } from '../config/colors';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const GalleryContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  position: relative;
  z-index: 1;
`;

const Title = styled.h1`
  font-family: 'SartoshiScript';
  font-size: 4em;
  font-weight: 400;
  margin: 0 0 1rem;
  background: linear-gradient(135deg, ${props => props.themeColor} 0%, ${props => props.themeColor}DD 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ${fadeIn} 1s ease-out;
`;

const SearchContainer = styled.div`
  display: flex;
  gap: 1rem;
  margin: 2rem 0;
  animation: ${fadeIn} 1s ease-out 0.2s backwards;
`;

const Input = styled.input`
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 14px 20px;
  color: white;
  font-size: 1.2em;
  outline: none;
  transition: all 0.3s ease;

  &:focus {
    border-color: ${props => props.themeColor};
    box-shadow: 0 0 0 2px ${props => props.themeColor}33;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
`;

const Button = styled.button`
  background: linear-gradient(135deg, ${props => props.themeColor} 0%, ${props => props.themeColor}DD 100%);
  font-family: 'SartoshiScript';
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.8em;
  font-weight: 400;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

  &:hover {
    background: linear-gradient(135deg, ${props => props.themeColor}EE 0%, ${props => props.themeColor} 100%);
    transform: translateY(-2px);
  }

  &:disabled {
    background: rgba(255, 255, 255, 0.1);
    cursor: not-allowed;
    transform: none;
  }
`;

const ModelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  width: 100%;
  max-width: 1200px;
  margin-top: 2rem;
`;

const ModelCard = styled.div`
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 1rem;
  animation: ${fadeIn} 1s ease-out ${props => props.delay}s backwards;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-5px);
    border-color: ${props => props.themeColor}66;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
`;

const ViewDetailsButton = styled(Button)`
  width: 100%;
  margin-top: 1rem;
  font-size: 1.4em;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  cursor: pointer;
  color: white;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    opacity: 0.9;
  }
`;

const LoadingText = styled.p`
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.2em;
  margin-top: 2rem;
  animation: ${fadeIn} 1s ease-out;
`;

const Separator = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 2rem 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  position: relative;

  &::after {
    content: 'Featured Models';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #13151a;
    padding: 0 1rem;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.9em;
    white-space: nowrap;
  }
`;

const DownloadButton = styled(Button)`
  width: 100%;
  margin-top: 1rem;
  font-size: 1.4em;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  cursor: pointer;
  color: white;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    opacity: 0.9;
  }
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
  featuredModels = []
}) => {
  const handleDownload = (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <GalleryContainer>
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

      <ModelsGrid>
        {/* Featured models section */}
        {featuredModels.map((model, index) => (
          <ModelCard key={model.id} themeColor={themeColor} delay={0.2 + index * 0.1}>
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
              style={{ backgroundColor: `#${COLOR_MAP[model.color] || 'FFFFFF'}`, width: '100%', height: '300px' }}
            />
            <DownloadButton
              onClick={() => handleDownload(model.glb, `${model.id}.glb`)}
              style={{ backgroundColor: `#${COLOR_MAP[model.color] || 'FFFFFF'}` }}
            >
              Download
            </DownloadButton>
          </ModelCard>
        ))}
      </ModelsGrid>

      {/* Only show separator if we have both featured models and regular models */}
      {featuredModels.length > 0 && models.length > 0 && (
        <Separator />
      )}

      {/* Regular models section */}
      <ModelsGrid>
        {models.map((model, index) => (
          <ModelCard key={model.id} themeColor={themeColor} delay={0.2 + (featuredModels.length + index) * 0.1}>
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
              style={{ backgroundColor: `#${model.bgColor}`, width: '100%', height: '300px' }}
            />
            <ViewDetailsButton
              onClick={() => window.location.href = `details?id=${model.id}${type ? `&${type}=true` : ''}`}
              style={{ backgroundColor: `#${model.bgColor}` }}
            >
              View mfer #{model.id}
            </ViewDetailsButton>
          </ModelCard>
        ))}
      </ModelsGrid>

      {loading && <LoadingText>Loading {type || ''} mfers...</LoadingText>}
    </GalleryContainer>
  );
};

export default MferGallery; 