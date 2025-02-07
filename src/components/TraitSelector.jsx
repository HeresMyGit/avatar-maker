import { useState } from 'react';
import styled from '@emotion/styled';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 4px;
  position: relative;
`;

function TraitSelector({ selectedTraits, onTraitChange, themeColor }) {
  return (
    <Container themeColor={themeColor} />
  );
}

export default TraitSelector; 