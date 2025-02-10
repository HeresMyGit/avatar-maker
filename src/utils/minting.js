// Utility functions for minting NFTs
import { uploadToSpace } from './storage';

// Helper function to format trait values for metadata
const formatTraitValue = (traitType, value) => {
  if (!value) return null;
  
  // Format type
  if (traitType === 'type') {
    return `${value} mfer`;
  }
  
  // Format eyes
  if (traitType === 'eyes') {
    return `${value} eyes`;
  }
  
  // Format headphones
  if (traitType === 'headphones') {
    return `${value} headphones`;
  }
  
  // Format beard
  if (traitType === 'beard') {
    return `${value} beard`;
  }
  
  // Format long hair
  if (traitType === 'long_hair') {
    return `long hair ${value.replace('long_', '')}`;
  }
  
  return value;
};

// Function to generate metadata for the NFT
export const generateMetadata = (selectedTraits, tokenId) => {
  // Format attributes with proper trait value formatting
  const attributes = Object.entries(selectedTraits)
    .filter(([_, value]) => value) // Remove empty traits
    .map(([trait_type, value]) => ({
      trait_type: trait_type.replace(/_/g, ' '), // Replace underscores with spaces
      value: formatTraitValue(trait_type, value)
    }));

  return {
    name: `mfer avatar maker #${tokenId}`,
    description: "mfer avatar maker by heresmy.eth, inspired by sartoshi",
    animation_url: "", // Will be updated with DO URL
    image: "", // Will be updated with DO URL
    external_url: `https://ar.mferavatars.xyz/details.html?id=${tokenId}&maker=true`,
    background_color: selectedTraits.background || "ffffff",
    glb_url: "", // Will be updated with DO URL
    attributes
  };
};

// Function to generate a timestamp-based folder name
const generateFolderName = () => {
  const now = new Date();
  // Use timestamp as token ID for now
  const tokenId = Date.now().toString();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return { folderName: `mfer-${timestamp}`, tokenId };
};

// Function to save files and upload to Digital Ocean Space
export const saveAndUpload = async (imageBlob, animatedGlb, tposeGlb, selectedTraits) => {
  try {
    // Generate a token ID from timestamp
    const tokenId = Date.now().toString();
    
    // Generate metadata with the token ID
    const metadata = generateMetadata(selectedTraits, tokenId);

    // Mock the URLs that would come from DO Space
    const mockUrls = {
      imageUrl: `https://example.com/image/${tokenId}.png`,
      animatedUrl: `https://example.com/animated/${tokenId}.glb`,
      tposeUrl: `https://example.com/tpose/${tokenId}.glb`
    };

    // Update metadata with mock URLs
    const updatedMetadata = {
      ...metadata,
      image: mockUrls.imageUrl,
      animation_url: mockUrls.animatedUrl,
      glb_url: mockUrls.tposeUrl
    };

    return {
      tokenId,
      urls: mockUrls,
      metadata: updatedMetadata
    };
  } catch (error) {
    console.error('Error during mock upload:', error);
    throw error;
  }
}; 

