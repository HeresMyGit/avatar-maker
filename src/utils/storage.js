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
  const key = `cybermfers/maker${path}`;

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

    // If we have a tempId, we'll first try to rename the existing files
    if (tempId) {
      try {
        const client = initS3Client();
        console.log('Starting rename operations...');
        
        // Log the paths we're working with
        const oldPaths = getPaths(tempId);
        const newPaths = getPaths(tokenId);
        
        console.log('Base paths:', {
          bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
          baseUrl,
          publicPath
        });
        
        // Perform the rename operations for asset files using S3 CopyObject
        await Promise.all([
          // Rename image
          (async () => {
            console.log('Renaming image:', { from: oldPaths.image, to: newPaths.image });
            
            await client.send(new CopyObjectCommand({
              Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
              CopySource: `${import.meta.env.VITE_DO_SPACES_BUCKET}/${oldPaths.image}`,
              Key: newPaths.image,
              ACL: 'public-read'
            }));
            console.log('Image copied successfully');
            
            await client.send(new DeleteObjectCommand({
              Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
              Key: oldPaths.image
            }));
            console.log('Old image deleted');
          })(),
          
          // Rename animated GLB
          (async () => {
            console.log('Renaming animated GLB:', { from: oldPaths.animated, to: newPaths.animated });
            
            await client.send(new CopyObjectCommand({
              Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
              CopySource: `${import.meta.env.VITE_DO_SPACES_BUCKET}/${oldPaths.animated}`,
              Key: newPaths.animated,
              ACL: 'public-read'
            }));
            console.log('Animated GLB copied successfully');
            
            await client.send(new DeleteObjectCommand({
              Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
              Key: oldPaths.animated
            }));
            console.log('Old animated GLB deleted');
          })(),
          
          // Rename t-pose GLB
          (async () => {
            console.log('Renaming t-pose GLB:', { from: oldPaths.tpose, to: newPaths.tpose });
            
            await client.send(new CopyObjectCommand({
              Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
              CopySource: `${import.meta.env.VITE_DO_SPACES_BUCKET}/${oldPaths.tpose}`,
              Key: newPaths.tpose,
              ACL: 'public-read'
            }));
            console.log('T-pose GLB copied successfully');
            
            await client.send(new DeleteObjectCommand({
              Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
              Key: oldPaths.tpose
            }));
            console.log('Old t-pose GLB deleted');
          })()
        ]);

        console.log('All asset files renamed successfully');
        
        // After successful rename, we only need to handle metadata
        if (metadata) {
          console.log('Preparing metadata with URLs:', {
            tokenId,
            baseUrl,
            publicPath
          });
          
          // Update metadata URLs with public paths
          const publicUrls = getPublicUrls(tokenId);
          metadata.image = publicUrls.image;
          metadata.animation_url = publicUrls.animated;
          metadata.glb_url = publicUrls.tpose;
          metadata.external_url = publicUrls.metadata;

          console.log('Updated metadata URLs:', {
            image: metadata.image,
            animation_url: metadata.animation_url,
            glb_url: metadata.glb_url,
            external_url: metadata.external_url
          });

          // Upload metadata
          const metadataPath = getPaths(tokenId).metadata;
          console.log('Uploading metadata:', { path: metadataPath });
          await client.send(new PutObjectCommand({
            Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
            Key: metadataPath,
            Body: JSON.stringify(metadata, null, 2),
            ContentType: 'application/json',
            ACL: 'public-read'
          }));
          console.log('Metadata uploaded successfully');
        }
      } catch (error) {
        console.error('Error during rename operations:', error);
        if (error.name === 'NoSuchKey') {
          console.error('File not found during rename. This could mean the temporary files were not created successfully.');
        }
        throw error; // Don't fall back to new upload, throw error instead
      }
    } else {
      // Initial upload with temporary ID
      const paths = getPaths(tempId || tokenId);
      console.log('Starting initial upload operations...');
      const client = initS3Client();
      
      await Promise.all([
        // Upload image
        (async () => {
          console.log('Uploading image:', { path: paths.image });
          await client.send(new PutObjectCommand({
            Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
            Key: paths.image,
            Body: await imageBlob.arrayBuffer(),
            ContentType: 'image/png',
            ACL: 'public-read'
          }));
          console.log('Image uploaded successfully');
        })(),
        
        // Upload animated GLB
        (async () => {
          console.log('Uploading animated GLB:', { path: paths.animated });
          await client.send(new PutObjectCommand({
            Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
            Key: paths.animated,
            Body: await animatedGlb.arrayBuffer(),
            ContentType: 'model/gltf-binary',
            ACL: 'public-read'
          }));
          console.log('Animated GLB uploaded successfully');
        })(),
        
        // Upload t-pose GLB
        (async () => {
          console.log('Uploading t-pose GLB:', { path: paths.tpose });
          await client.send(new PutObjectCommand({
            Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
            Key: paths.tpose,
            Body: await tposeGlb.arrayBuffer(),
            ContentType: 'model/gltf-binary',
            ACL: 'public-read'
          }));
          console.log('T-pose GLB uploaded successfully');
        })()
      ]);
      
      console.log('All asset files uploaded successfully');
    }

    // Return the appropriate URLs based on whether we have metadata
    const publicUrls = getPublicUrls(tokenId);
    return {
      metadata: metadata ? {
        ...metadata,
        image: publicUrls.image,
        animation_url: publicUrls.animated,
        glb_url: publicUrls.tpose,
        external_url: publicUrls.metadata
      } : null,
      urls: {
        image: publicUrls.image,
        animated: publicUrls.animated,
        tpose: publicUrls.tpose
      }
    };
  } catch (error) {
    console.error('Error in uploadToSpace:', error);
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
