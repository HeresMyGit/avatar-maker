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

const HomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6rem;
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
`;

const HeroSection = styled.div`
  text-align: center;
  padding: 6rem 2rem;
  position: relative;
  
  &::after {
    content: '';
    position: absolute;
    bottom: -3rem;
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${props => props.themeColor}80, transparent);
  }
`;

const Title = styled.h1`
  font-family: 'SartoshiScript';
  font-size: clamp(4em, 10vw, 8em);
  font-weight: 400;
  margin: 0;
  background: linear-gradient(135deg, ${props => props.themeColor} 0%, ${props => props.themeColor}DD 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ${fadeIn} 1s ease-out;
  line-height: 1;
`;

const Subtitle = styled.p`
  font-family: 'SartoshiScript';
  color: rgba(255, 255, 255, 0.8);
  font-size: clamp(1.8em, 4vw, 2.4em);
  margin: 2rem auto;
  max-width: 800px;
  animation: ${fadeIn} 1s ease-out 0.2s backwards;
  line-height: 1.4;
`;

const CTAButton = styled.button`
  font-family: 'SartoshiScript';
  font-size: 1.8em;
  padding: 1rem 3rem;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, ${props => props.themeColor} 0%, ${props => props.themeColor}DD 100%);
  color: white;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-top: 2rem;
  animation: ${fadeIn} 1s ease-out 0.4s backwards;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px ${props => props.themeColor}33;
  }

  &:active {
    transform: translateY(0);
  }
`;

const Section = styled.section`
  padding: 4rem 0;
  position: relative;
`;

const SectionTitle = styled.h2`
  font-family: 'SartoshiScript';
  font-size: 3em;
  color: ${props => props.themeColor};
  margin: 0 0 3rem;
  text-align: center;
  animation: ${fadeIn} 1s ease-out;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
`;

const Card = styled.div`
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: ${fadeIn} 1s ease-out ${props => props.delay}s backwards;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(10px);

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

const CardTitle = styled.h3`
  font-family: 'SartoshiScript';
  font-size: 2em;
  margin: 1rem 0;
  background: linear-gradient(135deg, ${props => props.themeColor} 0%, ${props => props.themeColor}DD 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const CardDescription = styled.p`
  font-size: 1.2em;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  line-height: 1.6;
`;

const FeatureIcon = styled.div`
  font-size: 3em;
  margin-bottom: 1rem;
  animation: ${float} 6s ease-in-out infinite;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Home = ({ themeColor }) => {
  const navigate = useNavigate();

  const features = [
    {
      icon: '🎨',
      title: 'Create',
      description: 'Design your unique mfer character with our intuitive creator tool. Choose from hundreds of traits and customize every detail.',
      path: '/creator',
      delay: 0.4
    },
    {
      icon: '✨',
      title: 'Mint',
      description: 'Turn your creation into an NFT. Mint your custom mfer and join the community of collectors.',
      path: '/creator',
      delay: 0.5
    },
    {
      icon: '🌟',
      title: 'Collect',
      description: 'Explore and collect unique mfers from different collections. Each with their own special traits and rarities.',
      path: '/og',
      delay: 0.6
    }
  ];

  return (
    <HomeContainer>
      <HeroSection themeColor={themeColor}>
        <Title themeColor={themeColor}>mfer avatars</Title>
        <Subtitle>Create, customize, and mint your unique 3D mfer avatar</Subtitle>
        <CTAButton 
          themeColor={themeColor}
          onClick={() => navigate('/creator')}
        >
          Start Creating
        </CTAButton>
      </HeroSection>

      <Section>
        <SectionTitle themeColor={themeColor}>Features</SectionTitle>
        <Grid>
          {features.map((feature, index) => (
            <Card 
              key={feature.title}
              onClick={() => navigate(feature.path)}
              themeColor={themeColor}
              delay={feature.delay}
            >
              <FeatureIcon>{feature.icon}</FeatureIcon>
              <CardTitle themeColor={themeColor}>{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </Card>
          ))}
        </Grid>
      </Section>
    </HomeContainer>
  );
};

export default Home; 