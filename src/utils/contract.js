import { ethers } from 'ethers';

export const NETWORKS = {
  SEPOLIA: {
    chainId: 11155111,
    name: 'Sepolia',
    network: 'sepolia',
    nativeCurrency: {
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrl: `https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_PROJECT_ID}`
  }
};

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

const CONTRACT_ABI = [
  // Mint functions
  {
    inputs: [{ name: 'uri', type: 'string' }],
    name: 'mint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'uri', type: 'string' }
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

export const getProvider = async () => {
  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    
    // Check if we're on the right network
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    
    console.log('Current chainId:', chainId);
    console.log('Expected chainId:', NETWORKS.SEPOLIA.chainId);
    
    if (chainId !== NETWORKS.SEPOLIA.chainId) {
      try {
        // Request network switch
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${NETWORKS.SEPOLIA.chainId.toString(16)}` }],
        });
        // After switch, create new provider
        return new ethers.BrowserProvider(window.ethereum);
      } catch (error) {
        if (error.code === 4902) {
          // Network needs to be added
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${NETWORKS.SEPOLIA.chainId.toString(16)}`,
              chainName: NETWORKS.SEPOLIA.name,
              nativeCurrency: NETWORKS.SEPOLIA.nativeCurrency,
              rpcUrls: [NETWORKS.SEPOLIA.rpcUrl]
            }]
          });
          return new ethers.BrowserProvider(window.ethereum);
        }
        throw new Error(`Please switch to the ${NETWORKS.SEPOLIA.name} network`);
      }
    }
    return provider;
  }
  return new ethers.JsonRpcProvider(NETWORKS.SEPOLIA.rpcUrl);
};

export const getSigner = async () => {
  try {
    const provider = await getProvider();
    if (!provider) {
      throw new Error('No provider available');
    }
    console.log('Getting signer from provider...');
    return provider.getSigner();
  } catch (error) {
    console.error('Error getting signer:', error);
    throw error;
  }
};

export const getContract = (signerOrProvider) => {
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider);
};

export const getMintPrice = async (provider) => {
  try {
    if (!CONTRACT_ADDRESS) {
      throw new Error('Contract address is not configured. Please check your environment variables.');
    }
    
    console.log('Getting contract with address:', CONTRACT_ADDRESS);
    const contract = getContract(provider);
    
    // Check if contract exists
    const code = await provider.getCode(CONTRACT_ADDRESS);
    console.log('Contract code:', code);
    
    if (code === '0x' || code === '0x0') {
      throw new Error(`No contract found at address ${CONTRACT_ADDRESS} on the ${NETWORKS.SEPOLIA.name} network`);
    }
    
    console.log('Calling ethPrice function...');
    const price = await contract.ethPrice();
    console.log('ETH price:', price);
    return price;
  } catch (error) {
    console.error('Error in getMintPrice:', error);
    if (error.message.includes('missing revert data')) {
      throw new Error(`Contract call failed at ${CONTRACT_ADDRESS}. Please verify the contract address and ABI. Error: ${error.message}`);
    }
    throw error;
  }
};

export const getFreeMints = async (provider, address) => {
  const contract = getContract(provider);
  return contract.freeMints(address);
};

export const getAcceptedTokens = async (provider) => {
  const contract = getContract(provider);
  return contract.getPaymentTokens();
};

export const getTokenPrice = async (provider, tokenAddress) => {
  const contract = getContract(provider);
  return contract.getPaymentAmount(tokenAddress);
};

export const mintNFT = async (signer, tokenUri, options = {}) => {
  try {
    console.log('Getting contract with address:', CONTRACT_ADDRESS);
    const contract = getContract(signer);
    
    // Check if contract exists
    const code = await signer.provider.getCode(CONTRACT_ADDRESS);
    if (code === '0x' || code === '0x0') {
      throw new Error(`No contract found at address ${CONTRACT_ADDRESS} on the ${NETWORKS.SEPOLIA.name} network`);
    }
    
    console.log('Minting NFT with URI:', tokenUri);
    const tx = await contract.mint(tokenUri, options);
    console.log('Transaction:', tx);
    return tx;
  } catch (error) {
    console.error('Error in mintNFT:', error);
    if (error.message.includes('missing revert data')) {
      throw new Error(`Contract call failed at ${CONTRACT_ADDRESS}. Please verify the contract address and ABI. Error: ${error.message}`);
    }
    throw error;
  }
};

export const mintWithToken = async (signer, tokenAddress, amount, tokenUri) => {
  try {
    console.log('Getting contract with address:', CONTRACT_ADDRESS);
    const contract = getContract(signer);
    
    // Check if contract exists
    const code = await signer.provider.getCode(CONTRACT_ADDRESS);
    if (code === '0x' || code === '0x0') {
      throw new Error(`No contract found at address ${CONTRACT_ADDRESS} on the ${NETWORKS.SEPOLIA.name} network`);
    }
    
    console.log('Minting NFT with token payment:', { tokenAddress, amount, tokenUri });
    const tx = await contract.mintWithToken(tokenAddress, amount, tokenUri);
    console.log('Transaction:', tx);
    return tx;
  } catch (error) {
    console.error('Error in mintWithToken:', error);
    if (error.message.includes('missing revert data')) {
      throw new Error(`Contract call failed at ${CONTRACT_ADDRESS}. Please verify the contract address and ABI. Error: ${error.message}`);
    }
    throw error;
  }
};

export const getOwnedTokens = async (provider, address) => {
  const contract = getContract(provider);
  const balance = await contract.balanceOf(address);
  const tokenCount = Number(balance);

  const tokens = await Promise.all(
    Array(tokenCount)
      .fill()
      .map(async (_, i) => {
        const tokenId = await contract.tokenOfOwnerByIndex(address, i);
        const tokenURI = await contract.tokenURI(tokenId);
        const metadata = await fetch(tokenURI).then(res => res.json());
        return {
          id: tokenId.toString(),
          ...metadata
        };
      })
  );

  return tokens;
}; 