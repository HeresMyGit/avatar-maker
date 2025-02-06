import styled from '@emotion/styled';
import { TRAIT_CATEGORIES } from '../config/traits';
import { keyframes, css } from '@emotion/react';
import { useState } from 'react';

const shine = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
`;

const glow = keyframes`
  0% { box-shadow: 0 0 5px rgba(76, 175, 80, 0.2), inset 0 0 5px rgba(76, 175, 80, 0.1); }
  50% { box-shadow: 0 0 20px rgba(76, 175, 80, 0.4), inset 0 0 10px rgba(76, 175, 80, 0.2); }
  100% { box-shadow: 0 0 5px rgba(76, 175, 80, 0.2), inset 0 0 5px rgba(76, 175, 80, 0.1); }
`;

const float = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
  100% { transform: translateY(0px); }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 4px;
  position: relative;

  &::before {
    content: '';
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100%;
    background: linear-gradient(
      to bottom,
      ${props => `${props.themeColor}1A`},
      transparent 20%,
      transparent 80%,
      ${props => `${props.themeColor}1A`}
    );
    pointer-events: none;
  }
`;

const TraitSection = styled.div`
  background: rgba(0, 0, 0, 0.4);
  border-radius: 16px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
  animation: ${fadeIn} 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: both;
  animation-delay: ${props => props.index * 0.1}s;
  backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: rgba(0, 0, 0, 0.5);
    transform: translateY(-1px);
  }

  ${props => props.hasSelection && css`
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border: 1px solid ${props => `${props.themeColor}4D`};
      border-radius: 16px;
      pointer-events: none;
    }
  `}

  ${props => !props.isExpanded && css`
    cursor: pointer;
    padding: 14px 16px;

    ${TraitGrid} {
      display: none;
    }
  `}
`;

const TraitHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  padding-bottom: ${props => props.isExpanded ? '12px' : '0'};
  border-bottom: ${props => props.isExpanded ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'};
  margin-bottom: ${props => props.isExpanded ? '16px' : '0'};
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const ExpandIcon = styled.span`
  font-size: 0.7em;
  color: rgba(255, 255, 255, 0.5);
  transition: transform 0.3s ease;
  transform: rotate(${props => props.isExpanded ? '180deg' : '0deg'});
  margin-left: 4px;
`;

const TraitTitle = styled.h2`
  font-family: 'SartoshiScript';
  font-size: 1.6em;
  font-weight: 400;
  color: #fff;
  margin: 0;
  text-transform: none;
  letter-spacing: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  transition: all 0.3s ease;

  &::before {
    content: '';
    display: block;
    width: 6px;
    height: 6px;
    background: ${props => props.themeColor};
    border-radius: 50%;
    opacity: 0.8;
  }
`;

const TraitCount = styled.span`
  font-size: 0.9em;
  color: rgba(255, 255, 255, 0.7);
  background: ${props => `${props.themeColor}1A`};
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 500;
  border: 1px solid ${props => `${props.themeColor}26`};
`;

const SelectedPreview = styled.div`
  font-family: 'SartoshiScript';
  font-size: 1.4em;
  color: ${props => props.themeColor};
  padding: 0;
  margin-top: 4px;
  margin-left: 12px;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 400;
`;

const TraitGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
  gap: 12px;
  margin-top: ${props => props.isExpanded ? '20px' : '0'};
  opacity: ${props => props.isExpanded ? '1' : '0'};
  max-height: ${props => props.isExpanded ? 'none' : '0'};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
`;

const OptionLabel = styled.div`
  font-family: 'SartoshiScript';
  font-size: 1.2em;
  text-align: center;
  color: ${props => props.isSelected ? '#fff' : 'rgba(255, 255, 255, 0.8)'};
  line-height: 1.2;
  font-weight: 400;
  text-shadow: ${props => props.isSelected ? '0 0 10px rgba(76, 175, 80, 0.5)' : 'none'};
  transition: all 0.3s ease;
  position: relative;
  padding: 4px 0;
`;

const TraitOption = styled.div`
  padding: 8px;
  border: 2px solid ${props => props.isSelected ? props.themeColor : 'rgba(255, 255, 255, 0.1)'};
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: ${props => props.isSelected ? `${props.themeColor}26` : 'rgba(0, 0, 0, 0.3)'};
  position: relative;
  overflow: hidden;
  animation: ${props => props.isSelected ? float : 'none'} 3s ease-in-out infinite;
  
  ${props => props.isSelected && css`
    animation: ${glow} 2s infinite;
    transform-origin: center;
  `}
  
  &:hover {
    transform: translateY(-2px) scale(1.05);
    border-color: ${props => props.isSelected ? props.themeColor : `${props.themeColor}80`};
    background: ${props => props.isSelected ? `${props.themeColor}33` : 'rgba(0, 0, 0, 0.4)'};
    z-index: 1;

    ${OptionLabel} {
      color: white;
      transform: translateY(-2px);
    }
  }

  &:active {
    transform: translateY(1px) scale(0.98);
  }

  &::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(45deg, ${props => `${props.themeColor}00`}, ${props => `${props.themeColor}4D`}, ${props => `${props.themeColor}00`});
    z-index: -1;
    opacity: ${props => props.isSelected ? 1 : 0};
    transition: opacity 0.3s ease;
  }
`;

const OptionPreview = styled.div`
  background: rgba(0, 0, 0, 0.4);
  width: 100%;
  padding-bottom: 100%;
  border-radius: 12px;
  margin-bottom: 8px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
  
  ${props => props.isSelected && css`
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border: 2px solid ${props => props.themeColor};
      border-radius: 12px;
      box-shadow: 0 0 15px ${props => `${props.themeColor}4D`};
      background: linear-gradient(45deg, transparent, ${props => `${props.themeColor}1A`});
    }
  `}
`;

const ClearButton = styled.button`
  font-family: 'SartoshiScript';
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.5);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.5em;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  backdrop-filter: blur(5px);
  flex-shrink: 0;

  &:hover {
    color: rgba(255, 255, 255, 0.9);
    background: ${props => `${props.themeColor}1A`};
    border-color: ${props => `${props.themeColor}4D`};
  }

  &:active {
    transform: translateY(1px);
  }

  span {
    font-size: 1.2em;
  }
`;

function TraitSelector({ selectedTraits, onTraitChange, themeColor }) {
  const [expandedSection, setExpandedSection] = useState(null);

  const handleSectionClick = (traitType) => {
    setExpandedSection(expandedSection === traitType ? null : traitType);
  };

  const handleClearTrait = (e, traitType) => {
    e.stopPropagation();
    onTraitChange(traitType, '');
  };

  const getSelectedOptionLabel = (traitType) => {
    if (!selectedTraits[traitType]) return null;
    const category = TRAIT_CATEGORIES[traitType];
    const option = category.options.find(opt => opt.id === selectedTraits[traitType]);
    return option?.label;
  };

  return (
    <Container themeColor={themeColor}>
      {Object.entries(TRAIT_CATEGORIES).map(([traitType, category], index) => {
        const isExpanded = expandedSection === traitType;
        const hasSelection = selectedTraits[traitType];
        const selectedLabel = getSelectedOptionLabel(traitType);
        
        return (
          <TraitSection 
            key={traitType} 
            index={index}
            hasSelection={hasSelection}
            themeColor={themeColor}
            isExpanded={isExpanded}
            onClick={() => handleSectionClick(traitType)}
          >
            <TraitHeader isExpanded={isExpanded}>
              <TitleRow>
                <TraitTitle themeColor={themeColor}>
                  {category.name}
                  <TraitCount themeColor={themeColor}>{category.options.length}</TraitCount>
                  <ExpandIcon isExpanded={isExpanded}>▼</ExpandIcon>
                </TraitTitle>
                {hasSelection && (
                  <ClearButton 
                    onClick={(e) => handleClearTrait(e, traitType)} 
                    themeColor={themeColor}
                  >
                    <span>↺</span> Reset
                  </ClearButton>
                )}
              </TitleRow>
              {!isExpanded && hasSelection && (
                <SelectedPreview themeColor={themeColor}>
                  {selectedLabel}
                </SelectedPreview>
              )}
            </TraitHeader>
            <TraitGrid isExpanded={isExpanded}>
              {category.options.map((option) => (
                <TraitOption
                  key={option.id}
                  isSelected={selectedTraits[traitType] === option.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTraitChange(traitType, option.id);
                  }}
                  themeColor={themeColor}
                >
                  <OptionPreview 
                    isSelected={selectedTraits[traitType] === option.id} 
                    themeColor={themeColor} 
                  />
                  <OptionLabel isSelected={selectedTraits[traitType] === option.id}>
                    {option.label}
                  </OptionLabel>
                </TraitOption>
              ))}
            </TraitGrid>
          </TraitSection>
        );
      })}
    </Container>
  );
}

export default TraitSelector; 