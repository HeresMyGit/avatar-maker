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

    console.log('Starting mintNFT with contract details:', {
      contractAddress: CONTRACT_ADDRESS,
      chainId: sepolia.id,
      options: {
        ...options,
        value: options.value ? options.value.toString() : '0'
      }
    });

    if (!options.value) {
      throw new Error('Mint price is required');
    }

    console.log('Preparing contract write...', {
      abi: 'mint function',
      functionName: 'mint',
      args: [],
      value: options.value.toString()
    });

    const hash = await writeContract(config, {
      abi: CONTRACT_ABI,
      address: CONTRACT_ADDRESS,
      functionName: 'mint',
      args: [],
      value: BigInt(options.value),
      chainId: sepolia.id
    });

    console.log('Contract write response:', hash);

    if (!hash) {
      console.error('Invalid write result:', {
        hash,
        type: typeof hash
      });
      throw new Error('Contract write failed to return transaction hash');
    }

    console.log('Waiting for transaction to be mined...');
    
    // Wait for the transaction to be mined
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: hash 
    });

    console.log('Transaction receipt:', receipt);

    // Find the Transfer event in the logs
    const transferEvent = receipt.logs.find(log => {
      // The Transfer event has 3 indexed parameters (from, to, tokenId)
      return log.topics.length === 4 && 
             log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
    });

    if (!transferEvent) {
      throw new Error('Could not find Transfer event in transaction logs');
    }

    // The tokenId is the third topic (index 3)
    const tokenId = BigInt(transferEvent.topics[3]).toString();

    console.log('Mint successful:', {
      transactionHash: hash,
      tokenId,
      contractAddress: CONTRACT_ADDRESS,
      chainId: sepolia.id
    });

    return {
      hash,
      tokenId
    };
  } catch (error) {
    console.error('Error in mintNFT contract interaction:', {
      error,
      message: error.message,
      code: error.code,
      data: error.data,
      contractAddress: CONTRACT_ADDRESS,
      chainId: sepolia.id,
      stack: error.stack
    });

    // If it's a user rejection, throw a more specific error
    if (error.code === 'ACTION_REJECTED' || error.message?.includes('rejected')) {
      throw new Error('Transaction was rejected by user');
    }

    // If it's a network error, throw a more specific error
    if (error.message?.includes('network') || error.code === 'NETWORK_ERROR') {
      throw new Error('Network error occurred while minting. Please check your connection and try again.');
    }

    // For other errors, include more context
    throw new Error(`Minting failed: ${error.message || 'Unknown error occurred'}`);
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