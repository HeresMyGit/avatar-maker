import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 client (Digital Ocean Spaces uses S3-compatible API)
const initS3Client = () => {
  return new S3Client({
    endpoint: "https://sfo3.digitaloceanspaces.com",
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
export const uploadToSpace = async (imageBlob, animatedGlb, tposeGlb, metadata, tokenId) => {
  try {
    console.log('Starting file uploads for tokenId:', tokenId);
    
    // Upload preview image
    const imagePath = `/public/assets/png/${tokenId}.png`;
    console.log('Uploading image to:', imagePath);
    const imageUrl = await uploadFile(imageBlob, imagePath, 'image/png');
    console.log('Image uploaded successfully:', imageUrl);

    // Upload animated GLB
    const animatedPath = `/public/assets/glb/${tokenId}.glb`;
    console.log('Uploading animated GLB to:', animatedPath);
    const animatedUrl = await uploadFile(animatedGlb, animatedPath, 'model/gltf-binary');
    console.log('Animated GLB uploaded successfully:', animatedUrl);

    // Upload T-pose GLB to new directory
    const tposePath = `/public/assets/t-pose/${tokenId}.glb`;
    console.log('Uploading T-pose GLB to:', tposePath);
    const tposeUrl = await uploadFile(tposeGlb, tposePath, 'model/gltf-binary');
    console.log('T-pose GLB uploaded successfully:', tposeUrl);

    // Update metadata with URLs
    const updatedMetadata = {
      ...metadata,
      image: imageUrl,
      animation_url: animatedUrl,
      glb_url: animatedUrl,
      tpose_url: tposeUrl
    };

    // Upload metadata
    const metadataPath = `/public/metadata/${tokenId}.json`;
    console.log('Uploading metadata to:', metadataPath);
    const metadataBlob = new Blob([JSON.stringify(updatedMetadata, null, 2)], { type: 'application/json' });
    await uploadFile(metadataBlob, metadataPath, 'application/json');
    console.log('Metadata uploaded successfully');

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

// Function to rename files in Digital Ocean Space after minting
export const renameFilesAfterMint = async (oldTokenId, newTokenId) => {
  console.log(`Starting rename operation from ${oldTokenId} to ${newTokenId}`);
  const client = initS3Client();
  const bucket = import.meta.env.VITE_DO_SPACES_BUCKET;
  const fileTypes = [
    { path: '/public/assets/png/', ext: '.png', contentType: 'image/png' },
    { path: '/public/assets/glb/', ext: '.glb', contentType: 'model/gltf-binary' },
    { path: '/public/assets/t-pose/', ext: '.glb', contentType: 'model/gltf-binary' },
    { path: '/public/metadata/', ext: '.json', contentType: 'application/json' }
  ];

  try {
    for (const { path, ext, contentType } of fileTypes) {
      const oldKey = `cybermfers/maker${path}${oldTokenId}${ext}`;
      const newKey = `cybermfers/maker${path}${newTokenId}${ext}`;
      
      console.log(`Processing file rename:
        From: ${oldKey}
        To: ${newKey}
        Content-Type: ${contentType}`);

      try {
        // First, get the old object
        const getCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: oldKey
        });
        console.log('Fetching original file:', oldKey);

        // Get the object data
        const { Body } = await client.send(getCommand);
        console.log('Successfully retrieved original file');
        
        const fileData = await streamToBuffer(Body);
        console.log('Converted stream to buffer, size:', fileData.length);

        // Upload as new object
        const putCommand = new PutObjectCommand({
          Bucket: bucket,
          Key: newKey,
          Body: fileData,
          ContentType: contentType,
          ACL: 'public-read'
        });

        console.log('Uploading to new location:', newKey);

        await client.send(putCommand);
        console.log('Successfully uploaded to new location');

        // Delete old object
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: oldKey
        });
        console.log('Deleting original file:', oldKey);

        await client.send(deleteCommand);
        console.log('Successfully deleted original file');
      } catch (error) {
        console.warn(`Error processing file ${oldKey}:`, error);
        // Continue with other files even if one fails
        continue;
      }
    }
    console.log('File rename operation completed successfully');
  } catch (error) {
    console.error('Error renaming files:', error);
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
