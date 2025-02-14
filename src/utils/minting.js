// Utility functions for minting NFTs
import { uploadToSpace } from './storage';
import { COLOR_MAP } from '../config/colors';

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
    attributes,
    name: `mfer avatar playground #${tokenId}`,
    description: "mfer avatar playground by heresmy.eth, inspired by sartoshi",
    animation_url: "", // Will be updated with DO URL
    image: "", // Will be updated with DO URL
    external_url: `https://ar.mferavatars.xyz/details.html?id=${tokenId}&playground=true`,
    background_color: selectedTraits.background ? COLOR_MAP[selectedTraits.background] : "ffffff",
    glb_url: "" // Will be updated with DO URL
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
export const saveAndUpload = async (imageBlob, animatedGlb, tposeGlb, selectedTraits, tokenId) => {
  try {
    // Generate metadata with the token ID
    const metadata = generateMetadata(selectedTraits, tokenId);

    // Upload all files to Digital Ocean Space
    const result = await uploadToSpace(imageBlob, animatedGlb, tposeGlb, metadata, tokenId);

    return {
      tokenId,
      urls: {
        imageUrl: result.imageUrl,
        animatedUrl: result.animatedUrl,
        tposeUrl: result.tposeUrl
      },
      metadata: result.metadata
    };
  } catch (error) {
    console.error('Error during file upload:', error);
    throw error;
  }
}; 

