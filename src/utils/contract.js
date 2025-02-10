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
export const mintNFT = async (walletClient, metadataUri) => {
  try {
    if (!walletClient) {
      throw new Error('Wallet client not initialized');
    }

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'mint',
      args: [metadataUri],
      value: parseEther('0.1'), // Default price is 0.1 ETH
      chainId: sepolia.id
    });

    return hash;
  } catch (error) {
    console.error('Error minting NFT:', error);
    throw error;
  }
}; 