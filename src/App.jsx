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
import PlaygroundGallery from './pages/PlaygroundGallery';
import { TRAIT_CATEGORIES } from './config/traits';
import { css, keyframes } from '@emotion/react';
import { useNavigate } from 'react-router-dom';
import { COLOR_MAP } from './config/colors';
import CharacterPlayground from './components/CharacterPlayground';
import { generateMetadata } from './utils/minting';
import { uploadToSpace } from './utils/storage';
import { getProvider, getSigner, getMintPrice, mintNFT, getContract } from './utils/contract';
import { formatEther } from 'ethers';
import LoadingOverlay from './components/LoadingOverlay';

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
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [mintError, setMintError] = useState(null);

  useEffect(() => {
    const initProvider = async () => {
      try {
        const provider = await getProvider();
        setProvider(provider);

        if (window.ethereum) {
          try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
              setAccount(accounts[0]);
              try {
                const signer = await provider.getSigner();
                setSigner(signer);
              } catch (error) {
                console.error('Error getting signer:', error);
                setMintError('Error getting signer: ' + error.message);
              }
            }
          } catch (error) {
            console.error('Error getting accounts:', error);
            setMintError('Error getting accounts: ' + error.message);
          }

          window.ethereum.on('accountsChanged', async (accounts) => {
            if (accounts.length > 0) {
              setAccount(accounts[0]);
              try {
                const signer = await provider.getSigner();
                setSigner(signer);
              } catch (error) {
                console.error('Error getting signer after account change:', error);
                setSigner(null);
              }
            } else {
              setAccount(null);
              setSigner(null);
            }
          });

          window.ethereum.on('chainChanged', () => {
            // Reload the page when chain changes
            window.location.reload();
          });
        }
      } catch (error) {
        console.error('Error initializing provider:', error);
        setMintError(error.message);
      }
    };

    initProvider();

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', () => {});
        window.ethereum.removeListener('chainChanged', () => {});
      }
    };
  }, []);

  useEffect(() => {
    const fetchMintPrice = async () => {
      if (provider) {
        try {
          setMintError(null);
          const price = await getMintPrice(provider);
          setMintPrice(price);
        } catch (error) {
          console.error('Error fetching mint price:', error);
          setMintError(error.message);
          setMintPrice(null);
        }
      }
    };

    fetchMintPrice();
  }, [provider]);

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
    console.log(`Starting handleExport for type: ${exportType}`);
    if (previewRef.current?.exportScene) {
      setIsExporting(true);
      setShowExportDropdown(false);
      try {
        console.log('Calling exportScene...');
        const gltfData = await previewRef.current.exportScene(exportType);
        console.log('Received gltfData:', {
          hasData: !!gltfData,
          type: typeof gltfData,
          size: gltfData?.byteLength
        });

        if (gltfData) {
          // Create a copy of the data to avoid any potential memory issues
          const dataArray = new Uint8Array(gltfData);
          console.log('Creating Blob with proper MIME type and encoding...');
          const blob = new Blob([dataArray], { 
            type: 'model/gltf-binary;charset=utf-8'
          });
          console.log('Blob created:', {
            size: blob.size,
            type: blob.type
          });

          // Create a clean object URL
          const url = URL.createObjectURL(blob);
          console.log('Created object URL:', url);

          const a = document.createElement('a');
          a.href = url;
          a.download = `mfer-avatar${exportType === 't-pose' ? '-t-pose' : ''}.glb`;
          document.body.appendChild(a);
          console.log('Triggering download...');
          a.click();
          document.body.removeChild(a);
          
          // Clean up the object URL after a short delay to ensure download starts
          setTimeout(() => {
            URL.revokeObjectURL(url);
            console.log('Cleaned up object URL');
          }, 1000);
          
          console.log('Export completed successfully');
        }
      } catch (error) {
        console.error('Export failed:', error);
        console.error('Error stack:', error.stack);
      }
      setIsExporting(false);
    } else {
      console.warn('exportScene not available on previewRef');
    }
  };

  const handleMintClick = async () => {
    if (!account) {
      try {
        await handleConnectWallet();
      } catch (error) {
        console.error('Error connecting wallet:', error);
        setMintError('Failed to connect wallet: ' + error.message);
      }
    } else {
      setShowPriceModal(true);
    }
  };

  const handleMintConfirm = async () => {
    if (!signer) {
      setMintError('No signer available');
      return;
    }
    setShowPriceModal(false);
    await handleMint();
  };

  const handleMint = async () => {
    if (!signer || !account) {
      setMintError('No signer or account available');
      return;
    }

    setIsMinting(true);
    setMintError(null);
    try {
      // Generate all assets first
      const imageBlob = await previewRef.current.takeScreenshot();
      const animatedGlbData = await previewRef.current.exportScene('animated');
      const tposeGlbData = await previewRef.current.exportScene('t-pose');

      if (!imageBlob || !animatedGlbData || !tposeGlbData) {
        throw new Error('Failed to generate model files');
      }

      // Convert GLB data to Blobs
      const animatedGlb = new Blob([animatedGlbData], { type: 'model/gltf-binary' });
      const tposeGlb = new Blob([tposeGlbData], { type: 'model/gltf-binary' });

      // Upload asset files first with a temporary ID (no metadata yet)
      const tempId = `pre-mint-${Date.now()}`;
      console.log('Uploading asset files with temporary ID:', tempId);
      const tempUploadResult = await uploadToSpace(imageBlob, animatedGlb, tposeGlb, null, tempId);
      console.log('Asset files uploaded with temporary ID');

      // Get contract instance
      const contract = await getContract(signer);

      // Mint the NFT
      console.log('Minting NFT...');
      const mintTx = await mintNFT(signer, {
        value: mintPrice
      });
      console.log('Mint transaction:', mintTx);

      // Wait for transaction to be mined
      console.log('Waiting for transaction to be mined...');
      const receipt = await mintTx.wait();
      console.log('Transaction mined:', receipt);

      // Get the token ID from the mint event
      const mintEvent = receipt.logs.find(log => {
        try {
          const parsedLog = contract.interface.parseLog(log);
          return parsedLog.name === 'Transfer' && parsedLog.args.from === '0x0000000000000000000000000000000000000000';
        } catch (e) {
          return false;
        }
      });

      if (!mintEvent) {
        throw new Error('Could not find mint event in transaction receipt');
      }

      const parsedLog = contract.interface.parseLog(mintEvent);
      const tokenId = parsedLog.args.tokenId.toString();
      console.log('Minted token ID:', tokenId);

      // Generate metadata with actual token ID
      console.log('Generating metadata with token ID:', tokenId);
      const finalMetadata = generateMetadata(selectedTraits, tokenId);

      // Upload final files with metadata, passing tempId for cleanup
      console.log('Uploading final files with token ID:', tokenId);
      const finalUploadResult = await uploadToSpace(
        imageBlob, 
        animatedGlb, 
        tposeGlb, 
        finalMetadata, 
        tokenId,
        tempId // Pass the tempId for cleanup
      );
      console.log('Files and metadata uploaded successfully');

      // Navigate to details page
      navigate(`/details?id=${tokenId}&playground=true`);
    } catch (error) {
      console.error('Error in minting process:', error);
      setMintError(error.message);
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
              <span>Screenshot</span>
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
              disabled={!hasSelectedTraits || isMinting || !account}
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

const handleConnectWallet = async () => {
  try {
    // Check if MetaMask is installed
    if (!window.ethereum) {
      alert('Please install MetaMask to connect your wallet');
      return;
    }

    // Request account access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const account = accounts[0];
    console.log('Connected account:', account);
    
    // Get the signer
    const signer = await getSigner();
    return signer;
  } catch (error) {
    console.error('Error connecting wallet:', error);
    alert('Error connecting wallet. Please try again.');
  }
};

function App() {
  const [themeColor, setThemeColor] = useState('#feb66e');

  return (
    <Router basename="/avatar-maker">
      <Routes>
        <Route path="/" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Home themeColor={themeColor} /></Layout>} />
        <Route path="/playground" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Playground themeColor={themeColor} setThemeColor={setThemeColor} /></Layout>} />
        <Route path="/og" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><OGMfers themeColor={themeColor} /></Layout>} />
        <Route path="/customs" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Customs themeColor={themeColor} /></Layout>} />
        <Route path="/based" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Based themeColor={themeColor} /></Layout>} />
        <Route path="/my" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><MyMfers themeColor={themeColor} /></Layout>} />
        <Route path="/playground-gallery" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><PlaygroundGallery themeColor={themeColor} /></Layout>} />
        <Route path="/details" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Details themeColor={themeColor} /></Layout>} />
        <Route path="*" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Home themeColor={themeColor} /></Layout>} />
      </Routes>
    </Router>
  );
}

export default App; 