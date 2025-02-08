import { useState, useEffect } from 'react';
import { useAccount, useContractReads, usePublicClient } from 'wagmi';
import MferGallery from '../components/MferGallery';

// NFT Collection Addresses
const COLLECTIONS = {
  OG_MFERS: '0x79FCDEF22feeD20eDDacbB2587640e45491b757f',
  BASED_MFERS: '0xb8B9673B8A3a60C185e15550fC8D1A2dAAc0f882'
};

// Basic ERC721 ABI for balanceOf and tokenOfOwnerByIndex
const ERC721_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' }
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

function MyMfersContent({ themeColor }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [ownedTokens, setOwnedTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');

  // Setup contract reads for both collections
  const { data: nftData } = useContractReads({
    contracts: [
      {
        address: COLLECTIONS.OG_MFERS,
        abi: ERC721_ABI,
        functionName: 'balanceOf',
        args: [address || '0x0000000000000000000000000000000000000000'],
      },
      {
        address: COLLECTIONS.BASED_MFERS,
        abi: ERC721_ABI,
        functionName: 'balanceOf',
        args: [address || '0x0000000000000000000000000000000000000000'],
      },
    ],
    enabled: isConnected,
  });

  useEffect(() => {
    const fetchOwnedTokens = async () => {
      if (!isConnected || !nftData || !publicClient) return;

      const [ogBalance, basedBalance] = nftData;
      const tokens = [];

      // Fetch OG mfers
      for (let i = 0; i < Number(ogBalance); i++) {
        const tokenId = await getTokenId(publicClient, COLLECTIONS.OG_MFERS, address, i);
        tokens.push({ 
          id: tokenId, 
          collection: 'og',
          glb: `https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/public/${tokenId}.glb`,
          usdz: `https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/public/${tokenId}.usdz`,
          traits: {} // We could fetch traits if needed
        });
      }

      // Fetch Based mfers
      for (let i = 0; i < Number(basedBalance); i++) {
        const tokenId = await getTokenId(publicClient, COLLECTIONS.BASED_MFERS, address, i);
        tokens.push({ 
          id: tokenId, 
          collection: 'based',
          glb: `https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/based/public/${tokenId}.glb`,
          usdz: `https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/based/public/${tokenId}.usdz`,
          traits: {} // We could fetch traits if needed
        });
      }

      setOwnedTokens(tokens);
      setLoading(false);
    };

    fetchOwnedTokens();
  }, [isConnected, nftData, address, publicClient]);

  if (!isConnected) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ color: themeColor }}>My mfers</h1>
        <p>Connect your wallet to view your mfer avatars</p>
        <w3m-button />
      </div>
    );
  }

  return (
    <MferGallery
      title="My mfers"
      themeColor={themeColor}
      models={ownedTokens}
      loading={loading}
      searchId={searchId}
      setSearchId={setSearchId}
      onSearch={() => {
        const token = ownedTokens.find(t => t.id.toString() === searchId);
        if (token) {
          window.location.href = `/details?id=${token.id}${token.collection === 'based' ? '&based=true' : ''}`;
        }
      }}
      searchPlaceholder="Search your mfers"
      marketplaceButtons={[
        {
          label: "Mint OG mfer",
          url: "https://www.mferavatars.xyz",
          disabled: false
        },
        {
          label: "Mint Based mfer",
          url: "https://v2.scatter.art/based-mfer-avatars",
          disabled: false
        }
      ]}
    />
  );
}

async function getTokenId(publicClient, contractAddress, owner, index) {
  const data = await publicClient.readContract({
    address: contractAddress,
    abi: ERC721_ABI,
    functionName: 'tokenOfOwnerByIndex',
    args: [owner, index],
  });
  return Number(data);
}

export default function MyMfers({ themeColor }) {
  return <MyMfersContent themeColor={themeColor} />;
} 
