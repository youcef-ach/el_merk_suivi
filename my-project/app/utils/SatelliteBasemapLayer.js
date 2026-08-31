import * as THREE from 'three';

const CARTO_API_KEY = 'cb1_2lfj_1_399037b7e6acf1e635e15b78';

/**
 * Providers definition for Slippy Map / XYZ Web Mercator satellite and map tiles
 */
export const MAP_PROVIDERS = {
  'esri-satellite': {
    name: 'ESRI World Satellite',
    url: (x, y, z) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Tiles © Esri, Maxar, Earthstar Geographics'
  },
  'google-satellite': {
    name: 'Google Satellite HD',
    url: (x, y, z) => `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`,
    attribution: '© Google Maps'
  },
  'google-hybrid': {
    name: 'Google Satellite Hybrid',
    url: (x, y, z) => `https://mt1.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}`,
    attribution: '© Google Maps'
  },
  'carto-voyager': {
    name: 'CARTO Voyager (Streets)',
    url: (x, y, z) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png?key=${CARTO_API_KEY}`,
    attribution: '© OpenStreetMap, © CARTO'
  },
  'carto-dark': {
    name: 'CARTO Dark Matter (Dark)',
    url: (x, y, z) => `https://basemaps.cartocdn.com/rastertiles/dark_all/${z}/${x}/${y}.png?key=${CARTO_API_KEY}`,
    attribution: '© OpenStreetMap, © CARTO'
  },
  'esri-topo': {
    name: 'ESRI Topographic',
    url: (x, y, z) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Tiles © Esri, HERE, Garmin, USGS'
  }
};

// Earth Constants
const EARTH_RADIUS = 6378137.0; // WGS84 major radius (meters)
const EARTH_CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS;
const TILE_PX = 256;

/**
 * GPS (Latitude, Longitude) to Exact Web Mercator Slippy Map Tile Coordinates
 * Including precise sub-tile fractional offset for millimeter geographic alignment
 */
export function latLonToTileExact(lat, lon, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const exactX = ((lon + 180) / 360) * n;
  const exactY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  
  const tileX = Math.floor(exactX);
  const tileY = Math.floor(exactY);

  // Sub-tile fractional offset from the tile center [-0.5, +0.5]
  const fracX = exactX - (tileX + 0.5);
  const fracY = exactY - (tileY + 0.5);

  return { tileX, tileY, fracX, fracY, z: zoom };
}

export function latLonToTile(lat, lon, zoom) {
  const res = latLonToTileExact(lat, lon, zoom);
  return { x: res.tileX, y: res.tileY, z: zoom };
}

/**
 * Calculates metric width & height of a Web Mercator tile at given latitude and zoom level
 */
export function getTileDimensionsInMeters(lat, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const numTiles = Math.pow(2, zoom);
  const metersPerTile = (EARTH_CIRCUMFERENCE * Math.cos(latRad)) / numTiles;
  return {
    widthMeters: metersPerTile,
    heightMeters: metersPerTile
  };
}

/**
 * High-End Custom Shader for Seamless Ground Disc:
 * Stitches multiple satellite tiles into a single unified continuous texture
 * with smooth radial edge vignette fade into the horizon fog (no square seams).
 */
function createSeamlessBasemapMaterial(texture, radiusMeters, initialOpacity = 0.92) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uRadius: { value: radiusMeters },
      uOpacity: { value: initialOpacity },
      uInnerFadeRatio: { value: 0.65 }, // Start soft fade at 65% of radius
      uOuterFadeRatio: { value: 0.98 }, // Fully transparent at 98% of radius
      uFogColor: { value: new THREE.Color(0x0b1120) },
      uFogNear: { value: 100.0 },
      uFogFar: { value: 3000.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uRadius;
      uniform float uOpacity;
      uniform float uInnerFadeRatio;
      uniform float uOuterFadeRatio;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vec4 texColor = texture2D(uMap, vUv);
        
        // Compute distance from center of ground disc in world coordinates (XZ plane)
        float dist = length(vWorldPos.xz);
        
        // Continuous smooth radial feathering (eliminates all square tile borders)
        float innerDist = uRadius * uInnerFadeRatio;
        float outerDist = uRadius * uOuterFadeRatio;
        float radialFade = 1.0 - smoothstep(innerDist, outerDist, dist);

        // Final output alpha with smooth falloff
        float alpha = texColor.a * uOpacity * radialFade;

        // Subtle ambient ground color grading for photorealism
        vec3 finalColor = texColor.rgb;

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false, // Prevent z-fighting with 3D model foundations
    side: THREE.DoubleSide
  });
}

/**
 * SatelliteBasemapLayer:
 * Stitches multi-tile satellite imagery onto a single seamless high-res ground disc with smooth radial vignette.
 */
export class SatelliteBasemapLayer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'SatelliteBasemapLayer';
    this.scene.add(this.group);

    // Default configuration (El Merk Facility, Berkine Basin, Algeria)
    this.lat = 31.9056;
    this.lon = 9.1489;
    this.zoom = 17; // Detailed local zoom
    this.gridRadius = 2; // 5x5 tile grid
    this.providerKey = 'esri-satellite';
    this.opacity = 0.92;
    this.elevationOffsetY = -0.15;
    this.manualOffsetX = 0.0;
    this.manualOffsetZ = 0.0;
    this.rotationDeg = 0.0;
    this.subTileOffsetX = 0.0;
    this.subTileOffsetZ = 0.0;
    this.isVisible = false;
    this.isLoaded = false;

    // Single unified mesh and canvas
    this.mesh = null;
    this.material = null;
    this.texture = null;
    this.canvas = null;
    this.ctx = null;

    // Abort controller for cancelling ongoing tile loads on rapid updates
    this._loadAbortId = 0;
  }

  /**
   * Loads or updates the seamless satellite basemap ground plane
   */
  load({
    lat = this.lat,
    lon = this.lon,
    zoom = this.zoom,
    gridRadius = this.gridRadius,
    providerKey = this.providerKey,
    elevationOffsetY = this.elevationOffsetY,
    manualOffsetX = this.manualOffsetX,
    manualOffsetZ = this.manualOffsetZ,
    rotationDeg = this.rotationDeg,
    opacity = this.opacity,
    visible = true
  } = {}) {
    this.lat = Number(lat);
    this.lon = Number(lon);
    this.zoom = Math.max(12, Math.min(19, Number(zoom)));
    this.gridRadius = Math.max(1, Math.min(4, Number(gridRadius)));
    this.providerKey = MAP_PROVIDERS[providerKey] ? providerKey : 'esri-satellite';
    this.elevationOffsetY = Number(elevationOffsetY);
    this.manualOffsetX = Number(manualOffsetX);
    this.manualOffsetZ = Number(manualOffsetZ);
    this.rotationDeg = Number(rotationDeg);
    this.opacity = Number(opacity);
    this.isVisible = Boolean(visible);

    this.clear();

    const currentLoadId = ++this._loadAbortId;
    const exact = latLonToTileExact(this.lat, this.lon, this.zoom);
    const { widthMeters, heightMeters } = getTileDimensionsInMeters(this.lat, this.zoom);
    const provider = MAP_PROVIDERS[this.providerKey];

    // Compute exact sub-tile metric offset from integer tile center
    this.subTileOffsetX = exact.fracX * widthMeters;
    this.subTileOffsetZ = exact.fracY * heightMeters;

    const r = this.gridRadius;
    const gridSize = 2 * r + 1; // e.g. 5x5
    const totalWidthMeters = gridSize * widthMeters;
    const radiusMeters = totalWidthMeters * 0.5;

    // 1. Create Stitched Offscreen Canvas
    const canvasSize = gridSize * TILE_PX; // e.g. 5 * 256 = 1280px
    this.canvas = document.createElement('canvas');
    this.canvas.width = canvasSize;
    this.canvas.height = canvasSize;
    this.ctx = this.canvas.getContext('2d');

    // Fill with a natural subtle desert base tone while tiles stream in
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(0, 0, canvasSize, canvasSize);

    // 2. Create Canvas Texture
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    // 3. Create Smooth Circular Disc Geometry
    // Using a high-segment circle geometry (128 segments) eliminates all square edges
    const geo = new THREE.CircleGeometry(radiusMeters, 128);

    // Create custom smooth radial vignette shader material
    this.material = createSeamlessBasemapMaterial(this.texture, radiusMeters, this.opacity);

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2; // Lay flat on XZ ground plane
    
    // Position mesh compensated for exact sub-tile position + manual offset
    this.mesh.position.set(
      -this.subTileOffsetX + this.manualOffsetX,
      this.elevationOffsetY,
      -this.subTileOffsetZ + this.manualOffsetZ
    );
    this.mesh.renderOrder = 1; // Render before 3D model overlays

    this.group.rotation.y = (this.rotationDeg * Math.PI) / 180;
    this.group.add(this.mesh);
    this.group.visible = this.isVisible;
    this.isLoaded = true;

    // 4. Concurrently Fetch & Stitch Tiles into Single Canvas
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tileX = exact.tileX + dx;
        const tileY = exact.tileY + dy;
        const col = dx + r;
        const row = dy + r;
        const tileUrl = provider.url(tileX, tileY, this.zoom);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (this._loadAbortId !== currentLoadId) return;
          this.ctx.drawImage(img, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX);
          this.texture.needsUpdate = true;
        };
        img.onerror = () => {
          console.warn(`[SatelliteBasemapLayer] Tile load failed: (${tileX}, ${tileY}, ${this.zoom})`);
        };
        img.src = tileUrl;
      }
    }
  }

  setManualOffset(offsetX, offsetZ) {
    this.manualOffsetX = Number(offsetX);
    this.manualOffsetZ = Number(offsetZ);
    if (this.mesh) {
      this.mesh.position.x = -this.subTileOffsetX + this.manualOffsetX;
      this.mesh.position.z = -this.subTileOffsetZ + this.manualOffsetZ;
    }
  }

  setRotation(degrees) {
    this.rotationDeg = Number(degrees);
    if (this.group) {
      this.group.rotation.y = (this.rotationDeg * Math.PI) / 180;
    }
  }

  setOpacity(val) {
    this.opacity = Math.max(0, Math.min(1, Number(val)));
    if (this.material && this.material.uniforms?.uOpacity) {
      this.material.uniforms.uOpacity.value = this.opacity;
    }
  }

  setVisible(visible) {
    this.isVisible = Boolean(visible);
    this.group.visible = this.isVisible;
  }

  setElevation(offsetY) {
    this.elevationOffsetY = Number(offsetY);
    if (this.mesh) {
      this.mesh.position.y = this.elevationOffsetY;
    }
  }

  setCoordinates(lat, lon, zoom = this.zoom) {
    this.lat = Number(lat);
    this.lon = Number(lon);
    this.zoom = Number(zoom);
    if (this.isLoaded) {
      this.load({ lat: this.lat, lon: this.lon, zoom: this.zoom });
    }
  }

  setProvider(providerKey) {
    if (MAP_PROVIDERS[providerKey] && providerKey !== this.providerKey) {
      this.providerKey = providerKey;
      if (this.isLoaded) {
        this.load({ providerKey: this.providerKey });
      }
    }
  }

  clear() {
    this._loadAbortId++;
    if (this.mesh) {
      this.group.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    this.canvas = null;
    this.ctx = null;
  }

  dispose() {
    this.clear();
    if (this.group && this.scene) {
      this.scene.remove(this.group);
    }
    this.isLoaded = false;
  }
}
