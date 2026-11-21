/**
 * ImageKit Integration Service
 * Uploads photos to ImageKit CDN storage using the provided private and public keys.
 */

const IMAGEKIT_UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload';
const IMAGEKIT_PRIVATE_KEY = 'private_y2URtiF4Y4puhh3JQfTb3RgVNUc=';
const IMAGEKIT_PUBLIC_KEY = 'public_QRut4wzNiCVGB6jBFFZ8mKh3U2g=';
const IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/baijnathsoftware';

// Precomputed Base64 Basic Auth header for ImageKit (btoa('private_y2URtiF4Y4puhh3JQfTb3RgVNUc=:'))
const IMAGEKIT_AUTH_HEADER = 'Basic cHJpdmF0ZV95MlVSdGlGNFk0cHVoaDNKUWZUYjNSZ1ZOVWM9Og==';
const getAuthHeader = () => IMAGEKIT_AUTH_HEADER;

/**
 * Upload single image to ImageKit
 * @param {Object} params - { uri, base64, fileName, folder }
 * @returns {Promise<Object>} { success, url, thumbnailUrl, fileId, name }
 */
export const uploadImageToImageKit = async ({ uri, base64, fileName, folder = '/general' }) => {
  try {
    const finalFileName = fileName || `img_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

    const formData = new FormData();
    if (base64) {
      // Direct base64 is fastest & most reliable in React Native Expo
      const formattedBase64 = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
      formData.append('file', formattedBase64);
    } else if (uri) {
      formData.append('file', {
        uri,
        name: finalFileName,
        type: 'image/jpeg'
      });
    } else {
      throw new Error('No image URI or base64 provided for upload.');
    }

    formData.append('fileName', finalFileName);
    formData.append('folder', folder);
    formData.append('useUniqueFileName', 'true');

    const authHeader = getAuthHeader();

    const response = await fetch(IMAGEKIT_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: authHeader
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok || data.message) {
      throw new Error(data.message || `Upload failed with status ${response.status}`);
    }

    return {
      success: true,
      url: data.url,
      thumbnailUrl: data.thumbnailUrl || data.url,
      fileId: data.fileId,
      name: data.name,
      filePath: data.filePath
    };
  } catch (error) {
    console.error('ImageKit upload error:', error);
    throw error;
  }
};

/**
 * Upload multiple images concurrently to ImageKit
 * @param {Array<Object>} images - Array of { uri, base64, fileName }
 * @param {string} folder - Destination folder (e.g. '/onload_samples', '/daily_pump_photos')
 * @returns {Promise<Array<string>>} Array of uploaded URLs
 */
export const uploadMultipleImagesToImageKit = async (images, folder = '/pump_uploads') => {
  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }

  const uploadPromises = images.map((img, index) => {
    return uploadImageToImageKit({
      uri: img.uri,
      base64: img.base64,
      fileName: img.fileName || `photo_${Date.now()}_${index + 1}.jpg`,
      folder
    });
  });

  const results = await Promise.all(uploadPromises);
  return results.filter(r => r.success).map(r => r.url);
};

export default {
  uploadImageToImageKit,
  uploadMultipleImagesToImageKit,
  IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_URL_ENDPOINT
};

