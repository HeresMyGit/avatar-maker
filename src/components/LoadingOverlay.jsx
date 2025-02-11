import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
`;

const OverlayContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  color: white;
`;

const LoadingSpinner = styled.div`
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid #fff;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
  margin-bottom: 20px;
`;

const Message = styled.div`
  font-size: 1.2rem;
  text-align: center;
  max-width: 80%;
  animation: ${pulse} 2s ease-in-out infinite;
  
  p {
    margin: 8px 0;
  }
  
  strong {
    color: #ff7277;
  }
`;

const LoadingOverlay = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <OverlayContainer>
      <LoadingSpinner />
      <Message>
        <p>Minting your unique mfer...</p>
        <p><strong>Please do not leave this page</strong></p>
        <p>This process may take a few minutes</p>
      </Message>
    </OverlayContainer>
  );
};

export default LoadingOverlay; 