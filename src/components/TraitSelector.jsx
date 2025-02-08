import { useState } from 'react';
import styled from '@emotion/styled';
import { TRAIT_CATEGORIES } from '../config/traits';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 4px;
  position: relative;
`;

const FiltersButton = styled.button`
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 12px 20px;
  color: white;
  cursor: pointer;
  font-family: 'SartoshiScript';
  font-size: 1.6em;
  width: 100%;
  transition: all 0.3s ease;
  font-weight: 400;

  &:hover {
    background: rgba(0, 0, 0, 0.3);
  }
`;

const FiltersHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`;

const FiltersTitle = styled.div`
  display: flex;
  align-items: center;
`;

const ClearAllButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.themeColor};
  font-family: system-ui;
  font-size: 0.8em;
  padding: 4px 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 6px;

  &:hover {
    background: ${props => props.themeColor}22;
  }
`;

const FiltersCount = styled.span`
  background: ${props => props.themeColor};
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-family: system-ui;
  font-size: 0.7em;
  margin-left: 8px;
`;

const FiltersPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-height: ${props => props.isExpanded ? '2000px' : '0'};
  opacity: ${props => props.isExpanded ? '1' : '0'};
  overflow: hidden;
  transition: all 0.3s ease;
  margin-top: ${props => props.isExpanded ? '24px' : '0'};
`;

const CategoryContainer = styled.div`
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  transition: all 0.3s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.3);
  }
`;

const CategoryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.isExpanded ? '16px' : '0'};
  cursor: pointer;
  transition: all 0.3s ease;
`;

const CategoryTitle = styled.h3`
  font-family: 'SartoshiScript';
  font-size: 1.6em;
  margin: 0;
  color: white;
  font-weight: 400;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  opacity: ${props => props.hasSelection ? '1' : '0.7'};
`;

const SelectedTrait = styled.span`
  font-size: 0.7em;
  opacity: 0.7;
  font-family: system-ui;
  color: ${props => props.themeColor};
  display: block;
  margin-top: 2px;
`;

const ExpandIcon = styled.span`
  font-size: 1.2em;
  transform: rotate(${props => props.isExpanded ? '180deg' : '0deg'});
  transition: transform 0.3s ease;
  opacity: 0.5;
  margin-right: 8px;
`;

const OptionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  overflow: hidden;
  max-height: ${props => props.isExpanded ? '1000px' : '0'};
  opacity: ${props => props.isExpanded ? '1' : '0'};
  transition: all 0.3s ease;
  margin-top: ${props => props.isExpanded ? '16px' : '0'};
`;

const OptionButton = styled.button`
  background: ${props => props.isSelected ? props.themeColor : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.isSelected ? props.themeColor : 'rgba(255, 255, 255, 0.1)'};
  border-radius: 8px;
  padding: 10px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9em;
  text-align: left;
  width: 100%;
  
  &:hover {
    background: ${props => props.isSelected ? props.themeColor : 'rgba(255, 255, 255, 0.1)'};
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const ClearButton = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 0.9em;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.3s ease;

  &:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

function TraitSelector({ selectedTraits, onTraitChange, themeColor }) {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  const handleClearCategory = (e, category) => {
    e.stopPropagation();
    onTraitChange(category, '');
  };

  const handleClearAll = (e) => {
    e.stopPropagation();
    Object.keys(selectedTraits).forEach(category => {
      onTraitChange(category, '');
    });
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const getSelectedTraitLabel = (category, traitId) => {
    if (!traitId) return null;
    const option = TRAIT_CATEGORIES[category].options.find(opt => opt.id === traitId);
    return option ? option.label : null;
  };

  const getActiveFiltersCount = () => {
    // Only count traits that have a non-empty value
    return Object.values(selectedTraits).filter(value => value && value !== '').length;
  };

  return (
    <Container>
      <FiltersButton onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}>
        <FiltersHeader>
          <FiltersTitle>
            Filters {getActiveFiltersCount() > 0 && `(${getActiveFiltersCount()})`}
          </FiltersTitle>
          {getActiveFiltersCount() > 0 && (
            <ClearAllButton 
              onClick={handleClearAll}
              themeColor={themeColor}
            >
              Clear All
            </ClearAllButton>
          )}
        </FiltersHeader>
      </FiltersButton>

      <FiltersPanel isExpanded={isFiltersExpanded}>
        {Object.entries(TRAIT_CATEGORIES).map(([category, { name, options }]) => {
          const isExpanded = expandedCategories[category];
          const selectedTraitId = selectedTraits[category];
          const selectedLabel = getSelectedTraitLabel(category, selectedTraitId);

          return (
            <CategoryContainer key={category}>
              <CategoryHeader 
                isExpanded={isExpanded}
                onClick={() => toggleCategory(category)}
              >
                <CategoryTitle 
                  hasSelection={selectedTraitId}
                  themeColor={themeColor}
                >
                  {name}
                  {!isExpanded && selectedLabel && (
                    <SelectedTrait themeColor={themeColor}>
                      {selectedLabel}
                    </SelectedTrait>
                  )}
                </CategoryTitle>
                <HeaderControls>
                  {selectedTraitId && (
                    <ClearButton onClick={(e) => handleClearCategory(e, category)}>
                      Clear
                    </ClearButton>
                  )}
                  <ExpandIcon isExpanded={isExpanded}>▼</ExpandIcon>
                </HeaderControls>
              </CategoryHeader>
              <OptionsGrid isExpanded={isExpanded}>
                {options.map((option) => (
                  <OptionButton
                    key={option.id}
                    isSelected={selectedTraits[category] === option.id}
                    onClick={() => onTraitChange(category, option.id)}
                    themeColor={themeColor}
                  >
                    {option.label}
                  </OptionButton>
                ))}
              </OptionsGrid>
            </CategoryContainer>
          );
        })}
      </FiltersPanel>
    </Container>
  );
}

export default TraitSelector; 