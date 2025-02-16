import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled from '@emotion/styled';
import { css, keyframes } from '@emotion/react';
import { Canvas } from '@react-three/fiber';
import { formatEther } from 'viem';
import { sepolia } from 'viem/chains';
import CharacterPreview from '../components/CharacterPreview';
import TraitSelector from '../components/TraitSelector';
import CharacterPlayground from '../components/CharacterPlayground';
import { generateMetadata } from '../utils/minting';
import { uploadToSpace } from '../utils/storage';
import { getMintPrice, mintNFT } from '../utils/contract';
import LoadingOverlay from '../components/LoadingOverlay';
import { useAccount } from 'wagmi';
import { useWeb3Modal } from '@web3modal/wagmi/react';

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

const PlaygroundContainer = styled.div`
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
  gap: 8px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
  padding: 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);

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
  font-family: 'SartoshiScript';
  color: white;
  padding: 12px;
  border-radius: 16px;
  cursor: pointer;
  font-size: 1.6em;
  font-weight: 400;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-transform: none;
  letter-spacing: 0;
  position: relative;
  overflow: hidden;
  min-width: 70px;
  background: linear-gradient(135deg, ${props => props.themeColor}33 0%, ${props => props.themeColor}22 100%);
  border: 1px solid ${props => props.themeColor}44;
  box-shadow: 0 4px 12px ${props => props.themeColor}22;

  span:first-of-type {
    font-size: 1.4em;
    margin-bottom: -2px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  }

  span:last-of-type {
    font-size: 0.9em;
    opacity: 0.9;
  }

  &:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, ${props => props.themeColor}66 0%, ${props => props.themeColor}44 100%);
    opacity: 0;
    transition: opacity 0.3s ease;
    border-radius: 15px;
  }

  &:hover {
    transform: translateY(-2px);
    border-color: ${props => props.themeColor}88;
    box-shadow: 0 8px 24px ${props => props.themeColor}44;

    &:before {
      opacity: 1;
    }
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 768px) {
    padding: 10px;
    font-size: 1.4em;
    border-radius: 14px;
    width: 44px;
    height: 44px;
    min-width: unset;
    justify-content: center;

    span:first-of-type {
      font-size: 1.2em;
      margin: 0;
    }

    // Hide text on mobile, show only emoji
    span:not(:first-of-type) {
      display: none;
    }
  }

  &:disabled {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.05);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
    opacity: 0.5;

    &:before {
      display: none;
    }
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

const ExportDropdownContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const ExportDropdown = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: ${props => props.show ? 'block' : 'none'};
  z-index: 1000;
  overflow: hidden;
`;

const DropdownOption = styled.div`
  padding: 10px 20px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s;
  color: #333;

  &:hover {
    background-color: ${props => `${props.themeColor}22`};
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: ${fadeIn} 0.3s ease;
`;

const ModalContent = styled.div`
  background: rgba(20, 20, 25, 0.95);
  border-radius: 24px;
  padding: 32px;
  max-width: 400px;
  width: 90%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  position: relative;
`;

const ModalTitle = styled.h2`
  font-family: 'SartoshiScript';
  font-size: 2.5em;
  margin: 0 0 24px 0;
  text-align: center;
  ${props => getTitleGradient(props)}
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const PriceOption = styled.button`
  width: 100%;
  padding: 16px;
  margin: 8px 0;
  border-radius: 16px;
  background: ${props => props.active ? `linear-gradient(135deg, ${props.themeColor}CC 0%, ${props.themeColor}99 100%)` : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.active ? props.themeColor : 'rgba(255, 255, 255, 0.1)'};
  color: white;
  font-family: 'SartoshiScript';
  font-size: 1.4em;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;

  &:hover {
    transform: translateY(-2px);
    background: ${props => props.active ? `linear-gradient(135deg, ${props.themeColor}EE 0%, ${props.themeColor}BB 100%)` : 'rgba(255, 255, 255, 0.08)'};
    border-color: ${props => props.active ? props.themeColor : 'rgba(255, 255, 255, 0.15)'};
  }

  span:last-child {
    opacity: 0.7;
    font-size: 0.9em;
  }
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const ModalButton = styled.button`
  flex: 1;
  padding: 16px;
  border-radius: 16px;
  font-family: 'SartoshiScript';
  font-size: 1.4em;
  cursor: pointer;
  transition: all 0.3s ease;
  ${props => getButtonGradient(props)}
  color: white;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }
`;

const ErrorMessage = styled.div`
  position: fixed;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 0, 0, 0.1);
  border: 1px solid rgba(255, 0, 0, 0.3);
  color: white;
  padding: 1rem;
  border-radius: 8px;
  z-index: 1000;
  backdrop-filter: blur(10px);
  max-width: 90%;
  width: fit-content;
  text-align: left;
  font-family: 'SartoshiScript';
  display: flex;
  align-items: flex-start;
  gap: 8px;
  
  &::before {
    content: '⚠️';
    margin-right: 8px;
    flex-shrink: 0;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: white;
  font-size: 1.2em;
  cursor: pointer;
  padding: 4px;
  opacity: 0.7;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
  line-height: 1;
  margin-left: auto;
  
  &:hover {
    opacity: 1;
  }
`;

function Playground({ themeColor, setThemeColor }) {
  const navigate = useNavigate();
  const location = useLocation();
  const characterPlaygroundRef = useRef(new CharacterPlayground());
  const [selectedTraits, setSelectedTraits] = useState(() => {
    return characterPlaygroundRef.current.getSelectedTraits();
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintPrice, setMintPrice] = useState(null);
  const previewRef = useRef();
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState(null);
  const [mintError, setMintError] = useState(null);
  const { address, isConnected } = useAccount();
  const { open } = useWeb3Modal();

  useEffect(() => {
    const fetchMintPrice = async () => {
      try {
        setMintError(null);
        const price = await getMintPrice();
        setMintPrice(price);
      } catch (error) {
        console.error('Error fetching mint price:', error);
        setMintError(error.message);
        setMintPrice(null);
      }
    };

    fetchMintPrice();
  }, []);

  // Initialize theme color
  useEffect(() => {
    const initialThemeColor = characterPlaygroundRef.current.getThemeColor(selectedTraits);
    setThemeColor(initialThemeColor);
  }, []);

  // Update theme color when background trait changes
  useEffect(() => {
    const newThemeColor = characterPlaygroundRef.current.getThemeColor(selectedTraits);
    if (newThemeColor !== themeColor) {
      setThemeColor(newThemeColor);
    }
  }, [selectedTraits.background]);

  const handleTraitChange = (traitType, value) => {
    const newTraits = characterPlaygroundRef.current.handleTraitChange(traitType, value);
    setSelectedTraits({ ...newTraits });
  };

  const handleClearAll = () => {
    const newTraits = characterPlaygroundRef.current.clearAll();
    setSelectedTraits({ ...newTraits });
  };

  const handleRandom = () => {
    const newTraits = characterPlaygroundRef.current.randomize();
    setSelectedTraits({ ...newTraits });
  };

  const handleScreenshot = async () => {
    if (previewRef.current?.takeScreenshot) {
      setIsTakingScreenshot(true);
      try {
        const blob = await previewRef.current.takeScreenshot();
        if (blob) {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'mfer-avatar.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Screenshot failed:', error);
      }
      setIsTakingScreenshot(false);
    }
  };

  const handleExport = async (exportType) => {
    if (previewRef.current?.exportScene) {
      setIsExporting(true);
      setShowExportDropdown(false);
      try {
        const gltfData = await previewRef.current.exportScene(exportType);
        if (gltfData) {
          const dataArray = new Uint8Array(gltfData);
          const blob = new Blob([dataArray], { 
            type: 'model/gltf-binary;charset=utf-8'
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `mfer-avatar${exportType === 't-pose' ? '-t-pose' : ''}.glb`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 1000);
        }
      } catch (error) {
        console.error('Export failed:', error);
      }
      setIsExporting(false);
    }
  };

  const handleMintClick = async () => {
    if (!isConnected) {
      try {
        await open();
      } catch (error) {
        console.error('Error connecting wallet:', error);
        setMintError('Failed to connect wallet: ' + error.message);
      }
    } else {
      setShowPriceModal(true);
    }
  };

  const handleMintConfirm = async () => {
    setShowPriceModal(false);
    await handleMint();
  };

  const handleMint = async () => {
    if (!isConnected || !address) {
      setMintError('No wallet connected');
      return;
    }

    setIsMinting(true);
    setMintError(null);
    try {
      console.log('Starting minting process...', {
        isConnected,
        address,
        mintPrice: mintPrice ? mintPrice.toString() : null,
        selectedPrice: selectedPrice ? selectedPrice.toString() : null
      });

      if (!mintPrice) {
        throw new Error('Mint price not available');
      }

      // Generate all assets first
      console.log('Generating assets...');
      const imageBlob = await previewRef.current.takeScreenshot();
      console.log('Screenshot taken, size:', imageBlob.size);
      
      const animatedGlbData = await previewRef.current.exportScene('animated');
      console.log('Animated GLB generated, size:', animatedGlbData.byteLength);
      
      const tposeGlbData = await previewRef.current.exportScene('t-pose');
      console.log('T-pose GLB generated, size:', tposeGlbData.byteLength);

      if (!imageBlob || !animatedGlbData || !tposeGlbData) {
        throw new Error('Failed to generate model files');
      }

      // Convert GLB data to Blobs
      const animatedGlb = new Blob([animatedGlbData], { type: 'model/gltf-binary' });
      const tposeGlb = new Blob([tposeGlbData], { type: 'model/gltf-binary' });
      console.log('GLB blobs created', {
        animatedSize: animatedGlb.size,
        tposeSize: tposeGlb.size
      });

      // Upload asset files first with a temporary ID
      const tempId = `pre-mint-${Date.now()}`;
      console.log('Starting file upload with temporary ID:', tempId);
      const uploadResult = await uploadToSpace(imageBlob, animatedGlb, tposeGlb, null, tempId);
      console.log('Upload completed:', uploadResult);

      // Mint the NFT
      console.log('Starting NFT mint with parameters:', {
        mintPrice: mintPrice.toString(),
        account: address,
        chainId: sepolia.id
      });
      
      let mintResult;
      try {
        mintResult = await mintNFT({
          value: mintPrice,
          account: address,
          chainId: sepolia.id
        });
      } catch (mintError) {
        console.error('Mint transaction failed:', mintError);
        // If it's a user rejection, we can show a nicer message
        if (mintError.message.includes('rejected')) {
          throw new Error('Transaction was cancelled');
        }
        throw mintError;
      }

      if (!mintResult || !mintResult.hash) {
        console.error('No transaction hash returned from mint');
        throw new Error('Minting failed - no transaction hash returned');
      }

      console.log('Mint transaction successful:', {
        hash: mintResult.hash,
        tokenId: mintResult.tokenId,
        tempId,
        address
      });
      
      // Rename files from temp ID to actual token ID and add metadata
      console.log('Renaming files from temp ID to token ID...');
      const metadata = generateMetadata(selectedTraits, mintResult.tokenId);
      await uploadToSpace(null, null, null, metadata, mintResult.tokenId, tempId);
      
      // Navigate to details page with the actual token ID
      console.log('Navigating to details page with params:', {
        tokenId: mintResult.tokenId,
        needsMint: false
      });
      navigate(`/details?id=${mintResult.tokenId}&playground=true&needsMint=false`);
    } catch (error) {
      console.error('Error in minting process:', {
        error,
        message: error.message,
        code: error.code,
        data: error.data,
        stack: error.stack
      });

      // Set a user-friendly error message
      let errorMessage = 'Failed to mint NFT: ';
      if (error.message.includes('rejected') || error.message.includes('cancelled')) {
        errorMessage += 'Transaction was cancelled';
      } else if (error.message.includes('network')) {
        errorMessage += 'Network error occurred. Please check your connection and try again.';
      } else if (error.message.includes('price')) {
        errorMessage += 'Invalid mint price. Please try again.';
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }
      
      setMintError(errorMessage);
    } finally {
      setIsMinting(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.export-dropdown')) {
        setShowExportDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const hasSelectedTraits = Object.values(selectedTraits).some(Boolean);

  return (
    <>
      <LoadingOverlay isVisible={isMinting} />
      <PlaygroundContainer themeColor={themeColor}>
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
              onClick={handleClearAll}
              themeColor={themeColor}
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
              <span>📸</span>
              <span>Photo</span>
            </Button>
            <ExportDropdownContainer className="export-dropdown">
              <Button 
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                disabled={!hasSelectedTraits || isExporting}
                themeColor={themeColor}
              >
                <span>💾</span>
                <span>Export</span>
              </Button>
              <ExportDropdown show={showExportDropdown}>
                <DropdownOption 
                  onClick={() => handleExport('animated')}
                  themeColor={themeColor}
                >
                  Animated GLB
                </DropdownOption>
                <DropdownOption 
                  onClick={() => handleExport('t-pose')}
                  themeColor={themeColor}
                >
                  T-Pose GLB
                </DropdownOption>
              </ExportDropdown>
            </ExportDropdownContainer>
            <Button 
              variant="primary"
              onClick={handleMintClick}
              disabled={!hasSelectedTraits || isMinting}
              themeColor={themeColor}
            >
              <span>⚡</span>
              <span>
                {isMinting ? 'Minting...' : 'Mint'}
              </span>
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
            <MainTitle themeColor={themeColor}>mfer Playground</MainTitle>
            <Subtitle>Build your unique character</Subtitle>
          </Title>
          <TraitSelector 
            selectedTraits={selectedTraits} 
            onTraitChange={handleTraitChange}
            themeColor={themeColor}
          />
        </SelectorSection>

        {showPriceModal && (
          <ModalOverlay onClick={() => setShowPriceModal(false)}>
            <ModalContent onClick={e => e.stopPropagation()} themeColor={themeColor}>
              <ModalTitle themeColor={themeColor}>Select Mint Price</ModalTitle>
              <PriceOption
                onClick={() => setSelectedPrice(mintPrice)}
                active={selectedPrice === mintPrice}
                themeColor={themeColor}
              >
                <span>ETH Price</span>
                <span>{mintPrice ? `${formatEther(mintPrice)} ETH` : 'Loading...'}</span>
              </PriceOption>
              <PriceOption
                onClick={() => setSelectedPrice('coming_soon')}
                active={selectedPrice === 'coming_soon'}
                themeColor={themeColor}
                disabled
                style={{ opacity: 0.5 }}
              >
                <span>Other Options</span>
                <span>Coming Soon</span>
              </PriceOption>
              <ModalButtons>
                <ModalButton
                  variant="secondary"
                  onClick={() => setShowPriceModal(false)}
                  themeColor={themeColor}
                >
                  Cancel
                </ModalButton>
                <ModalButton
                  variant="primary"
                  onClick={handleMintConfirm}
                  disabled={!selectedPrice || selectedPrice === 'coming_soon'}
                  themeColor={themeColor}
                >
                  Confirm
                </ModalButton>
              </ModalButtons>
            </ModalContent>
          </ModalOverlay>
        )}

        {mintError && (
          <ErrorMessage themeColor={themeColor}>
            <div style={{ wordBreak: 'break-word', flex: 1 }}>{mintError}</div>
            <CloseButton onClick={() => setMintError(null)}>✕</CloseButton>
          </ErrorMessage>
        )}
      </PlaygroundContainer>
    </>
  );
}

export default Playground; 