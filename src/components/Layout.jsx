import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { COLOR_MAP } from '../config/colors';
import { WalletConnectModal } from '@walletconnect/modal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Configure WalletConnect
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const metadata = {
  name: 'mfer Avatars',
  description: 'View your mfer avatars',
  url: window.location.origin,
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// Initialize WalletConnect Modal
const modal = new WalletConnectModal({
  projectId,
  themeMode: 'dark',
  themeVariables: {
    '--wcm-font-family': 'SartoshiScript',
    '--wcm-background-color': '#13151a',
    '--wcm-accent-color': '#feb66e'
  }
});

const queryClient = new QueryClient();

// Navigation items shared across the app
export const NAVIGATION_ITEMS = [
  { path: '/', label: 'Home' },
  { path: '/creator', label: 'Creator' },
  {
    label: 'Galleries',
    dropdownItems: [
      { path: '/og', label: 'OG mfers' },
      { path: '/customs', label: 'Customs' },
      { path: '/based', label: 'Based' },
      { path: '/my', label: 'My mfers' }
    ]
  }
];

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const TopBar = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  padding: 0 30px;
  z-index: 100;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);

  @media (max-width: 768px) {
    padding: 0 20px;
  }
`;

const TopNavigation = styled.nav`
  display: flex;
  align-items: center;
  gap: 2rem;
  margin-left: auto;

  @media (max-width: 1024px) {
    gap: 1rem;
  }
`;

const TopNavItem = styled.div`
  position: relative;
  font-family: 'SartoshiScript';
  font-size: 1.4em;
  color: white;
  cursor: pointer;
  opacity: ${props => props.active ? '1' : '0.6'};
  transition: all 0.3s ease;

  @media (max-width: 1024px) {
    font-size: 1.2em;
  }

  &:hover {
    opacity: 1;
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

const TopNavLink = styled(Link)`
  font-family: 'SartoshiScript';
  font-size: 1.4em;
  color: white;
  text-decoration: none;
  position: relative;
  transition: all 0.3s ease;
  opacity: ${props => props.active ? '1' : '0.6'};
  white-space: nowrap;

  @media (max-width: 1024px) {
    font-size: 1.2em;
  }

  &:hover {
    opacity: 1;
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

const Logo = styled(Link)`
  font-family: 'SartoshiScript';
  font-size: 2em;
  color: white;
  text-decoration: none;
  background: linear-gradient(135deg, ${props => props.themeColor} 0%, ${props => props.themeColor}DD 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-right: 2rem;
`;

const SettingsContainer = styled.div`
  position: relative;
  margin-left: 2rem;
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SettingsButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  cursor: pointer;
  padding: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 20px;
    height: 20px;
    color: ${props => props.color};
    transition: all 0.3s ease;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.5);
    border-color: ${props => props.color}66;
    transform: translateY(-2px);
    
    svg {
      animation: ${spin} 4s linear infinite;
    }
  }

  &:active {
    transform: translateY(0);
  }
`;

const SettingsDropdown = styled.div`
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  padding: 20px;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  opacity: ${props => props.isOpen ? 1 : 0};
  pointer-events: ${props => props.isOpen ? 'all' : 'none'};
  transform: translateY(${props => props.isOpen ? '0' : '-10px'});
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: ${props => props.isOpen ? fadeIn : 'none'} 0.3s ease;
  min-width: 300px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);

  &::before {
    content: '';
    position: absolute;
    top: -6px;
    right: 14px;
    width: 12px;
    height: 12px;
    background: rgba(0, 0, 0, 0.95);
    transform: rotate(45deg);
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
`;

const SettingsSection = styled.div`
  &:not(:last-child) {
    margin-bottom: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
`;

const SettingsTitle = styled.h3`
  font-family: 'SartoshiScript';
  font-size: 1.6em;
  color: ${props => props.themeColor};
  margin: 0 0 16px 0;
  opacity: 0.9;
`;

const ColorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding: 4px;
`;

const ColorButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 2px solid ${props => props.isSelected ? `#${props.colorHex}` : 'rgba(255, 255, 255, 0.1)'};
  background: #${props => props.colorHex};
  cursor: pointer;
  padding: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    border-color: #${props => props.colorHex};
    box-shadow: 0 4px 12px #${props => props.colorHex}33;
  }

  &:active {
    transform: translateY(0);
  }

  ${props => props.isSelected && `
    &::after {
      content: '✓';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: rgba(0, 0, 0, 0.5);
      font-size: 16px;
    }
  `}
`;

const WalletContainer = styled.div`
  w3m-button {
    width: 100%;
    font-family: 'SartoshiScript';
    --w3m-accent-color: ${props => props.themeColor};
    --w3m-font-family: 'SartoshiScript';
    --w3m-button-border-radius: 12px;
    --w3m-background-color: rgba(255, 255, 255, 0.03);
    --w3m-container-border-radius: 12px;
    --w3m-button-hover-bg-color: rgba(255, 255, 255, 0.06);
    --w3m-text-medium-regular-size: 1.4em;
    --w3m-button-border-size: 1px;
    --w3m-button-border-color: rgba(255, 255, 255, 0.1);
    --w3m-wallet-icon-border-radius: 8px;
    --w3m-text-big-bold-size: 1.4em;
    --w3m-color-overlay: ${props => props.themeColor}05;

    &:hover {
      transform: translateY(-2px);
    }
  }
`;

const PageContainer = styled.div`
  min-height: 100vh;
  padding-top: 80px;
  background: linear-gradient(135deg, #13151a 0%, #1a1c23 100%);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 80px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${props => props.themeColor}80, transparent);
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 50% 50%, ${props => props.themeColor}0D 0%, transparent 50%);
    pointer-events: none;
  }
`;

const DropdownContent = styled.div`
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 8px;
  display: ${props => props.isOpen ? 'flex' : 'none'};
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 8px;
  z-index: 1000;

  &::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 12px;
    height: 12px;
    background: rgba(0, 0, 0, 0.95);
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
`;

const DropdownItem = styled(Link)`
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 0.3s ease;
  font-size: 0.9em;
  text-align: center;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const Layout = ({ children, themeColor, onThemeChange }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const location = useLocation();

  const handleColorChange = (color) => {
    onThemeChange(`#${color}`);
  };

  const handleConnect = async () => {
    try {
      await modal.open();
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <PageContainer themeColor={themeColor}>
        <TopBar>
          <Logo to="/" themeColor={themeColor}>mfer avatars</Logo>
          <TopNavigation>
            {NAVIGATION_ITEMS.map((item) => (
              item.dropdownItems ? (
                <TopNavItem
                  key={item.label}
                  active={item.dropdownItems.some(dropItem => location.pathname === dropItem.path)}
                  onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                  themeColor={themeColor}
                >
                  {item.label}
                  <DropdownContent isOpen={openDropdown === item.label}>
                    {item.dropdownItems.map((dropItem) => (
                      <DropdownItem
                        key={dropItem.path}
                        to={dropItem.path}
                        onClick={() => setOpenDropdown(null)}
                      >
                        {dropItem.label}
                      </DropdownItem>
                    ))}
                  </DropdownContent>
                </TopNavItem>
              ) : (
                <TopNavLink
                  key={item.path}
                  to={item.path}
                  active={location.pathname === item.path}
                  themeColor={themeColor}
                >
                  {item.label}
                </TopNavLink>
              )
            ))}
            <SettingsContainer>
              <SettingsButton 
                color={themeColor}
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </SettingsButton>
              <SettingsDropdown isOpen={isSettingsOpen}>
                <SettingsSection>
                  <SettingsTitle themeColor={themeColor}>Wallet</SettingsTitle>
                  <WalletContainer themeColor={themeColor}>
                    <ConnectButton onClick={handleConnect}>
                      Connect Wallet
                    </ConnectButton>
                  </WalletContainer>
                </SettingsSection>
                <SettingsSection>
                  <SettingsTitle themeColor={themeColor}>Theme</SettingsTitle>
                  <ColorGrid>
                    {Object.entries(COLOR_MAP).map(([name, color]) => (
                      <ColorButton
                        key={name}
                        colorHex={color}
                        isSelected={themeColor === `#${color}`}
                        onClick={() => handleColorChange(color)}
                        title={name}
                      />
                    ))}
                  </ColorGrid>
                </SettingsSection>
              </SettingsDropdown>
            </SettingsContainer>
          </TopNavigation>
        </TopBar>
        {children}
      </PageContainer>
    </QueryClientProvider>
  );
};

const ConnectButton = styled.button`
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-family: 'SartoshiScript';
  font-size: 1.4em;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

export default Layout; 