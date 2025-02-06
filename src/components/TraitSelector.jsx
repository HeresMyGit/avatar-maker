import styled from '@emotion/styled';
import { TRAIT_CATEGORIES } from '../config/traits';

const TraitSection = styled.div`
  margin-bottom: 24px;
`;

const TraitTitle = styled.h2`
  margin-bottom: 12px;
  font-size: 1.2em;
`;

const TraitGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 10px;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #4a4a4a;
    border-radius: 4px;
  }
`;

const TraitOption = styled.div`
  padding: 8px;
  border: 2px solid ${props => props.isSelected ? '#4CAF50' : '#666'};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #333;
  
  &:hover {
    border-color: #4CAF50;
    transform: translateY(-2px);
  }

  img {
    width: 100%;
    height: auto;
    border-radius: 4px;
  }
`;

const OptionLabel = styled.div`
  margin-top: 8px;
  font-size: 0.9em;
  text-align: center;
  color: #fff;
`;

const ClearButton = styled.button`
  background: none;
  border: 1px solid #666;
  color: #666;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8em;
  margin-left: 10px;
  transition: all 0.2s ease;

  &:hover {
    border-color: #ff4444;
    color: #ff4444;
  }
`;

function TraitSelector({ selectedTraits, onTraitChange }) {
  const handleClearTrait = (traitType) => {
    onTraitChange(traitType, '');
  };

  return (
    <div>
      {Object.entries(TRAIT_CATEGORIES).map(([traitType, category]) => (
        <TraitSection key={traitType}>
          <TraitTitle>
            {category.name}
            {selectedTraits[traitType] && (
              <ClearButton onClick={() => handleClearTrait(traitType)}>
                Clear
              </ClearButton>
            )}
          </TraitTitle>
          <TraitGrid>
            {category.options.map((option) => (
              <TraitOption
                key={option.id}
                isSelected={selectedTraits[traitType] === option.id}
                onClick={() => onTraitChange(traitType, option.id)}
              >
                <div style={{ 
                  backgroundColor: '#444',
                  width: '100%',
                  paddingBottom: '100%',
                  marginBottom: '4px',
                  borderRadius: '4px'
                }} />
                <OptionLabel>{option.label}</OptionLabel>
              </TraitOption>
            ))}
          </TraitGrid>
        </TraitSection>
      ))}
    </div>
  );
}

export default TraitSelector; 