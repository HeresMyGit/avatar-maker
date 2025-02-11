import { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { getProvider, getOwnedTokens } from '../utils/contract';
import { WalletConnectModal } from '@walletconnect/modal';

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

const MyMfers = () => {
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    const initProvider = async () => {
      const provider = getProvider();
      setProvider(provider);

      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            setAccount(accounts[0]);
          }
        } catch (error) {
          console.error('Error getting accounts:', error);
        }

        window.ethereum.on('accountsChanged', (accounts) => {
          if (accounts.length > 0) {
            setAccount(accounts[0]);
          } else {
            setAccount(null);
          }
        });
      }
    };

    initProvider();

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', () => {});
      }
    };
  }, []);

  useEffect(() => {
    const fetchNFTs = async () => {
      if (!provider || !account) return;

      try {
        setLoading(true);
        const tokens = await getOwnedTokens(provider, account);
        setNfts(tokens);
      } catch (error) {
        console.error('Error fetching NFTs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNFTs();
  }, [provider, account]);

  const handleConnect = async () => {
    try {
      await modal.open();
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  if (!account) {
    return (
      <Container>
        <ConnectButton onClick={handleConnect}>
          Connect Wallet to View Your mfers
        </ConnectButton>
      </Container>
    );
  }

  if (loading) {
    return <Container>Loading your mfers...</Container>;
  }

  return (
    <Container>
      <Title>My mfers</Title>
      <Grid>
        {nfts.map((nft) => (
          <NFTCard key={nft.id}>
            <NFTImage src={nft.image} alt={nft.name} />
            <NFTInfo>
              <NFTName>{nft.name}</NFTName>
              <NFTDescription>{nft.description}</NFTDescription>
            </NFTInfo>
          </NFTCard>
        ))}
      </Grid>
    </Container>
  );
};

const Container = styled.div`
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  margin-bottom: 2rem;
  color: white;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 2rem;
`;

const NFTCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-5px);
  }
`;

const NFTImage = styled.img`
  width: 100%;
  height: 250px;
  object-fit: cover;
`;

const NFTInfo = styled.div`
  padding: 1rem;
`;

const NFTName = styled.h3`
  margin: 0;
  color: white;
  font-size: 1.2rem;
`;

const NFTDescription = styled.p`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  margin: 0.5rem 0 0;
`;

const ConnectButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 1rem 2rem;
  border-radius: 8px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

export default MyMfers; 
