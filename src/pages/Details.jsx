import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const DetailsContainer = styled.div`
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

const ModelContainer = styled.div`
  width: 100%;
  max-width: 800px;
  margin: 2rem auto;
  animation: ${fadeIn} 1s ease-out 0.2s backwards;
`;

const ButtonsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin: 2rem 0;
  animation: ${fadeIn} 1s ease-out 0.4s backwards;
`;

const Button = styled.button`
  background: ${props => props.disabled 
    ? 'rgba(255, 255, 255, 0.1)' 
    : `linear-gradient(135deg, ${props.themeColor} 0%, ${props.themeColor}DD 100%)`};
  font-family: 'SartoshiScript';
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 8px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  font-size: 1.8em;
  font-weight: 400;
  transition: all 0.3s ease;
  box-shadow: ${props => props.disabled ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.2)'};
  opacity: ${props => props.disabled ? 0.5 : 1};

  &:hover {
    background: ${props => props.disabled 
      ? 'rgba(255, 255, 255, 0.1)' 
      : `linear-gradient(135deg, ${props.themeColor}EE 0%, ${props.themeColor} 100%)`};
    transform: ${props => props.disabled ? 'none' : 'translateY(-2px)'};
  }
`;

const LoadingText = styled.p`
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.2em;
  margin-top: 2rem;
  animation: ${fadeIn} 1s ease-out;
`;

const COLOR_MAP = {
  red: "ff7277",
  green: "b7ff6c",
  yellow: "ffe25e",
  orange: "feb66e",
  blue: "5cd3ff",
  turquoise: "4487a3",
  purple: "e175ff",
  tree: "ffe25f",
  space: "898989",
  graveyard: "7c7c7c"
};

const EXTRA_ITEMS = [
  { name: 'idle', fileTypes: ['GLB', 'USDZ'] },
  { name: 'christmas', fileTypes: ['GLB', 'USDZ', 'VRM', 'FBX'] },
  { name: 'winter', fileTypes: ['GLB', 'USDZ', 'VRM', 'FBX'] },
  { name: 'drone', fileTypes: ['GLB', 'USDZ', 'FBX'] },
  { name: 'chrome', fileTypes: ['GLB', 'USDZ'] },
  { name: 'chromefull', fileTypes: ['GLB', 'USDZ'] },
  { name: 'lowres', fileTypes: ['GLB', 'VRM'] }
];

const ModelViewer = styled('model-viewer')`
  width: 100%;
  height: 500px;
  border-radius: 16px;
`;

const Details = ({ themeColor }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [modelData, setModelData] = useState(null);
  const [needsMint, setNeedsMint] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const isCustom = params.get('custom') === 'true';
    const isBased = params.get('based') === 'true';

    if (!id) {
      navigate('/');
      return;
    }

    const fetchModelDetails = async () => {
      try {
        let urlPrefix = isCustom
          ? 'https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/customs/'
          : 'https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/';

        if (isBased) {
          urlPrefix = 'https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/based/';
        }

        const publicOrPrivate = needsMint ? "private" : "public";
        const baseUrl = `${urlPrefix}${publicOrPrivate}/`;

        let metadataUrl = `${baseUrl}metadata/${id}.json`;
        if (isBased) {
          metadataUrl = `${baseUrl}metadata/${id}`;
        }

        const response = await fetch(metadataUrl);
        const metadata = await response.json();

        const backgroundTrait = metadata.attributes.find(attr => attr.trait_type === "background");
        const bgColor = backgroundTrait ? COLOR_MAP[backgroundTrait.value] || "FFFFFF" : "FFFFFF";

        // Update favicon and manifest
        const faviconLink = document.querySelector('link[rel="icon"]');
        if (faviconLink) {
          faviconLink.href = metadata.image;
        }

        setModelData({
          id,
          glb: `${baseUrl}assets/glb/${id}.glb`,
          usdz: `${baseUrl}assets/usdz/${id}.usdz`,
          bgColor,
          image: metadata.image,
          vrm_url: metadata.vrm_url,
          fbx_url: metadata.fbx_url,
          isCustom,
          isBased
        });

        setLoading(false);
      } catch (error) {
        console.error('Error fetching model details:', error);
        setLoading(false);
      }
    };

    fetchModelDetails();
  }, [location.search, navigate, needsMint]);

  const downloadFile = async (url, type) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `mfer_${modelData.id}.${type.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  if (loading) {
    return (
      <DetailsContainer>
        <LoadingText>Loading mfer details...</LoadingText>
      </DetailsContainer>
    );
  }

  if (!modelData) {
    return (
      <DetailsContainer>
        <Title themeColor={themeColor}>Mfer not found</Title>
      </DetailsContainer>
    );
  }

  const titlePrefix = modelData.isCustom ? 'Custom mfer' : modelData.isBased ? 'Based mfer' : 'Mfer';

  return (
    <DetailsContainer>
      <Title themeColor={themeColor}>{`${titlePrefix} #${modelData.id}`}</Title>

      <ModelContainer>
        <ModelViewer
          src={modelData.glb}
          ios-src={modelData.usdz}
          alt={`${titlePrefix} #${modelData.id}`}
          ar-status="not-presenting"
          shadow-intensity="1"
          camera-controls=""
          ar=""
          autoplay=""
          loop=""
          style={{ backgroundColor: `#${modelData.bgColor}` }}
        />
      </ModelContainer>

      <ButtonsContainer>
        {[
          { type: 'PNG', url: modelData.image },
          { type: 'VRM', url: modelData.vrm_url, requiresMint: true },
          { type: 'FBX', url: modelData.fbx_url, requiresMint: true },
          { type: 'USDZ', url: modelData.usdz },
          { type: 'GLB', url: modelData.glb }
        ].map(({ type, url, requiresMint }) => (
          <Button
            key={type}
            onClick={() => downloadFile(url, type)}
            disabled={needsMint && requiresMint}
            themeColor={themeColor}
          >
            {type} {needsMint && requiresMint ? '🔒' : ''}
          </Button>
        ))}

        {needsMint && (
          <Button
            onClick={() => window.location.href = 'https://www.mferavatars.xyz'}
            themeColor={themeColor}
          >
            Mint to unlock all files
          </Button>
        )}
      </ButtonsContainer>
    </DetailsContainer>
  );
};

export default Details; 