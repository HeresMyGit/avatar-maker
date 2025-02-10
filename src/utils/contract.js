import { parseEther } from 'viem';
import { sepolia } from 'wagmi/chains';

// Contract address from environment variable
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

// Contract ABI for minting functions
export const CONTRACT_ABI = [
  {
    inputs: [{ name: 'uri', type: 'string' }],
    name: 'mint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'ethPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

// Function to get mint price
export const getMintPrice = async (publicClient) => {
  try {
    const price = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'ethPrice',
      chainId: sepolia.id
    });
    return price;
  } catch (error) {
    console.error('Error getting mint price:', error);
    throw error;
  }
};

// Function to mint NFT
export const mintNFT = async (walletClient, publicClient, metadataUri) => {
  try {
    if (!walletClient) {
      throw new Error('Wallet client not initialized');
    }

    // Get the current mint price from the contract using publicClient
    const price = await getMintPrice(publicClient);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'mint',
      args: [metadataUri],
      value: price, // Use the dynamic price from contract
      chainId: sepolia.id
    });

    return hash;
  } catch (error) {
    console.error('Error minting NFT:', error);
    throw error;
  }
}; 