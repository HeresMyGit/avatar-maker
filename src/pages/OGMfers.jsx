import { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { COLOR_MAP } from '../config/colors';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const OGContainer = styled.div`
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

const ModelViewer = styled('model-viewer')`
  width: 100%;
  height: 300px;
  border-radius: 8px;
  margin-bottom: 1rem;
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

const OGMfers = ({ themeColor }) => {
  const [searchId, setSearchId] = useState('');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/public/metadata/");
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const keys = xmlDoc.getElementsByTagName("Key");
        const fetchedModels = [];

        // Only fetch first 20 models for performance
        for (let i = 0; i < Math.min(20, keys.length); i++) {
          const key = keys[i].textContent;
          if (!key.endsWith('.json')) continue;

          const id = key.split('/').pop().split('.')[0];
          const metadataUrl = `https://cybermfers.sfo3.digitaloceanspaces.com/${key}`;
          const metadataResponse = await fetch(metadataUrl);
          const metadata = await metadataResponse.json();

          const backgroundTrait = metadata.attributes.find(attr => attr.trait_type === "background");
          const bgColor = backgroundTrait ? COLOR_MAP[backgroundTrait.value] || "FFFFFF" : "FFFFFF";

          console.log('Metadata for model #' + id + ':', metadata);
          
          // Use the animation URLs from metadata
          const glb = metadata.animation_url;
          const usdz = metadata.usdz_url;

          console.log('Using GLB URL:', glb);
          console.log('Using USDZ URL:', usdz);

          fetchedModels.push({
            id,
            glb,
            usdz,
            bgColor
          });
        }

        setModels(fetchedModels);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching models:', error);
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  const handleSearch = async () => {
    try {
      const response = await fetch('https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/public/metadata/');
      const data = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(data, 'application/xml');
      const files = xml.querySelectorAll('Key');
      let metadataFile;

      files.forEach(file => {
        if (file.textContent === `cybermfers/public/metadata/${searchId}.json`) {
          metadataFile = file.textContent;
        }
      });

      if (metadataFile) {
        window.location.href = `details?id=${searchId}`;
      } else {
        if (window.confirm('That mfer is not minted. Do you want to mint some?')) {
          window.location.href = 'https://opensea.io/collection/mfers';
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <OGContainer>
      <Title themeColor={themeColor}>OG mfers</Title>
      
      <SearchContainer>
        <Input
          type="text"
          placeholder="Enter mfer ID"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          themeColor={themeColor}
        />
        <Button onClick={handleSearch} themeColor={themeColor}>
          Search
        </Button>
      </SearchContainer>

      <ModelsGrid>
        {models.map((model, index) => (
          <ModelCard key={model.id} themeColor={themeColor} delay={0.2 + index * 0.1}>
            <model-viewer
              src={model.glb}
              ios-src={model.usdz}
              alt={`OG mfer #${model.id}`}
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
              onClick={() => window.location.href = `details?id=${model.id}&og=true`}
              style={{ backgroundColor: `#${model.bgColor}` }}
            >
              View mfer #{model.id}
            </ViewDetailsButton>
          </ModelCard>
        ))}
      </ModelsGrid>

      {loading && <LoadingText>Loading OG mfers...</LoadingText>}
    </OGContainer>
  );
};

export default OGMfers; 