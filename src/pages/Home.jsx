import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const float = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
  100% { transform: translateY(0px); }
`;

const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

const HomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  z-index: 1;
`;

const HeroSection = styled.div`
  text-align: center;
  max-width: 1200px;
  margin: 0 auto;
  padding: 4rem 2rem;
`;

const Title = styled.h1`
  font-family: 'SartoshiScript';
  font-size: 8em;
  font-weight: 400;
  margin: 0;
  background: linear-gradient(135deg, ${props => props.themeColor} 0%, ${props => props.themeColor}DD 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ${fadeIn} 1s ease-out;
  line-height: 1;

  @media (max-width: 768px) {
    font-size: 4em;
  }
`;

const Subtitle = styled.p`
  font-family: 'SartoshiScript';
  color: rgba(255, 255, 255, 0.8);
  font-size: 2.4em;
  margin: 2rem 0;
  max-width: 800px;
  animation: ${fadeIn} 1s ease-out 0.2s backwards;
  line-height: 1.4;

  @media (max-width: 768px) {
    font-size: 1.8em;
  }
`;

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  width: 100%;
  max-width: 1200px;
  margin-top: 4rem;
`;

const FeatureCard = styled.div`
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  animation: ${fadeIn} 1s ease-out ${props => props.delay}s backwards;
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-10px);
    background: rgba(0, 0, 0, 0.4);
    border-color: ${props => props.themeColor}66;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at center, ${props => props.themeColor}0D 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &:hover::before {
    opacity: 1;
  }
`;

const FeatureIcon = styled.div`
  font-size: 4em;
  margin-bottom: 1rem;
  animation: ${float} 6s ease-in-out infinite;
`;

const FeatureTitle = styled.h2`
  font-family: 'SartoshiScript';
  font-size: 2.4em;
  margin: 0 0 1rem;
  background: linear-gradient(135deg, ${props => props.themeColor} 0%, ${props => props.themeColor}DD 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const FeatureDescription = styled.p`
  font-size: 1.2em;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  line-height: 1.6;
`;

const ScrollPrompt = styled.div`
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.6);
  font-size: 1.2em;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  animation: ${pulse} 2s ease-in-out infinite;
`;

const Home = ({ themeColor }) => {
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const features = [
    {
      icon: '🎨',
      title: 'Create',
      description: 'Design your unique mfer character with our intuitive creator tool',
      path: '/creator',
      delay: 0.4
    },
    {
      icon: '✨',
      title: 'Customs',
      description: 'Discover and explore custom mfer collections and rare traits',
      path: '/customs',
      delay: 0.6
    },
    {
      icon: '🌟',
      title: 'Based',
      description: 'Check out the based mfer collection and special editions',
      path: '/based',
      delay: 0.8
    }
  ];

  return (
    <HomeContainer ref={containerRef}>
      <HeroSection>
        <Title themeColor={themeColor}>mfers</Title>
        <Subtitle>Create, customize, and explore the world of mfers in stunning 3D</Subtitle>

        <FeaturesGrid>
          {features.map((feature) => (
            <FeatureCard 
              key={feature.title} 
              onClick={() => navigate(feature.path)}
              themeColor={themeColor}
              delay={feature.delay}
            >
              <FeatureIcon>{feature.icon}</FeatureIcon>
              <FeatureTitle themeColor={themeColor}>{feature.title}</FeatureTitle>
              <FeatureDescription>{feature.description}</FeatureDescription>
            </FeatureCard>
          ))}
        </FeaturesGrid>
      </HeroSection>

      <ScrollPrompt>
        <span>Scroll to explore</span>
        <span>↓</span>
      </ScrollPrompt>
    </HomeContainer>
  );
};

export default Home; 