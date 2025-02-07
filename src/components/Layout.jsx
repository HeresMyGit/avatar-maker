import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { COLOR_MAP } from '../config/colors';

// Navigation items shared across the app
export const NAVIGATION_ITEMS = [
  { path: '/', label: 'Home' },
  { path: '/creator', label: 'Creator' },
  { path: '/og', label: 'OG mfers' },
  { path: '/customs', label: 'Customs' },
  { path: '/based', label: 'Based' },
  { path: '/my', label: 'My mfers' }
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

const ColorPickerContainer = styled.div`
  position: relative;
  margin-left: 2rem;
`;

const ColorPickerButton = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  background: ${props => props.color};
  cursor: pointer;
  padding: 0;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    transform: scale(1.1);
    border-color: white;
  }

  &::before {
    content: '🎨';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 16px;
  }
`;

const ColorPalette = styled.div`
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  opacity: ${props => props.isOpen ? 1 : 0};
  pointer-events: ${props => props.isOpen ? 'all' : 'none'};
  transform: translateY(${props => props.isOpen ? '0' : '-10px'});
  transition: all 0.3s ease;
  animation: ${props => props.isOpen ? fadeIn : 'none'} 0.3s ease;
`;

const ColorButton = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid ${props => props.isSelected ? 'white' : 'rgba(255, 255, 255, 0.2)'};
  background: #${props => props.color};
  cursor: pointer;
  padding: 0;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.2);
    border-color: white;
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

const Layout = ({ children, themeColor, onThemeChange }) => {
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const location = useLocation();

  const handleColorChange = (color) => {
    onThemeChange(`#${color}`);
    setIsColorPickerOpen(false);
  };

  return (
    <PageContainer themeColor={themeColor}>
      <TopBar>
        <Logo to="/" themeColor={themeColor}>mfers</Logo>
        <TopNavigation>
          {NAVIGATION_ITEMS.map(({ path, label }) => (
            <TopNavLink
              key={path}
              to={path}
              active={location.pathname === path}
              themeColor={themeColor}
            >
              {label}
            </TopNavLink>
          ))}
          <ColorPickerContainer>
            <ColorPickerButton 
              color={themeColor}
              onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
            />
            <ColorPalette isOpen={isColorPickerOpen}>
              {Object.entries(COLOR_MAP).map(([name, color]) => (
                <ColorButton
                  key={name}
                  color={color}
                  isSelected={themeColor === `#${color}`}
                  onClick={() => handleColorChange(color)}
                  title={name}
                />
              ))}
            </ColorPalette>
          </ColorPickerContainer>
        </TopNavigation>
      </TopBar>

      {children}
    </PageContainer>
  );
};

export default Layout; 