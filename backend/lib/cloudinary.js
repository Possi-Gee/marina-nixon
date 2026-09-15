const { v2: cloudinary } = require('cloudinary');

let configured = false;

function configureCloudinary() {
  if (configured) return cloudinary;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

async function uploadImage(image, folder = 'marina-nixon/products') {
  if (!image) return null;

  const sdk = configureCloudinary();
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary is not configured');
  }

  const result = await sdk.uploader.upload(image, {
    folder,
    resource_type: 'image',
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
  };
}

async function deleteImage(publicId) {
  if (!publicId) return;

  const sdk = configureCloudinary();
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return;
  }

  await sdk.uploader.destroy(publicId, { resource_type: 'image' });
}

module.exports = { cloudinary, configureCloudinary, uploadImage, deleteImage };
