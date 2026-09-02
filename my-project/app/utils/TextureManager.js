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
        .setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/')
        .detectSupport(renderer);
    }
  }

  setBasePath(tourId) {
    if (!tourId) return;
    this.baseKtx2Path = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/ktx2`;
    this.baseEquirectPath = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/equirect_low`;
    this.baseCubemapPath = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/cubemaps`;
  }

  getTextureCacheObj(scanId) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    if (!this.textureCache.has(cleanId)) {
      this.textureCache.set(cleanId, { '256': null, '512': null, '1024': null, '2048': null });
    }
    return this.textureCache.get(cleanId);
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

    // Try primary path first, with fallback to local public path
    const url = `${this.baseKtx2Path}/scan_${cleanId}_${size}.ktx2`;
    
    return new Promise((resolve, reject) => {
      this.ktx2Loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          cacheObj[size] = texture;
          resolve(texture);
        },
        undefined,
        () => {
          // Fallback to relative local /ktx2
          const localUrl = `/ktx2/scan_${cleanId}_${size}.ktx2`;
          this.ktx2Loader.load(
            localUrl,
            (localTex) => {
              localTex.colorSpace = THREE.SRGBColorSpace;
              cacheObj[size] = localTex;
              resolve(localTex);
            },
            undefined,
            (err2) => reject(err2)
          );
        }
      );
    });
  }

  /**
   * Load Equirectangular low-res texture for transition projection
   */
  async loadEquirect(scanId) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    if (this.equirectTextureCache.has(cleanId)) {
      return this.equirectTextureCache.get(cleanId);
    }

    const texLoader = new THREE.TextureLoader();
    const primaryUrl = `${this.baseEquirectPath}/scan_${cleanId}_equirect_low.jpg`;
    const fallbackUrl = `/equirect_low/scan_${cleanId}_equirect_low.jpg`;

    return new Promise((resolve) => {
      texLoader.load(
        primaryUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          this.equirectTextureCache.set(cleanId, tex);
          resolve(tex);
        },
        undefined,
        () => {
          texLoader.load(
            fallbackUrl,
            (fallbackTex) => {
              fallbackTex.colorSpace = THREE.SRGBColorSpace;
              this.equirectTextureCache.set(cleanId, fallbackTex);
              resolve(fallbackTex);
            },
            undefined,
            () => {
              // Return dummy 1x1 texture if not found
              const dummy = new THREE.DataTexture(new Uint8Array([100, 100, 100, 255]), 1, 1, THREE.RGBAFormat);
              dummy.needsUpdate = true;
              resolve(dummy);
            }
          );
        }
      );
    });
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
    const urls = faces.map(f => `${this.baseCubemapPath}/scan_${cleanId}_${f}.jpg`);

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
          const fallbackUrls = faces.map(f => `/cubemaps/scan_${cleanId}_${f}.jpg`);
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
   * Preload the 256-px textures for a list of scan IDs
   */
  async preloadBase(scanIds) {
    for (const id of scanIds) {
      this.loadEquirect(id).catch(() => {});
      this.loadCubeMap(id).catch(() => {});
    }
  }

  disposeScanTextures(scanId, keep256 = true) {
    const cleanId = String(scanId).replace(/^scan_/, '');
    if (!this.textureCache.has(cleanId)) return;
    
    const cacheObj = this.textureCache.get(cleanId);
    if (cacheObj['2048']) {
      cacheObj['2048'].dispose();
      cacheObj['2048'] = null;
    }
    if (cacheObj['1024']) {
      cacheObj['1024'].dispose();
      cacheObj['1024'] = null;
    }
    if (cacheObj['512']) {
      cacheObj['512'].dispose();
      cacheObj['512'] = null;
    }
    if (!keep256 && cacheObj['256']) {
      cacheObj['256'].dispose();
      cacheObj['256'] = null;
    }
  }
}

export const textureManager = new TextureManager();
