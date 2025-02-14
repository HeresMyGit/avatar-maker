import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { COLOR_MAP } from '../config/colors';

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
  max-width: 300px;
  margin: 2rem auto;
  animation: ${fadeIn} 1s ease-out 0.2s backwards;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 1rem;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-5px);
    border-color: ${props => props.themeColor}66;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
`;

const ButtonsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin: 1.5rem 0 0.5rem;
  animation: ${fadeIn} 1s ease-out 0.4s backwards;
`;

const Button = styled.button`
  background: transparent;
  font-family: 'SartoshiScript';
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 12px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  font-size: 1.2em;
  font-weight: 400;
  transition: all 0.2s ease;
  opacity: ${props => props.disabled ? 0.3 : 0.8};
  position: relative;
  overflow: hidden;

  &:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${props => props.themeColor};
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: -1;
  }

  &:hover {
    transform: ${props => props.disabled ? 'none' : 'translateY(-2px)'};
    opacity: ${props => props.disabled ? 0.3 : 1};
    border-color: ${props => props.disabled ? 'rgba(255, 255, 255, 0.2)' : props.themeColor};

    &:before {
      opacity: 0.1;
    }
  }

  ${props => props.active && `
    background: ${props.themeColor};
    border-color: ${props.themeColor};
    opacity: 1;
  `}
`;

const FileTypeLabel = styled.span`
  font-size: 0.7em;
  opacity: 0.6;
  margin-left: 4px;
  display: block;
  font-family: 'Inter', sans-serif;
`;

const FileExtension = styled.span`
  font-size: 1.4em;
  font-weight: 500;
`;

const LockIcon = styled.span`
  font-size: 0.8em;
  margin-left: 4px;
`;

const MintButton = styled(Button)`
  width: 100%;
  margin-top: 1rem;
  background: ${props => props.themeColor};
  border-color: ${props => props.themeColor};
  opacity: 1;
  font-size: 1.4em;
  padding: 12px;

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

const ModelViewer = styled('model-viewer')`
  width: 100%;
  height: 300px;
  border-radius: 8px;
  --poster-color: transparent;
  --progress-bar-color: transparent;
  --progress-mask: transparent;
  --progress-bar-height: 0;
`;

const ExtraModelContainer = styled(ModelContainer)`
  margin: 2rem auto;
  animation: ${fadeIn} 1s ease-out;
`;

const ModelTitle = styled.h2`
  font-family: 'SartoshiScript';
  font-size: 2em;
  color: ${props => props.themeColor};
  margin: 1rem 0;
  text-align: center;
  background: linear-gradient(135deg, 
    ${props => props.themeColor}DD 0%, 
    ${props => props.themeColor} 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const EXTRA_ITEMS = [
  { name: 'idle', fileTypes: ['GLB', 'USDZ'] },
  { name: 'christmas', fileTypes: ['GLB', 'USDZ', 'VRM', 'FBX'] },
  { name: 'winter', fileTypes: ['GLB', 'USDZ', 'VRM', 'FBX'] },
  { name: 'drone', fileTypes: ['GLB', 'USDZ', 'FBX'] },
  { name: 'chrome', fileTypes: ['GLB', 'USDZ'] },
  { name: 'chromefull', fileTypes: ['GLB', 'USDZ'] },
  { name: 'lowres', fileTypes: ['GLB', 'VRM'] }
];

const Details = ({ themeColor }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [modelData, setModelData] = useState(null);
  const [needsMint, setNeedsMint] = useState(false);
  const [extraModels, setExtraModels] = useState([]);

  useEffect(() => {
    // Initialize Google Analytics
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-DEMRCQSGLC');
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const isCustom = params.get('custom') === 'true';
    const isBased = params.get('based') === 'true';
    const isPlayground = params.get('playground') === 'true';
    const shouldNeedMint = params.get('needsMint') === 'true';

    if (!id) {
      navigate('/');
      return;
    }

    const fetchModelDetails = async () => {
      try {
        let urlPrefix = isCustom
          ? '/cybermfers/customs/'
          : '/cybermfers/';

        if (isBased) {
          urlPrefix = '/cybermfers/based/';
        } else if (isPlayground) {
          urlPrefix = '/cybermfers/playground/';
        }

        const publicOrPrivate = shouldNeedMint ? "private" : "public";
        const baseUrl = `${urlPrefix}${publicOrPrivate}/`;

        let metadataUrl = `${baseUrl}metadata/${id}.json`;
        if (isBased) {
          metadataUrl = `${baseUrl}metadata/${id}`;
        }

        if (isPlayground) {
          metadataUrl = `https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/playground/public/metadata/${id}.json`;
        }

        console.log('Fetching metadata from:', metadataUrl);

        const response = await fetch(metadataUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const metadata = await response.json();

        const backgroundTrait = metadata.attributes.find(attr => attr.trait_type === "background");
        const bgColor = backgroundTrait ? COLOR_MAP[backgroundTrait.value] || "FFFFFF" : "FFFFFF";

        // Update favicon and manifest
        const faviconLink = document.querySelector('link[rel="icon"]');
        if (faviconLink) {
          faviconLink.href = metadata.image;
        }

        // Add iOS icon
        const iosIconLink = document.createElement('link');
        iosIconLink.rel = 'apple-touch-icon';
        iosIconLink.href = metadata.image;
        document.head.appendChild(iosIconLink);

        // Add manifest for Android
        const manifestContent = {
          icons: [
            {
              src: metadata.image,
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: metadata.image,
              sizes: "512x512",
              type: "image/png"
            }
          ]
        };
        const manifestBlob = new Blob([JSON.stringify(manifestContent)], { type: 'application/json' });
        const manifestUrl = URL.createObjectURL(manifestBlob);
        const manifestLink = document.querySelector('link[rel="manifest"]');
        if (manifestLink) {
          manifestLink.href = manifestUrl;
        } else {
          const newManifestLink = document.createElement('link');
          newManifestLink.rel = 'manifest';
          newManifestLink.href = manifestUrl;
          document.head.appendChild(newManifestLink);
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
          isBased,
          isPlayground,
          baseUrl
        });

        setNeedsMint(shouldNeedMint);

        // Only fetch extra models if this is not an unminted mfer
        if (!shouldNeedMint) {
          // Fetch extra models
          const extraModelsData = await Promise.all(
            EXTRA_ITEMS.map(async (item) => {
              const firstUrl = `${baseUrl}assets/extras/${item.name}/${item.fileTypes[0].toLowerCase()}/${id}.${item.fileTypes[0].toLowerCase()}`;
              try {
                const response = await fetch(firstUrl, { method: 'HEAD' });
                if (response.ok) {
                  return {
                    ...item,
                    id,
                    urls: item.fileTypes.map(type => 
                      `${baseUrl}assets/extras/${item.name}/${type.toLowerCase()}/${id}.${type.toLowerCase()}`
                    )
                  };
                }
              } catch (error) {
                console.error(`Error checking extra model ${item.name}:`, error);
              }
              return null;
            })
          );

          setExtraModels(extraModelsData.filter(Boolean));
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching model details:', error);
        setLoading(false);
      }
    };

    fetchModelDetails();
  }, [location.search, navigate]);

  const downloadFile = async (url, type) => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': '*/*',
        }
      });
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `mfer_${modelData.id}.${type.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      // Track download in Google Analytics
      if (window.gtag) {
        window.gtag('event', 'download', {
          'event_category': 'button_click',
          'event_label': `Download ${type} Button - ID: ${modelData.id}`
        });
      }
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

  const titlePrefix = modelData.isCustom ? 'Custom mfer' : 
                     modelData.isBased ? 'Based mfer' : 
                     modelData.isPlayground ? 'Playground mfer' : 'Mfer';

  return (
    <DetailsContainer>
      <Title themeColor={themeColor}>{`${titlePrefix} #${modelData.id}`}</Title>

      <ModelContainer themeColor={themeColor}>
        <ModelTitle themeColor={themeColor}>Standard</ModelTitle>
        <model-viewer
          src={modelData.glb}
          ios-src={modelData.usdz}
          alt={`${titlePrefix} #${modelData.id}`}
          ar-status="not-presenting"
          shadow-intensity="1"
          camera-controls=""
          auto-rotate=""
          ar=""
          autoplay=""
          loop=""
          style={{ backgroundColor: `#${modelData.bgColor}`, width: '100%', height: '300px' }}
        />

        <ButtonsContainer>
          {[
            { type: 'PNG', label: 'image', url: modelData.image },
            ...(modelData.isPlayground ? [] : [
              { type: 'VRM', label: 'model', url: modelData.vrm_url, requiresMint: true },
              { type: 'FBX', label: 'model', url: modelData.fbx_url, requiresMint: true },
              { type: 'USDZ', label: 'model', url: modelData.usdz },
            ]),
            { type: 'GLB', label: 'model', url: modelData.glb }
          ].map(({ type, label, url, requiresMint: fileRequiresMint }) => (
            <Button
              key={type}
              onClick={() => downloadFile(url, type)}
              disabled={needsMint && fileRequiresMint}
              themeColor={themeColor}
            >
              <FileExtension>{type}</FileExtension>
              {needsMint && fileRequiresMint ? (
                <LockIcon>🔒</LockIcon>
              ) : (
                <FileTypeLabel>{label}</FileTypeLabel>
              )}
            </Button>
          ))}

          {needsMint && (
            <MintButton
              onClick={() => window.location.href = 'https://www.mferavatars.xyz'}
              themeColor={themeColor}
            >
              Mint to unlock all files
            </MintButton>
          )}
        </ButtonsContainer>
      </ModelContainer>

      {modelData.isPlayground && (
        <ExtraModelContainer themeColor={themeColor}>
          <ModelTitle themeColor={themeColor}>T-Pose</ModelTitle>
          <model-viewer
            src={`https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/playground/public/assets/t-pose/${modelData.id}.glb`}
            alt={`${titlePrefix} #${modelData.id} - T-Pose`}
            ar-status="not-presenting"
            shadow-intensity="1"
            camera-controls=""
            auto-rotate=""
            ar=""
            autoplay=""
            loop=""
            style={{ backgroundColor: `#${modelData.bgColor}`, width: '100%', height: '300px' }}
          />
          <ButtonsContainer>
            <Button
              onClick={() => downloadFile(`https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/playground/public/assets/t-pose/${modelData.id}.glb`, 'GLB')}
              themeColor={themeColor}
            >
              <FileExtension>GLB</FileExtension>
              <FileTypeLabel>model</FileTypeLabel>
            </Button>
          </ButtonsContainer>
        </ExtraModelContainer>
      )}

      {extraModels.map((extraModel) => (
        <ExtraModelContainer key={extraModel.name} themeColor={themeColor}>
          <ModelTitle themeColor={themeColor}>
            {extraModel.name.charAt(0).toUpperCase() + extraModel.name.slice(1)}
          </ModelTitle>
          <model-viewer
            src={`${modelData.baseUrl}assets/extras/${extraModel.name}/glb/${modelData.id}.glb`}
            ios-src={`${modelData.baseUrl}assets/extras/${extraModel.name}/usdz/${modelData.id}.usdz`}
            alt={`${titlePrefix} #${modelData.id} - ${extraModel.name}`}
            ar-status="not-presenting"
            shadow-intensity="1"
            camera-controls=""
            auto-rotate=""
            ar=""
            autoplay=""
            loop=""
            style={{ backgroundColor: `#${modelData.bgColor}`, width: '100%', height: '300px' }}
          />
          <ButtonsContainer>
            {extraModel.fileTypes.map((type, index) => (
              <Button
                key={type}
                onClick={() => downloadFile(extraModel.urls[index], type)}
                themeColor={themeColor}
              >
                <FileExtension>{type}</FileExtension>
                <FileTypeLabel>model</FileTypeLabel>
              </Button>
            ))}
          </ButtonsContainer>
        </ExtraModelContainer>
      ))}

      {loading && (
        <LoadingText themeColor={themeColor}>
          Loading {type || ''} mfer...
        </LoadingText>
      )}
    </DetailsContainer>
  );
};

export default Details; 