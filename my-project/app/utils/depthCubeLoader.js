import * as THREE from 'three';

/**
 * Loads the 6 RG-packed depth cube faces for a scan into a CubeTexture.
 *
 * Face PNG layout (see scripts/02_depth_processing/export_depth_cube_png.py):
 *   R = high byte of depth uint16
 *   G = low byte  of depth uint16   -> depth16 = R*256 + G  (0 = invalid)
 *   B = confidence tier (0=filled, 1=native, 2+=corroborated)
 *   A = valid_mask (255 = valid, 0 = hole)
 *
 * IMPORTANT: the face ORDER must match the color cubemap exactly, otherwise
 * the depth is sampled from the wrong direction and the warp is misaligned
 * with the mesh. The carefully-aligned order lives in scan_metadata.json as
 * each scan's `cubemap_urls`. We derive the depth face order from that same
 * list (mapping the color face token px/nx/... to the depth PNG) so depth and
 * color are guaranteed to use an identical ordering.
 *
 * NearestFilter + no mipmaps + NoColorSpace are mandatory: the packed bytes
 * are data, not color, and any filtering/conversion would corrupt the
 * reconstructed 16-bit depth.
 */

const FACE_TOKENS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const FALLBACK_ORDER = FACE_TOKENS.slice(); // three.js [+X,-X,+Y,-Y,+Z,-Z]

const depthCubeCache = new Map(); // scanId -> CubeTexture
let depthRangesPromise = null;
let metadataPromise = null;

export async function fetchDepthRanges(baseUrl = '/depth_cube') {
  if (!depthRangesPromise) {
    depthRangesPromise = fetch(`${baseUrl}/depth_ranges.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return depthRangesPromise;
}

async function fetchColorMetadata() {
  if (!metadataPromise) {
    metadataPromise = fetch('/panoramas_native/scan_metadata.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return metadataPromise;
}

// Extract the face token (px, nx, py, ny, pz, nz) from a color cubemap filename
// such as "scan_0_px.jpg" or "panoramas_native/scan_0_nz.jpg".
function faceTokenFromFilename(name) {
  const m = String(name).toLowerCase().match(/_(px|nx|py|ny|pz|nz)\.[a-z0-9]+$/);
  return m ? m[1] : null;
}

// Resolve the per-scan face order from the color metadata's cubemap_urls so it
// matches the aligned color cube exactly. Falls back to the canonical three.js
// order if metadata is unavailable.
async function resolveFaceOrder(scanId) {
  const meta = await fetchColorMetadata();
  const scan = meta && (meta[scanId] || meta[`scan_${scanId}`]);
  const urls = scan && scan.cubemap_urls;
  if (Array.isArray(urls) && urls.length === 6) {
    const order = urls.map(faceTokenFromFilename);
    if (order.every((t) => FACE_TOKENS.includes(t))) {
      return order;
    }
  }
  return FALLBACK_ORDER;
}

/**
 * @param {string} scanId  Already includes the `scan_` prefix (e.g. "scan_0"),
 *                         matching the metadata keys and the on-disk filenames
 *                         scan_0_px.png ... scan_0_nz.png.
 */
import { textureManager } from './TextureManager';

export async function loadDepthCube(scanId, baseUrl = '/depth_cube', faceSize = 512) {
  const normalizedId = String(scanId).startsWith('scan_') ? scanId : `scan_${scanId}`;
  if (depthCubeCache.has(normalizedId)) {
    return depthCubeCache.get(normalizedId);
  }

  try {
    const order = await resolveFaceOrder(normalizedId);
    const urls = order.map((f) => `${baseUrl}/${normalizedId}_${f}.png`);

    const images = await Promise.all(
      urls.map((url) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = faceSize;
            canvas.height = faceSize;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, faceSize, faceSize);
            resolve(canvas);
          };
          img.onerror = () => reject(new Error(`Depth face not found: ${url}`));
          img.src = url;
        });
      })
    );

    const cubeTex = new THREE.CubeTexture(images);
    cubeTex.colorSpace = THREE.NoColorSpace;
    cubeTex.minFilter = THREE.NearestFilter;
    cubeTex.magFilter = THREE.NearestFilter;
    cubeTex.generateMipmaps = false;
    cubeTex.needsUpdate = true;

    depthCubeCache.set(normalizedId, cubeTex);
    return cubeTex;
  } catch (err) {
    console.warn(`[Depth] Depth cube unavailable for ${normalizedId}, falling back to flat shell.`, err.message);
    return null;
  }
}

export function disposeDepthCube(scanId) {
  const tex = depthCubeCache.get(scanId);
  if (tex) {
    tex.dispose();
    depthCubeCache.delete(scanId);
  }
}

export function disposeScanTextures(scanId) {
  if (colorCubeCache.has(scanId)) {
    const tex = colorCubeCache.get(scanId);
    if (tex) tex.dispose();
    colorCubeCache.delete(scanId);
  }
  if (depthCubeCache.has(scanId)) {
    const tex = depthCubeCache.get(scanId);
    if (tex) tex.dispose();
    depthCubeCache.delete(scanId);
  }
  // Also dispose KTX2 textures via textureManager
  textureManager.disposeScanTextures(scanId, false);
}

// ---------------------------------------------------------------------------
// Native COLOR cube faces (same assets + order as the aligned cubemap-test).
// Loading color as a CubeTexture (instead of a stitched equirect) guarantees
// the panorama aligns with the mesh identically to CubemapTourViewer.
// ---------------------------------------------------------------------------
const colorCubeCache = new Map(); // scanId -> CubeTexture

export async function loadColorCube(scanId, baseUrl = '/panoramas_native') {
  if (colorCubeCache.has(scanId)) {
    return colorCubeCache.get(scanId);
  }

  const meta = await fetchColorMetadata();
  const scan = meta && (meta[scanId] || meta[`scan_${scanId}`]);
  let urls;
  if (scan && Array.isArray(scan.cubemap_urls) && scan.cubemap_urls.length === 6) {
    // Use the exact aligned order/filenames from metadata.
    urls = scan.cubemap_urls.map((f) => `${baseUrl}/${f}`);
  } else {
    // Fallback to canonical face tokens if metadata is unavailable.
    urls = FACE_TOKENS.map((f) => `${baseUrl}/${scanId}_${f}.jpg`);
  }

  return new Promise((resolve, reject) => {
    new THREE.CubeTextureLoader().load(
      urls,
      (cubeTex) => {
        cubeTex.colorSpace = THREE.SRGBColorSpace;
        colorCubeCache.set(scanId, cubeTex);
        resolve(cubeTex);
      },
      undefined,
      reject,
    );
  });
}
