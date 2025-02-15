import { sepolia } from 'viem/chains'
import { createPublicClient, http, parseEther, formatEther } from 'viem'
import { getWalletClient, writeContract, getAccount } from '@wagmi/core'
import { config } from '../config/wallet'

export const NETWORKS = {
  SEPOLIA: {
    chainId: sepolia.id,
    name: sepolia.name,
    network: 'sepolia',
    nativeCurrency: sepolia.nativeCurrency,
    rpcUrl: import.meta.env.VITE_INFURA_PROJECT_ID 
      ? `https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_PROJECT_ID}`
      : 'https://rpc.sepolia.org'
  }
};

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

// Create a public client
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(NETWORKS.SEPOLIA.rpcUrl)
});

// Add debug logging
console.log('Environment variables:', {
  CONTRACT_ADDRESS,
  VITE_CONTRACT_ADDRESS: import.meta.env.VITE_CONTRACT_ADDRESS,
});

// Add debug logging for network configuration
console.log('Network configuration:', {
  rpcUrl: NETWORKS.SEPOLIA.rpcUrl,
  hasInfuraId: Boolean(import.meta.env.VITE_INFURA_PROJECT_ID)
});

if (!CONTRACT_ADDRESS) {
  console.error('Contract address is missing. Available env vars:', import.meta.env);
}

const CONTRACT_ABI = [
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' }
    ],
    name: 'Transfer',
    type: 'event'
  },
  // Mint functions
  {
    inputs: [],
    name: 'mint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'mintWithToken',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // View functions
  {
    inputs: [],
    name: 'ethPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
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
  },
  {
    inputs: [],
    name: 'getPaymentTokens',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getPaymentAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'freeMints',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

export const getMintPrice = async () => {
  try {
    if (!CONTRACT_ADDRESS) {
      throw new Error('Contract address is not configured');
    }

    console.log('Fetching mint price for contract:', CONTRACT_ADDRESS);
    
    const price = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'ethPrice'
    });

    console.log('Received mint price:', price);
    return price;
  } catch (error) {
    console.error('Error in getMintPrice:', error);
    throw error;
  }
};

export const getFreeMints = async (address) => {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'freeMints',
    args: [address]
  });
};

export const getAcceptedTokens = async () => {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPaymentTokens'
  });
};

export const getTokenPrice = async (tokenAddress) => {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPaymentAmount',
    args: [tokenAddress]
  });
};

export const mintNFT = async (options = {}) => {
  try {
    if (!CONTRACT_ADDRESS) {
      throw new Error('Contract address is not configured');
    }

    console.log('Minting NFT with options:', {
      ...options,
      value: options.value ? options.value.toString() : '0'
    });

    if (!options.value) {
      throw new Error('Mint price is required');
    }

    const { hash } = await writeContract(config, {
      abi: CONTRACT_ABI,
      address: CONTRACT_ADDRESS,
      functionName: 'mint',
      args: [],
      value: BigInt(options.value),
      chainId: sepolia.id
    });

    console.log('Mint transaction hash:', hash);
    return hash;
  } catch (error) {
    console.error('Error in mintNFT:', error);
    throw error;
  }
};

export const mintWithToken = async (tokenAddress, amount, options = {}) => {
  try {
    if (!CONTRACT_ADDRESS) {
      throw new Error('Contract address is not configured');
    }

    console.log('Minting with token:', { tokenAddress, amount });

    const { hash } = await writeContract(config, {
      abi: CONTRACT_ABI,
      address: CONTRACT_ADDRESS,
      functionName: 'mintWithToken',
      args: [tokenAddress, amount],
      chainId: sepolia.id
    });

    console.log('Mint with token transaction hash:', hash);
    return hash;
  } catch (error) {
    console.error('Error in mintWithToken:', error);
    throw error;
  }
};

export const getOwnedTokens = async (address) => {
  const balance = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'balanceOf',
    args: [address]
  });

  const tokenCount = Number(balance);

  const tokens = await Promise.all(
    Array(tokenCount)
      .fill()
      .map(async (_, i) => {
        const tokenId = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [address, i]
        });

        const tokenURI = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'tokenURI',
          args: [tokenId]
        });

        const metadata = await fetch(tokenURI).then(res => res.json());
        return {
          id: tokenId.toString(),
          ...metadata
        };
      })
  );

  return tokens;
}; 