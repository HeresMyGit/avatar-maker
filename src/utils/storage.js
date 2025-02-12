import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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
    // Upload preview image
    const imagePath = `/public/assets/png/${tokenId}.png`;
    const imageUrl = await uploadFile(imageBlob, imagePath, 'image/png');

    // Upload animated GLB
    const animatedPath = `/public/assets/glb/${tokenId}.glb`;
    const animatedUrl = await uploadFile(animatedGlb, animatedPath, 'model/gltf-binary');

    // Upload T-pose GLB to new directory
    const tposePath = `/public/assets/t-pose/${tokenId}.glb`;
    const tposeUrl = await uploadFile(tposeGlb, tposePath, 'model/gltf-binary');

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

// Function to rename files in Digital Ocean Space after minting
export const renameFilesAfterMint = async (oldTokenId, newTokenId) => {
  const client = initS3Client();
  const bucket = import.meta.env.VITE_DO_SPACES_BUCKET;
  const fileTypes = [
    { path: '/public/assets/png/', ext: '.png' },
    { path: '/public/assets/glb/', ext: '.glb' },
    { path: '/public/assets/t-pose/', ext: '.glb' },
    { path: '/public/metadata/', ext: '.json' }
  ];

  try {
    for (const { path, ext } of fileTypes) {
      const oldKey = `cybermfers/maker${path}${oldTokenId}${ext}`;
      const newKey = `cybermfers/maker${path}${newTokenId}${ext}`;

      // Copy the object to new key with CORS headers
      const copyCommand = new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${oldKey}`,
        Key: newKey,
        ACL: "public-read",
        MetadataDirective: 'REPLACE',
        ContentType: ext === '.json' ? 'application/json' : 
                    ext === '.png' ? 'image/png' : 
                    'model/gltf-binary',
        Metadata: {
          'x-amz-meta-cors': '*'
        }
      });

      // Add CORS headers to the request
      copyCommand.middlewareStack.add(
        (next) => async (args) => {
          if (!args.request.headers) {
            args.request.headers = {};
          }
          args.request.headers['Access-Control-Allow-Origin'] = '*';
          args.request.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,HEAD';
          args.request.headers['Access-Control-Allow-Headers'] = 'amz-sdk-invocation-id,amz-sdk-request,authorization,x-amz-acl,x-amz-content-sha256,x-amz-copy-source,x-amz-date,x-amz-user-agent';
          return next(args);
        },
        { step: 'build' }
      );

      await client.send(copyCommand);

      // Delete the old object
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: oldKey
      });
      await client.send(deleteCommand);
    }
  } catch (error) {
    console.error('Error renaming files:', error);
    throw error;
  }
}; 
