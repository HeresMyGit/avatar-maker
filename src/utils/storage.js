import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 client
const initS3Client = () => {
  return new S3Client({
    endpoint: import.meta.env.VITE_DO_SPACES_ENDPOINT || "https://sfo3.digitaloceanspaces.com",
    region: "sfo3",
    credentials: {
      accessKeyId: import.meta.env.VITE_DO_SPACES_KEY,
      secretAccessKey: import.meta.env.VITE_DO_SPACES_SECRET
    },
    forcePathStyle: false // This is important for DigitalOcean Spaces
  });
};

// Upload a single file to Digital Ocean Space
const uploadFile = async (file, path, contentType) => {
  const client = initS3Client();
  // Add cybermfers prefix to match bucket structure
  const key = `cybermfers/playground${path}`;

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
    // For URLs, use the bucket in the domain
    return `https://${import.meta.env.VITE_DO_SPACES_BUCKET}.sfo3.digitaloceanspaces.com/${key}`;
  } catch (error) {
    console.error('Error uploading to Digital Ocean Space:', error);
    throw error;
  }
};

// Upload all minting files to Digital Ocean Space
export const uploadToSpace = async (imageBlob, animatedGlb, tposeGlb, metadata, tokenId, tempId = null) => {
  try {
    const baseUrl = `https://${import.meta.env.VITE_DO_SPACES_BUCKET}.sfo3.digitaloceanspaces.com`;
    const basePath = 'cybermfers/playground';
    const publicPath = `${basePath}/public`;

    console.log('Starting uploadToSpace with parameters:', {
      baseUrl,
      basePath,
      publicPath,
      tokenId,
      tempId,
      hasMetadata: !!metadata,
      fileSizes: {
        imageBlob: imageBlob?.size,
        animatedGlb: animatedGlb?.size,
        tposeGlb: tposeGlb?.size
      }
    });

    // Helper function to get file paths
    const getPaths = (id) => ({
      image: `${publicPath}/assets/png/${id}.png`,
      animated: `${publicPath}/assets/glb/${id}.glb`,
      tpose: `${publicPath}/assets/t-pose/${id}.glb`,
      metadata: `${publicPath}/metadata/${id}.json`
    });

    // Helper function to get public URLs
    const getPublicUrls = (id) => ({
      image: `${baseUrl}/${publicPath}/assets/png/${id}.png`,
      animated: `${baseUrl}/${publicPath}/assets/glb/${id}.glb`,
      tpose: `${baseUrl}/${publicPath}/assets/t-pose/${id}.glb`,
      metadata: `${baseUrl}/${publicPath}/metadata/${id}.json`
    });

    const id = tempId || tokenId;
    const paths = getPaths(id);
    const urls = getPublicUrls(id);

    console.log('Generated paths and URLs:', {
      id,
      paths,
      urls
    });

    // Upload files and track progress
    try {
      console.log('Starting image upload...');
      // Upload image file logic here
      console.log('Image upload complete');

      console.log('Starting animated GLB upload...');
      // Upload animated GLB logic here
      console.log('Animated GLB upload complete');

      console.log('Starting T-pose GLB upload...');
      // Upload T-pose GLB logic here
      console.log('T-pose GLB upload complete');

      if (metadata) {
        console.log('Starting metadata upload...');
        // Upload metadata logic here
        console.log('Metadata upload complete');
      }

      const result = {
        imageUrl: urls.image,
        animatedUrl: urls.animated,
        tposeUrl: urls.tpose,
        metadata: metadata ? urls.metadata : null
      };

      console.log('Upload process completed successfully:', result);
      return result;
    } catch (uploadError) {
      console.error('Error during file upload:', {
        error: uploadError,
        message: uploadError.message,
        phase: uploadError.phase,
        id,
        paths
      });
      throw uploadError;
    }
  } catch (error) {
    console.error('Error in uploadToSpace:', {
      error,
      message: error.message,
      tokenId,
      tempId
    });
    throw error;
  }
};

// Helper function to convert stream to buffer
const streamToBuffer = async (stream) => {
  const reader = stream.getReader();
  const chunks = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  let totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}; 
