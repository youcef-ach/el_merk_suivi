import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MINIO_URL } from '../config/api';

class TextureManager {
  constructor() {
    this.ktx2Loader = null;
    this.textureCache = new Map(); // key: scanId, value: { '256': Texture, '512': Texture, '1024': Texture, '2048': Texture }
    this.cubeTextureCache = new Map();
    this.equirectTextureCache = new Map();
    this.renderer = null;
    this.baseKtx2Path = '/ktx2';
    this.baseEquirectPath = '/equirect_low';
    this.baseCubemapPath = '/cubemaps';
  }

  init(renderer, basePathConfig = {}) {
    this.renderer = renderer;
    if (basePathConfig.ktx2) this.baseKtx2Path = basePathConfig.ktx2;
    if (basePathConfig.equirect) this.baseEquirectPath = basePathConfig.equirect;
    if (basePathConfig.cubemaps) this.baseCubemapPath = basePathConfig.cubemaps;

    if (!this.ktx2Loader && renderer) {
      this.ktx2Loader = new KTX2Loader()
        .setTranscoderPath('/basis/')
        .detectSupport(renderer);
    }
  }

  setBasePath(tourId) {
    if (!tourId) return;
    this.baseKtx2Path = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/ktx2`;
    this.baseEquirectPath = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/equirect`;
    this.baseEquirectLowPath = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/equirect_low`;
    this.baseCubemapPath = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/cubemaps`;
  }

  getTextureCacheObj(scanId) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    if (!this.textureCache.has(cleanId)) {
      this.textureCache.set(cleanId, { '256': null, '512': null, '1024': null, '2048': null });
    }
    return this.textureCache.get(cleanId);
  }

  setScansMetadata(scans) {
    this.scansMetadata = scans || {};
  }

  hasKTX2(scanId) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    const scan = this.scansMetadata?.[`scan_${cleanId}`] || this.scansMetadata?.[cleanId];
    if (scan) {
      const raw = scan.raw || scan;
      return Boolean(raw.ktx2_1024 || raw.ktx2_512 || raw.ktx2_256);
    }
    return false;
  }

  /**
   * Check if a specific KTX2 resolution is already in memory cache
   */
  getCachedKTX2(scanId, size = '1024') {
    const cleanId = String(scanId).replace(/^scan_/, '');
    const cacheObj = this.getTextureCacheObj(cleanId);
    return cacheObj[size] || null;
  }

  /**
   * Return highest quality cached texture currently in memory (1024, native cubemap, 512, or 256)
   */
  getBestCachedTexture(scanId) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    const cacheObj = this.getTextureCacheObj(cleanId);
    if (cacheObj['1024']) return { texture: cacheObj['1024'], lod: '1024' };
    if (this.cubeTextureCache.has(cleanId)) return { texture: this.cubeTextureCache.get(cleanId), lod: 'native' };
    if (cacheObj['512']) return { texture: cacheObj['512'], lod: '512' };
    if (cacheObj['256']) return { texture: cacheObj['256'], lod: '256' };
    return null;
  }

  /**
   * Load a KTX2 texture of specified size for the given scanId.
   */
  async loadKTX2(scanId, size = '256') {
    if (!this.ktx2Loader) {
      throw new Error("TextureManager not initialized with renderer.");
    }
    
    const cleanId = String(scanId).replace(/^scan_/, '');
    const cacheObj = this.getTextureCacheObj(cleanId);
    if (cacheObj[size]) {
      return cacheObj[size];
    }

    if (!this.inFlightKTX2) this.inFlightKTX2 = new Map();
    const key = `${cleanId}_${size}`;
    if (this.inFlightKTX2.has(key)) {
      return this.inFlightKTX2.get(key);
    }

    const url = `${this.baseKtx2Path}/scan_${cleanId}_${size}.ktx2`;
    
    const p = new Promise((resolve, reject) => {
      this.ktx2Loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          cacheObj[size] = texture;
          this.inFlightKTX2?.delete(key);
          resolve(texture);
        },
        undefined,
        (err) => {
          this.inFlightKTX2?.delete(key);
          reject(err);
        }
      );
    });

    this.inFlightKTX2.set(key, p);
    return p;
  }

  /**
   * Load Equirectangular texture (Adaptive 2K on mobile/Tier 1&2 for 60 FPS flights, 4K on Tier 3 desktop)
   */
  async loadEquirect(scanId, preferTier = 'auto') {
    const cleanId = String(scanId).replace(/^scan_/, '');
    
    // Determine target resolution tier
    let targetTier = preferTier;
    if (targetTier === 'auto') {
      try {
        const { getDeviceTier } = await import('./deviceTier.js');
        targetTier = getDeviceTier().flightEquirectTier || '4k';
      } catch (_) {
        targetTier = '4k';
      }
    }

    const cacheKey = `${cleanId}_${targetTier}`;
    if (this.equirectTextureCache.has(cacheKey)) {
      return this.equirectTextureCache.get(cacheKey);
    }
    // Also check generic cache
    if (this.equirectTextureCache.has(cleanId) && targetTier !== '2k') {
      return this.equirectTextureCache.get(cleanId);
    }

    const texLoader = new THREE.TextureLoader();
    const cacheBust = `?t=${Date.now()}`;

    const url4k = `${this.baseEquirectPath}/scan_${cleanId}_equirect.jpg${cacheBust}`;
    const url2k = `${this.baseEquirectLowPath || this.baseEquirectPath}/scan_${cleanId}_equirect_low.jpg${cacheBust}`;

    // Select primary and fallback based on device tier
    const primaryUrl = targetTier === '2k' ? url2k : url4k;
    const fallbackUrl = targetTier === '2k' ? url4k : url2k;

    const configureTex = (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      this.equirectTextureCache.set(cacheKey, tex);
      this.equirectTextureCache.set(cleanId, tex);
      return tex;
    };

    return new Promise((resolve) => {
      texLoader.load(
        primaryUrl,
        (tex) => resolve(configureTex(tex)),
        undefined,
        () => {
          texLoader.load(
            fallbackUrl,
            (fallbackTex) => resolve(configureTex(fallbackTex)),
            undefined,
            () => {
              const localUrl = `/equirect/scan_${cleanId}_equirect.jpg${cacheBust}`;
              texLoader.load(
                localUrl,
                (localTex) => resolve(configureTex(localTex)),
                undefined,
                () => {
                  const dummy = new THREE.DataTexture(new Uint8Array([100, 100, 100, 255]), 1, 1, THREE.RGBAFormat);
                  dummy.needsUpdate = true;
                  resolve(dummy);
                }
              );
            }
          );
        }
      );
    });
  }

  /**
   * Return highest quality cached KTX2 texture already loaded in memory
   */
  getBestCachedKTX2(scanId) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    const cacheObj = this.getTextureCacheObj(cleanId);
    return cacheObj['1024'] || cacheObj['512'] || cacheObj['256'] || null;
  }

  /**
   * Load the best available KTX2 texture (attempts 1024 first, fallback to 256)
   */
  async loadBestKTX2(scanId) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    const cached = this.getBestCachedKTX2(cleanId);
    if (cached) return cached;

    try {
      return await this.loadKTX2(cleanId, '1024');
    } catch (e) {
      return await this.loadKTX2(cleanId, '256');
    }
  }

  /**
   * Load Cubemap faces for sky dome background
   */
  async loadCubeMap(scanId) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    if (this.cubeTextureCache.has(cleanId)) {
      return this.cubeTextureCache.get(cleanId);
    }

    const loader = new THREE.CubeTextureLoader();
    const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    const cacheBust = `?t=${Date.now()}`;
    const urls = faces.map(f => `${this.baseCubemapPath}/scan_${cleanId}_${f}.jpg${cacheBust}`);

    return new Promise((resolve) => {
      loader.load(
        urls,
        (cubeTex) => {
          cubeTex.colorSpace = THREE.SRGBColorSpace;
          this.cubeTextureCache.set(cleanId, cubeTex);
          resolve(cubeTex);
        },
        undefined,
        () => {
          const fallbackUrls = faces.map(f => `/cubemaps/scan_${cleanId}_${f}.jpg${cacheBust}`);
          loader.load(
            fallbackUrls,
            (fbTex) => {
              fbTex.colorSpace = THREE.SRGBColorSpace;
              this.cubeTextureCache.set(cleanId, fbTex);
              resolve(fbTex);
            },
            undefined,
            () => {
              const canvas = document.createElement('canvas');
              canvas.width = 1; canvas.height = 1;
              const dummyCube = new THREE.CubeTexture([canvas, canvas, canvas, canvas, canvas, canvas]);
              dummyCube.needsUpdate = true;
              resolve(dummyCube);
            }
          );
        }
      );
    });
  }

  /**
   * Preload 4K equirect textures for nearest scan stations
   */
  async preloadBase(scanIds) {
    for (const id of scanIds) {
      this.loadEquirect(id).catch(() => {});
    }
  }

  disposeScanTextures(scanId, keep1024 = true) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    if (!this.textureCache.has(cleanId)) return;
    
    const cacheObj = this.textureCache.get(cleanId);
    if (cacheObj['2048']) {
      cacheObj['2048'].dispose();
      cacheObj['2048'] = null;
    }
    if (!keep1024 && cacheObj['1024']) {
      cacheObj['1024'].dispose();
      cacheObj['1024'] = null;
    }
  }
}

export const textureManager = new TextureManager();
