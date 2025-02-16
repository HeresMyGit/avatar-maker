import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 client
const initS3Client = () => {
  return new S3Client({
    region: "sfo3",
    endpoint: "https://sfo3.digitaloceanspaces.com",
    credentials: {
      accessKeyId: import.meta.env.VITE_DO_SPACES_KEY,
      secretAccessKey: import.meta.env.VITE_DO_SPACES_SECRET
    }
  });
};

// Upload a single file to Digital Ocean Space
const uploadFile = async (file, path, contentType, basePath) => {
  const client = initS3Client();
  // The path should already include the public/assets part
  const key = `${basePath}${path}`;

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
      image: `/public/assets/png/${id}.png`,
      animated: `/public/assets/glb/${id}.glb`,
      tpose: `/public/assets/t-pose/${id}.glb`,
      metadata: `/public/metadata/${id}.json`
    });

    // Helper function to get public URLs
    const getPublicUrls = (id) => ({
      image: `${baseUrl}/${basePath}/public/assets/png/${id}.png`,
      animated: `${baseUrl}/${basePath}/public/assets/glb/${id}.glb`,
      tpose: `${baseUrl}/${basePath}/public/assets/t-pose/${id}.glb`,
      metadata: `${baseUrl}/${basePath}/public/metadata/${id}.json`
    });

    const client = initS3Client();
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
      // If we have both tempId and tokenId, we need to rename the files
      if (tempId && tokenId) {
        console.log('Renaming files from tempId to tokenId...');
        const tempPaths = getPaths(tempId);
        const tokenPaths = getPaths(tokenId);

        // Helper function to copy a file
        const copyFile = async (sourcePath, destPath) => {
          const copyCommand = new CopyObjectCommand({
            Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
            CopySource: `${import.meta.env.VITE_DO_SPACES_BUCKET}/${basePath}${sourcePath}`,
            Key: `${basePath}${destPath}`,
            ACL: "public-read"
          });
          await client.send(copyCommand);
        };

        // Helper function to delete a file
        const deleteFile = async (path) => {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
            Key: `${basePath}${path}`
          });
          await client.send(deleteCommand);
        };

        // Copy and delete each file
        await Promise.all([
          // Copy files
          copyFile(tempPaths.image, tokenPaths.image),
          copyFile(tempPaths.animated, tokenPaths.animated),
          copyFile(tempPaths.tpose, tokenPaths.tpose),
          // Delete old files
          deleteFile(tempPaths.image),
          deleteFile(tempPaths.animated),
          deleteFile(tempPaths.tpose)
        ]);

        console.log('File renaming completed');

        // Always create metadata with the actual token ID after renaming
        if (metadata) {
          console.log('Creating metadata with token ID...');
          const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
          await uploadFile(metadataBlob, tokenPaths.metadata, 'application/json', basePath);
          console.log('Metadata upload complete');
        }
      } else {
        console.log('Starting image upload...');
        await uploadFile(imageBlob, paths.image, 'image/png', basePath);
        console.log('Image upload complete');

        console.log('Starting animated GLB upload...');
        await uploadFile(animatedGlb, paths.animated, 'model/gltf-binary', basePath);
        console.log('Animated GLB upload complete');

        console.log('Starting T-pose GLB upload...');
        await uploadFile(tposeGlb, paths.tpose, 'model/gltf-binary', basePath);
        console.log('T-pose GLB upload complete');

        // Upload metadata with temporary ID for initial upload
        if (metadata) {
          console.log('Creating metadata with temporary ID...');
          const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
          await uploadFile(metadataBlob, paths.metadata, 'application/json', basePath);
          console.log('Metadata upload complete');
        }
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
