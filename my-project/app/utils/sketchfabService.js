import JSZip from 'jszip';

const API_BASE = 'https://api.sketchfab.com/v3';
const GLOBAL_TOKEN = '3efcf5e532454a1ebf575a17c52ad614';

/**
 * Searches for downloadable 3D models on Sketchfab
 * @param {string} query Search query
 * @param {string} token Sketchfab API token
 * @param {string} [cursor] Optional cursor for pagination
 */
export async function searchSketchfab(query, token = GLOBAL_TOKEN, cursor = null) {
  if (!token) throw new Error('API Token is required');

  let url = `${API_BASE}/search?type=models&downloadable=true&q=${encodeURIComponent(query)}`;
  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`;
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${token}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP Error ${response.status}: Failed to search Sketchfab`);
  }

  return response.json();
}

/**
 * Gets the temporary ZIP download URL for a model UID
 * @param {string} uid The Sketchfab model UID
 * @param {string} token Sketchfab API token
 */
export async function getSketchfabDownloadUrl(uid, token = GLOBAL_TOKEN) {
  if (!token) throw new Error('API Token is required');

  const response = await fetch(`${API_BASE}/models/${uid}/download`, {
    headers: {
      'Authorization': `Token ${token}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP Error ${response.status}: Failed to get download URL`);
  }

  const data = await response.json();
  if (!data.gltf || !data.gltf.url) {
    throw new Error('GLTF download not available for this model');
  }

  return data.gltf.url;
}

/**
 * Downloads a Sketchfab ZIP, extracts it, and creates Blob URLs for the GLTF, BIN, and textures
 * @param {string} zipUrl The temporary download URL from Sketchfab
 * @returns {Promise<{ gltfUrl: string, blobUrls: Record<string, string>, cleanup: Function }>}
 */
export async function downloadAndExtractSketchfabGltf(zipUrl) {
  console.log('[Sketchfab] Downloading ZIP from:', zipUrl);
  
  const response = await fetch(zipUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ZIP: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  console.log('[Sketchfab] ZIP downloaded, extracting...');

  const zip = await JSZip.loadAsync(arrayBuffer);
  const blobUrls = {}; // Map of relative paths in ZIP to their Blob URLs
  let gltfUrl = null;

  // Process all files in the ZIP
  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    // Read the file as a Blob
    const blob = await zipEntry.async('blob');
    
    // Create a Blob URL
    const objectUrl = URL.createObjectURL(blob);
    blobUrls[relativePath] = objectUrl;

    // Identify the main scene.gltf file
    if (relativePath.endsWith('.gltf')) {
      gltfUrl = objectUrl;
    }
  }

  if (!gltfUrl) {
    // If no .gltf was found, cleanup and error
    for (const url of Object.values(blobUrls)) URL.revokeObjectURL(url);
    throw new Error('No .gltf file found in the downloaded archive');
  }

  console.log('[Sketchfab] Extraction complete. Files:', Object.keys(blobUrls));

  // Provide a cleanup function to free memory when the model is removed/loaded
  const cleanup = () => {
    for (const url of Object.values(blobUrls)) {
      URL.revokeObjectURL(url);
    }
  };

  return { gltfUrl, blobUrls, cleanup };
}
