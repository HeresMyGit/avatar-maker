import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 client (Digital Ocean Spaces uses S3-compatible API)
const initS3Client = () => {
  return new S3Client({
    endpoint: `https://${import.meta.env.VITE_DO_SPACES_BUCKET}.sfo3.digitaloceanspaces.com`,
    region: "sfo3",
    credentials: {
      accessKeyId: import.meta.env.VITE_DO_SPACES_KEY,
      secretAccessKey: import.meta.env.VITE_DO_SPACES_SECRET
    },
    forcePathStyle: false
  });
};

// Upload a single file to Digital Ocean Space
const uploadFile = async (file, path, contentType) => {
  const client = initS3Client();
  const key = `cybermfers/cybermfers/maker${path}`;

  // Convert Blob/File to ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const command = new PutObjectCommand({
    Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
    Key: key,
    Body: uint8Array,
    ContentType: contentType,
    ACL: "public-read"
  });

  try {
    await client.send(command);
    return `https://${import.meta.env.VITE_DO_SPACES_BUCKET}.sfo3.digitaloceanspaces.com/${key}`;
  } catch (error) {
    console.error('Error uploading to Digital Ocean Space:', error);
    throw error;
  }
};

// Upload all minting files to Digital Ocean Space
export const uploadToSpace = async (imageBlob, animatedGlb, tposeGlb, metadata, tokenId) => {
  try {
    // Upload preview image
    const imagePath = `/maker/public/assets/png/${tokenId}.png`;
    const imageUrl = await uploadFile(imageBlob, imagePath, 'image/png');

    // Upload animated GLB
    const animatedPath = `/maker/public/assets/glb/${tokenId}.glb`;
    const animatedUrl = await uploadFile(animatedGlb, animatedPath, 'model/gltf-binary');

    // Upload T-pose GLB
    const tposePath = `/maker/public/assets/glb/${tokenId}-tpose.glb`;
    const tposeUrl = await uploadFile(tposeGlb, tposePath, 'model/gltf-binary');

    // Update metadata with URLs
    const updatedMetadata = {
      ...metadata,
      image: imageUrl,
      animation_url: animatedUrl,
      glb_url: animatedUrl
    };

    // Upload metadata
    const metadataPath = `/maker/public/metadata/${tokenId}.json`;
    const metadataBlob = new Blob([JSON.stringify(updatedMetadata, null, 2)], { type: 'application/json' });
    await uploadFile(metadataBlob, metadataPath, 'application/json');

    return {
      imageUrl,
      animatedUrl,
      tposeUrl,
      metadata: updatedMetadata
    };
  } catch (error) {
    console.error('Error uploading files:', error);
    throw error;
  }
}; 
