import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { getDeviceTier } from './deviceTier';
import { DatumBenchmarkMarker } from './DatumBenchmarkMarker';

/**
 * Converts Earth-Centered Earth-Fixed (ECEF) Cartesian coordinates to WGS84 Geodetic (Lat, Lon, Alt)
 */
export function ecefToLatLonAlt(x, y, z) {
  const a = 6378137.0; // WGS84 semi-major axis in meters
  const f = 1 / 298.257223563; // flattening
  const b = a * (1 - f); // semi-minor axis
  const e2 = (a * a - b * b) / (a * a); // first eccentricity squared
  const ep2 = (a * a - b * b) / (b * b); // second eccentricity squared

  const p = Math.hypot(x, y);
  const theta = Math.atan2(z * a, p * b);

  const lon = (Math.atan2(y, x) * 180) / Math.PI;
  const lat = (Math.atan2(
    z + ep2 * b * Math.pow(Math.sin(theta), 3),
    p - e2 * a * Math.pow(Math.cos(theta), 3)
  ) * 180) / Math.PI;

  const sinLat = Math.sin((lat * Math.PI) / 180);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const alt = p / Math.cos((lat * Math.PI) / 180) - N;

  return { lat, lon, alt, source: 'ecef' };
}

/**
 * Extracts GPS Coordinates from Cesium 3D Tiles root boundingVolume / transform / header
 */
export function extract3DTilesGPS(rootOrTileset) {
  if (!rootOrTileset) return null;
  const root = rootOrTileset.root || rootOrTileset;

  // 1. Check root boundingVolume.region [west, south, east, north, minHeight, maxHeight] in radians
  if (root.boundingVolume?.region && Array.isArray(root.boundingVolume.region)) {
    const [west, south, east, north, minHeight, maxHeight] = root.boundingVolume.region;
    const lon = (((west + east) * 0.5) * 180) / Math.PI;
    const lat = (((south + north) * 0.5) * 180) / Math.PI;
    const alt = (minHeight + maxHeight) * 0.5;
    return { lat, lon, alt, source: 'region' };
  }

  // 2. Check root transform (ECEF 4x4 matrix)
  const transform = root.transform;
  if (transform && (Array.isArray(transform) || transform.elements)) {
    const el = transform.elements || transform;
    const x = el[12];
    const y = el[13];
    const z = el[14];
    const magnitude = Math.hypot(x, y, z);
    if (magnitude > 6000000 && magnitude < 6500000) {
      return ecefToLatLonAlt(x, y, z);
    }
  }

  // 3. Check boundingVolume.sphere [x, y, z, radius]
  if (root.boundingVolume?.sphere && Array.isArray(root.boundingVolume.sphere)) {
    const [x, y, z] = root.boundingVolume.sphere;
    const magnitude = Math.hypot(x, y, z);
    if (magnitude > 6000000 && magnitude < 6500000) {
      return ecefToLatLonAlt(x, y, z);
    }
  }

  // 4. Check boundingVolume.box (center is at box[0], box[1], box[2])
  if (root.boundingVolume?.box && Array.isArray(root.boundingVolume.box)) {
    const [x, y, z] = root.boundingVolume.box;
    const magnitude = Math.hypot(x, y, z);
    if (magnitude > 6000000 && magnitude < 6500000) {
      return ecefToLatLonAlt(x, y, z);
    }
  }

  return null;
}

/**
 * Manages Cesium 3D Tiles rendering inside Three.js scene using 3d-tiles-renderer
 */
export class TilesetEngine {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.tilesRenderer = null;
    this.currentOrientationMode = 'rotX_neg90';
    this.floorOffsetY = 0.0;
    this.groundSnapOffset = 0.0;
    this.meshSnapOffsetY = 0.0;
    this.groundAsl = 0.0;
    this.isLoaded = false;
    this.initialOriented = false;
    this.onLoadCallbacks = [];
    this.onGeoCoordinatesCallbacks = [];
    this.geographicCoordinates = null;
    this.surfaceCenterPoint = null;

    // Hypsometric Elevation Colormap Shader Uniforms (Calibrated from RealityScan DSM: 95.67m -> 103.92m ASL)
    this.heatmapUniforms = {
      uHeatmapEnabled: { value: false },
      uMinElevation: { value: -3.64 },
      uMaxElevation: { value: 4.61 },
      uHeatmapOpacity: { value: 0.85 },
      uContourSpacing: { value: 0.5 },
      uContourEnabled: { value: true }
    };

    // Slope & Gradient Stability Analysis Shader Uniforms
    this.slopeUniforms = {
      uSlopeEnabled: { value: false },
      uSlopeOpacity: { value: 0.85 },
      uSlopeMaxAngle: { value: 60.0 },
      uSlopeCriticalAngle: { value: 35.0 }
    };

    // Stockpile Area Localized Mesh Transparency Uniforms
    const defaultPoly = new Array(16).fill(0).map(() => new THREE.Vector2(0, 0));
    this.volumeCutoutUniforms = {
      uVolumeCutoutEnabled: { value: false },
      uVolumePolyCount: { value: 0 },
      uVolumePolygon: { value: defaultPoly },
      uVolumeOpacity: { value: 0.35 }
    };

    // Dense Point Cloud (LIDAR) Mode State & Uniforms
    this.pointCloudUniforms = {
      uPointCloudEnabled: { value: false },
      uPointSize: { value: 3.5 },
      uPointShape: { value: 1 }, // 0: Square, 1: Circle
      uPointColorMode: { value: 0 }, // 0: RGB, 1: Elevation, 2: Slope, 3: Phosphor
      uMinElevation: this.heatmapUniforms.uMinElevation,
      uMaxElevation: this.heatmapUniforms.uMaxElevation,
      uSlopeMaxAngle: this.slopeUniforms.uSlopeMaxAngle
    };
    this.pointCloudMode = false;
    this._pointsList = [];

    // Auto-calibration state
    this._hasCalibrated = false;
    this._calibratedMin = null;
    this._calibratedMax = null;
    this._datumOffset = 99.31; // DSM mean ASL elevation offset

    // Ground Datum & Benchmark Marker State
    this.datumAligned = false;
    this.surfaceCenterPoint = null;
    this.elevationRange = null;
    this.onDatumAlignedCallbacks = [];
    this.datumBenchmarkMarker = null;
    this.datumMarkerVisible = true;
  }

  loadTileset(tilesetUrl, orientation = 'rotX_neg90', options = {}) {
    this.currentOrientationMode = orientation;

    // Configure Tier
    const tierProfile = getDeviceTier();
    this.tilesRenderer = new TilesRenderer(tilesetUrl);

    if (options.camera) this.camera = options.camera;
    if (options.renderer) this.renderer = options.renderer;

    if (this.camera) {
      this.tilesRenderer.setCamera(this.camera);
      if (this.renderer) {
        this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);
      }
    }

    // Apply Tier Profile Memory & LRU Limits
    if (tierProfile.tier === 1) {
      this.tilesRenderer.maxDepth = 16;
      this.tilesRenderer.errorTarget = 14;
      this.tilesRenderer.lruCache.minBytes = 96 * 1024 * 1024;
      this.tilesRenderer.lruCache.maxBytes = 256 * 1024 * 1024;
    } else if (tierProfile.tier === 2) {
      this.tilesRenderer.maxDepth = 22;
      this.tilesRenderer.errorTarget = 9;
      this.tilesRenderer.lruCache.minBytes = 160 * 1024 * 1024;
      this.tilesRenderer.lruCache.maxBytes = 384 * 1024 * 1024;
    } else {
      this.tilesRenderer.maxDepth = 28;
      this.tilesRenderer.errorTarget = 6;
      this.tilesRenderer.lruCache.minBytes = 256 * 1024 * 1024;
      this.tilesRenderer.lruCache.maxBytes = 768 * 1024 * 1024;
    }
    console.log(`[TilesetEngine] Configured for ${tierProfile.label} - SSE: ${this.tilesRenderer.errorTarget}, LRU: ${(this.tilesRenderer.lruCache.maxBytes / 1048576).toFixed(0)}MB`);

    // 1. Check if backend pre-calculated ground datum or Option A ASL is provided
    if (typeof options.initialMeshSnapOffset === 'number' && isFinite(options.initialMeshSnapOffset)) {
      this.meshSnapOffsetY = options.initialMeshSnapOffset;
    } else if (typeof options.initialMinYRaw === 'number' && isFinite(options.initialMinYRaw)) {
      this.meshSnapOffsetY = -options.initialMinYRaw;
    } else if (typeof options.initialGroundOffset === 'number' && isFinite(options.initialGroundOffset)) {
      this.meshSnapOffsetY = options.initialGroundOffset;
    }

    if (typeof options.initialGroundAsl === 'number' && isFinite(options.initialGroundAsl)) {
      this.groundAsl = options.initialGroundAsl;
    } else if (typeof options.initialGroundOffset === 'number' && isFinite(options.initialGroundOffset)) {
      this.groundAsl = options.initialGroundOffset;
    }

    // 1. Check if backend pre-calculated ground datum is provided
    if (typeof options.initialGroundOffset === 'number' && isFinite(options.initialGroundOffset)) {
      this.groundSnapOffset = options.initialGroundOffset;
      this.datumAligned = true;
      const initialPt = options.initialSurfaceCenterPoint || options.initialCenterSurfacePoint || options.initialLowestPoint;
      if (initialPt) {
        this.surfaceCenterPoint = { ...initialPt };
      }
      if (options.initialElevationRange) {
        this.elevationRange = { ...options.initialElevationRange };
        this.heatmapUniforms.uMinElevation.value = options.initialElevationRange.min ?? -5.0;
        this.heatmapUniforms.uMaxElevation.value = options.initialElevationRange.max ?? 5.0;
      }
      console.log('[TilesetEngine] Pre-loaded datum applied: groundAsl =', this.groundAsl, 'meshSnap =', this.meshSnapOffsetY, 'surfaceCenterPoint =', this.surfaceCenterPoint);
    }

    const onTilesetLoaded = (e) => {
      if (this.initialOriented) return;
      this.initialOriented = true;
      console.log('[TilesetEngine] 3D Tileset root loaded successfully. Event:', e?.type || 'load');
      this.applyTransform();
      this.isLoaded = true;

      // Extract real-world georeferenced GPS coordinates from root bounding volume
      const geo = this.getGeographicCoordinates();
      if (geo) {
        this.geographicCoordinates = geo;
        console.log(`[TilesetEngine] Detected 3D Tiles GPS: Lat ${geo.lat.toFixed(6)}° N, Lon ${geo.lon.toFixed(6)}° E (${geo.source})`);
        this.onGeoCoordinatesCallbacks.forEach(cb => cb(geo));
      }

      if (!this.datumAligned) {
        const json = this.tilesRenderer.rootTileset || this.tilesRenderer.rootTileSet;
        const datum = this.computeTilesetDatumFromBox(json, this.currentOrientationMode);
        if (datum) {
          this.groundSnapOffset = datum.groundOffset;
          this.surfaceCenterPoint = datum.surfaceCenterPoint;
          this.elevationRange = datum.elevationRange;
          this.datumAligned = true;
          this.applyTransform();
          this.tilesRenderer.group.visible = true;
          if (this.surfaceCenterPoint) {
            this.createDatumBenchmarkMarker(this.surfaceCenterPoint);
          }
          this.heatmapUniforms.uMinElevation.value = datum.elevationRange?.min ?? -5.0;
          this.heatmapUniforms.uMaxElevation.value = datum.elevationRange?.max ?? 5.0;
          this.onDatumAlignedCallbacks.forEach(cb => cb(datum));
        } else {
          this.alignSurfaceDatum();
        }
      } else {
        this.tilesRenderer.group.visible = true;
        if (this.surfaceCenterPoint && !this.datumBenchmarkMarker) {
          this.createDatumBenchmarkMarker(this.surfaceCenterPoint);
        }
        this.onDatumAlignedCallbacks.forEach(cb => cb({
          surfaceCenterPoint: this.surfaceCenterPoint,
          groundOffset: this.groundAsl || this.groundSnapOffset,
          groundAsl: this.groundAsl || this.groundSnapOffset,
          meshSnapOffset: this.meshSnapOffsetY || this.groundSnapOffset,
          elevationRange: this.elevationRange
        }));
      }

      this.onLoadCallbacks.forEach((cb) => cb(this.tilesRenderer));
    };

    // Pre-fetch tileset.json for immediate instant GPS extraction & instant datum calculation
    if (typeof tilesetUrl === 'string' && tilesetUrl.endsWith('.json')) {
      fetch(tilesetUrl)
        .then(res => res.ok ? res.json() : null)
        .then(json => {
          if (json) {
            const geo = extract3DTilesGPS(json);
            if (geo && !this.geographicCoordinates) {
              this.geographicCoordinates = geo;
              console.log(`[TilesetEngine] Instant Prefetched GPS: Lat ${geo.lat.toFixed(6)}° N, Lon ${geo.lon.toFixed(6)}° E (${geo.source})`);
              this.onGeoCoordinatesCallbacks.forEach(cb => cb(geo));
            }

            // Instant Bounding-Box Datum Extraction if not already aligned
            if (!this.datumAligned) {
              const datum = this.computeTilesetDatumFromBox(json, this.currentOrientationMode);
              if (datum) {
                console.log('[TilesetEngine] Instantly pre-calculated datum from tileset.json bounding box:', datum);
                this.groundSnapOffset = datum.groundOffset;
                this.surfaceCenterPoint = datum.surfaceCenterPoint;
                this.elevationRange = datum.elevationRange;
                this.datumAligned = true;
                this.applyTransform();
                this.tilesRenderer.group.visible = true;
                if (this.surfaceCenterPoint) {
                  this.createDatumBenchmarkMarker(this.surfaceCenterPoint);
                }
                this.heatmapUniforms.uMinElevation.value = datum.elevationRange?.min ?? -5.0;
                this.heatmapUniforms.uMaxElevation.value = datum.elevationRange?.max ?? 5.0;
                this.onDatumAlignedCallbacks.forEach(cb => cb(datum));
              }
            }
          }
        })
        .catch(err => console.warn('[TilesetEngine] Prefetch GPS notice:', err.message));
    }

    // Support both 3d-tiles-renderer v0.5.x and v0.3.x events
    this.tilesRenderer.addEventListener('load-root-tileset', onTilesetLoaded);
    this.tilesRenderer.addEventListener('load-tileset', onTilesetLoaded);
    this.tilesRenderer.addEventListener('load-tile-set', onTilesetLoaded);

    this.tilesRenderer.addEventListener('load-error', (e) => {
      console.error('[TilesetEngine] Tile loading error:', e?.url || e);
    });

    // LRU Tile Eviction Handler: Prevents VRAM and heap memory leaks during streaming
    this.tilesRenderer.addEventListener('dispose-model', ({ scene: modelScene }) => {
      if (!modelScene) return;
      modelScene.traverse((child) => {
        if (child._pointsObject) {
          if (child._pointsObject.material) {
            child._pointsObject.material.dispose();
          }
          const idx = this._pointsList.indexOf(child._pointsObject);
          if (idx !== -1) {
            this._pointsList.splice(idx, 1);
          }
          child._pointsObject = null;
        }
      });
    });

    this.tilesRenderer.addEventListener('load-model', ({ scene: modelScene }) => {
      if (!modelScene) return;
      modelScene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.side = THREE.DoubleSide;
            child.material.shadowSide = THREE.DoubleSide;
            if (child.material.roughness !== undefined) {
              child.material.roughness = 0.92;
            }
            if (child.material.metalness !== undefined) {
              child.material.metalness = 0.04;
            }
            if (child.material.map) {
              child.material.map.colorSpace = THREE.SRGBColorSpace;
            }

            // Set custom cache key to force unique shader compilation
            child.material.customProgramCacheKey = () => 'engine_gis_shaders_v7';

            // Inject High-Definition Hypsometric Elevation & Slope Colormap Shader
            child.material.onBeforeCompile = (shader) => {
              // Elevation Uniforms
              shader.uniforms.uHeatmapEnabled = this.heatmapUniforms.uHeatmapEnabled;
              shader.uniforms.uMinElevation = this.heatmapUniforms.uMinElevation;
              shader.uniforms.uMaxElevation = this.heatmapUniforms.uMaxElevation;
              shader.uniforms.uHeatmapOpacity = this.heatmapUniforms.uHeatmapOpacity;
              shader.uniforms.uContourSpacing = this.heatmapUniforms.uContourSpacing;
              shader.uniforms.uContourEnabled = this.heatmapUniforms.uContourEnabled;

              // Slope Uniforms
              shader.uniforms.uSlopeEnabled = this.slopeUniforms.uSlopeEnabled;
              shader.uniforms.uSlopeOpacity = this.slopeUniforms.uSlopeOpacity;
              shader.uniforms.uSlopeMaxAngle = this.slopeUniforms.uSlopeMaxAngle;
              shader.uniforms.uSlopeCriticalAngle = this.slopeUniforms.uSlopeCriticalAngle;

              // Volume Cutout Uniforms
              shader.uniforms.uVolumeCutoutEnabled = this.volumeCutoutUniforms.uVolumeCutoutEnabled;
              shader.uniforms.uVolumePolyCount = this.volumeCutoutUniforms.uVolumePolyCount;
              shader.uniforms.uVolumePolygon = this.volumeCutoutUniforms.uVolumePolygon;
              shader.uniforms.uVolumeOpacity = this.volumeCutoutUniforms.uVolumeOpacity;

              shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
                 varying vec3 vSceneWorldPos;
                 varying float vSceneElevation;`
              );
              shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `#include <project_vertex>
                 vec4 sceneWorldPos = modelMatrix * vec4(position, 1.0);
                 vSceneWorldPos = sceneWorldPos.xyz;
                 vSceneElevation = sceneWorldPos.y;`
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
                 varying vec3 vSceneWorldPos;
                 varying float vSceneElevation;

                 uniform bool uHeatmapEnabled;
                 uniform float uMinElevation;
                 uniform float uMaxElevation;
                 uniform float uHeatmapOpacity;
                 uniform float uContourSpacing;
                 uniform bool uContourEnabled;

                 uniform bool uSlopeEnabled;
                 uniform float uSlopeOpacity;
                 uniform float uSlopeMaxAngle;
                 uniform float uSlopeCriticalAngle;

                 uniform bool uVolumeCutoutEnabled;
                 uniform int uVolumePolyCount;
                 uniform vec2 uVolumePolygon[16];
                 uniform float uVolumeOpacity;

                 vec3 getElevationColor(float t) {
                   t = clamp(t, 0.0, 1.0);
                   if (t < 0.2) {
                     return mix(vec3(0.02, 0.12, 0.85), vec3(0.0, 0.78, 0.98), t / 0.2);
                   } else if (t < 0.4) {
                     return mix(vec3(0.0, 0.78, 0.98), vec3(0.05, 0.88, 0.25), (t - 0.2) / 0.2);
                   } else if (t < 0.6) {
                     return mix(vec3(0.05, 0.88, 0.25), vec3(1.0, 0.92, 0.05), (t - 0.4) / 0.2);
                   } else if (t < 0.8) {
                     return mix(vec3(1.0, 0.92, 0.05), vec3(1.0, 0.4, 0.02), (t - 0.6) / 0.2);
                   } else {
                     return mix(vec3(1.0, 0.4, 0.02), vec3(0.92, 0.08, 0.12), (t - 0.8) / 0.2);
                   }
                 }

                 vec3 getSlopeColor(float t) {
                   t = clamp(t, 0.0, 1.0);
                   if (t < 0.2) {
                     return mix(vec3(0.06, 0.78, 0.38), vec3(0.65, 0.92, 0.15), t / 0.2);
                   } else if (t < 0.45) {
                     return mix(vec3(0.65, 0.92, 0.15), vec3(0.98, 0.75, 0.08), (t - 0.2) / 0.25);
                   } else if (t < 0.7) {
                     return mix(vec3(0.98, 0.75, 0.08), vec3(0.95, 0.35, 0.05), (t - 0.45) / 0.25);
                   } else if (t < 0.9) {
                     return mix(vec3(0.95, 0.35, 0.05), vec3(0.92, 0.08, 0.15), (t - 0.7) / 0.2);
                   } else {
                     return mix(vec3(0.92, 0.08, 0.15), vec3(0.75, 0.1, 0.85), (t - 0.9) / 0.1);
                   }
                 }`
              );

              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                 // 1. Hypsometric Elevation Colormap
                 if (uHeatmapEnabled) {
                   float range = max(0.01, uMaxElevation - uMinElevation);
                   float normY = clamp((vSceneElevation - uMinElevation) / range, 0.0, 1.0);
                   vec3 heatRgb = getElevationColor(normY);

                   if (uContourEnabled && uContourSpacing > 0.02) {
                     float f = fract(vSceneElevation / uContourSpacing);
                     float df = fwidth(vSceneElevation / uContourSpacing);
                     float contour = smoothstep(0.0, max(0.001, df * 2.0), f) * (1.0 - smoothstep(1.0 - max(0.001, df * 2.0), 1.0, f));
                     heatRgb = mix(vec3(0.05, 0.05, 0.08), heatRgb, contour);
                   }

                   float luminance = gl_FragColor.r * 0.299 + gl_FragColor.g * 0.587 + gl_FragColor.b * 0.114;
                   vec3 shadedHeat = heatRgb * (0.6 + 0.4 * luminance);
                   gl_FragColor.rgb = mix(gl_FragColor.rgb, shadedHeat, uHeatmapOpacity);
                 }

                 // 2. Slope & Gradient Stability Analysis
                 if (uSlopeEnabled) {
                   vec3 dX = dFdx(vSceneWorldPos);
                   vec3 dY = dFdy(vSceneWorldPos);
                   vec3 geoNormal = normalize(cross(dX, dY));

                   float cosTheta = clamp(abs(geoNormal.y), 0.0, 1.0);
                   float slopeAngleDeg = acos(cosTheta) * 57.2957795;
                   float t = clamp(slopeAngleDeg / max(1.0, uSlopeMaxAngle), 0.0, 1.0);
                   vec3 slopeRgb = getSlopeColor(t);

                   if (slopeAngleDeg >= uSlopeCriticalAngle) {
                     slopeRgb = mix(slopeRgb, vec3(1.0, 0.05, 0.25), 0.45);
                   }

                   float luminance = gl_FragColor.r * 0.299 + gl_FragColor.g * 0.587 + gl_FragColor.b * 0.114;
                   vec3 shadedSlope = slopeRgb * (0.6 + 0.4 * luminance);
                   gl_FragColor.rgb = mix(gl_FragColor.rgb, shadedSlope, uSlopeOpacity);
                 }

                 // 3. Localized Cut/Fill Volume Mesh Transparency
                 if (uVolumeCutoutEnabled && uVolumePolyCount >= 3) {
                   bool inPoly = false;
                   vec2 p = vSceneWorldPos.xz;
                   for (int i = 0; i < 16; i++) {
                     if (i >= uVolumePolyCount) break;
                     int j = (i == 0) ? (uVolumePolyCount - 1) : (i - 1);
                     vec2 pi = uVolumePolygon[i];
                     vec2 pj = uVolumePolygon[j];
                     if (((pi.y > p.y) != (pj.y > p.y)) && (p.x < (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y + 0.0000001) + pi.x)) {
                       inPoly = !inPoly;
                     }
                   }
                   if (inPoly) {
                     gl_FragColor.a = min(gl_FragColor.a, uVolumeOpacity);
                   }
                 }`
              );
            };

            // ─── Auto-Calibrate: sample actual vertex world-space Y to find real elevation range only if datum unaligned ───
            if (!this._hasCalibrated && !this.datumAligned && child.geometry) {
              const posAttr = child.geometry.getAttribute('position');
              if (posAttr) {
                child.updateMatrixWorld(true);
                const v = new THREE.Vector3();
                let sampleMin = Infinity, sampleMax = -Infinity;
                const step = Math.max(1, Math.floor(posAttr.count / 200)); // sample up to 200 verts
                for (let i = 0; i < posAttr.count; i += step) {
                  v.fromBufferAttribute(posAttr, i);
                  v.applyMatrix4(child.matrixWorld);
                  if (isFinite(v.y)) {
                    sampleMin = Math.min(sampleMin, v.y);
                    sampleMax = Math.max(sampleMax, v.y);
                  }
                }
                if (isFinite(sampleMin) && isFinite(sampleMax) && sampleMax > sampleMin) {
                  console.log('[TilesetEngine] Auto-calibrated elevation from vertex data:', sampleMin.toFixed(3), 'to', sampleMax.toFixed(3));
                  if (!this.datumAligned) {
                    this.heatmapUniforms.uMinElevation.value = sampleMin;
                    this.heatmapUniforms.uMaxElevation.value = sampleMax;
                  }
                  this._calibratedMin = sampleMin;
                  this._calibratedMax = sampleMax;
                  this._hasCalibrated = true;
                }
              }
            }

            // Attach synchronized THREE.Points object only if Point Cloud Mode is active
            if (this.pointCloudMode) {
              this._buildPointsForMesh(child);
            }
          }
        }
      });

      // Establish upper surface center datum once initial tiles load
      if (!this.datumAligned || !this.surfaceCenterPoint || this.surfaceCenterPoint._isEstimate) {
        if (!this._initialDatumTimer) {
          this._initialDatumTimer = setTimeout(() => {
            this._initialDatumTimer = null;
            this.alignSurfaceDatum();
          }, 350);
        }
      }
    });

    // Start with group hidden until datum is aligned to prevent underground floating glitch
    this.tilesRenderer.group.visible = this.datumAligned;
    this.scene.add(this.tilesRenderer.group);
    return this.tilesRenderer;
  }

  updateElevationBounds() {
    if (!this.tilesRenderer || !this.tilesRenderer.group) return;
    const bbox = new THREE.Box3().setFromObject(this.tilesRenderer.group);
    if (isFinite(bbox.min.y) && isFinite(bbox.max.y) && bbox.max.y > bbox.min.y) {
      this.heatmapUniforms.uMinElevation.value = bbox.min.y;
      this.heatmapUniforms.uMaxElevation.value = bbox.max.y;
      console.log('[TilesetEngine] Auto elevation bounds set:', bbox.min.y.toFixed(2), 'to', bbox.max.y.toFixed(2));
    }
  }

  setHeatmapEnabled(enabled) {
    this.heatmapUniforms.uHeatmapEnabled.value = enabled;
    if (this.tilesRenderer && this.tilesRenderer.group) {
      this.tilesRenderer.group.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.needsUpdate = true;
        }
      });
    }
  }

  setHeatmapOpacity(opacity) {
    this.heatmapUniforms.uHeatmapOpacity.value = opacity;
  }

  setHeatmapRange(minY, maxY) {
    this.heatmapUniforms.uMinElevation.value = minY;
    this.heatmapUniforms.uMaxElevation.value = maxY;
  }

  setContourSpacing(spacing) {
    this.heatmapUniforms.uContourSpacing.value = spacing;
  }

  setContourEnabled(enabled) {
    this.heatmapUniforms.uContourEnabled.value = enabled;
  }

  setHeatmapMode(enabled, options = {}) {
    this.setHeatmapEnabled(enabled);
    if (options.minElev !== undefined && options.maxElev !== undefined) {
      this.setHeatmapRange(options.minElev, options.maxElev);
    }
    if (options.opacity !== undefined) {
      this.setHeatmapOpacity(options.opacity);
    }
    if (options.contourSpacing !== undefined) {
      this.setContourSpacing(options.contourSpacing);
      this.setContourEnabled(options.contourSpacing > 0);
    }
  }

  setSlopeEnabled(enabled) {
    this.slopeUniforms.uSlopeEnabled.value = enabled;
    if (this.tilesRenderer && this.tilesRenderer.group) {
      this.tilesRenderer.group.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.needsUpdate = true;
        }
      });
    }
  }

  setSlopeOpacity(opacity) {
    this.slopeUniforms.uSlopeOpacity.value = opacity;
  }

  setSlopeCriticalAngle(angle) {
    this.slopeUniforms.uSlopeCriticalAngle.value = angle;
  }

  setSlopeMaxAngle(angle) {
    this.slopeUniforms.uSlopeMaxAngle.value = angle;
  }

  setSlopeMode(enabled, options = {}) {
    this.setSlopeEnabled(enabled);
    if (options.criticalAngle !== undefined) {
      this.setSlopeCriticalAngle(options.criticalAngle);
    }
    if (options.opacity !== undefined) {
      this.setSlopeOpacity(options.opacity);
    }
  }

  setVolumePolygonCutout(polygonPoints, opacity = 0.35) {
    if (!polygonPoints || polygonPoints.length < 3) {
      this.clearVolumePolygonCutout();
      return;
    }
    const count = Math.min(16, polygonPoints.length);
    const arr = new Array(16).fill(0).map((_, i) => {
      if (i < count) {
        return new THREE.Vector2(polygonPoints[i].x, polygonPoints[i].z);
      }
      return new THREE.Vector2(0, 0);
    });

    this.volumeCutoutUniforms.uVolumePolygon.value = arr;
    this.volumeCutoutUniforms.uVolumePolyCount.value = count;
    this.volumeCutoutUniforms.uVolumeOpacity.value = opacity;
    this.volumeCutoutUniforms.uVolumeCutoutEnabled.value = true;

    if (this.tilesRenderer && this.tilesRenderer.group) {
      this.tilesRenderer.group.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.transparent = true;
          child.material.depthWrite = true;
          child.material.needsUpdate = true;
        }
      });
    }
  }

  clearVolumePolygonCutout() {
    this.volumeCutoutUniforms.uVolumeCutoutEnabled.value = false;
    this.volumeCutoutUniforms.uVolumePolyCount.value = 0;
    if (this.tilesRenderer && this.tilesRenderer.group) {
      this.tilesRenderer.group.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.transparent = false;
          child.material.needsUpdate = true;
        }
      });
    }
  }

  _buildPointsForMesh(child) {
    if (child._pointsObject || !child.geometry) return;
    const pointsGeo = child.geometry;
    const pointsMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: child.material?.map || null },
        hasMap: { value: child.material?.map ? 1.0 : 0.0 },
        uPointSize: this.pointCloudUniforms.uPointSize,
        uPointShape: this.pointCloudUniforms.uPointShape,
        uPointColorMode: this.pointCloudUniforms.uPointColorMode,
        uMinElevation: this.pointCloudUniforms.uMinElevation,
        uMaxElevation: this.pointCloudUniforms.uMaxElevation,
        uSlopeMaxAngle: this.pointCloudUniforms.uSlopeMaxAngle
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vSceneWorldPos;
        varying float vSceneElevation;
        uniform float uPointSize;

        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vSceneWorldPos = worldPos.xyz;
          vSceneElevation = worldPos.y;

          vec4 mvPosition = viewMatrix * worldPos;
          gl_Position = projectionMatrix * mvPosition;
          
          gl_PointSize = uPointSize * (280.0 / max(1.0, -mvPosition.z));
          gl_PointSize = clamp(gl_PointSize, 1.0, 48.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vSceneWorldPos;
        varying float vSceneElevation;

        uniform sampler2D map;
        uniform float hasMap;
        uniform int uPointShape;
        uniform int uPointColorMode;
        uniform float uMinElevation;
        uniform float uMaxElevation;
        uniform float uSlopeMaxAngle;

        vec3 getElevationColor(float t) {
          t = clamp(t, 0.0, 1.0);
          if (t < 0.2) {
            return mix(vec3(0.02, 0.12, 0.85), vec3(0.0, 0.78, 0.98), t / 0.2);
          } else if (t < 0.4) {
            return mix(vec3(0.0, 0.78, 0.98), vec3(0.05, 0.88, 0.25), (t - 0.2) / 0.2);
          } else if (t < 0.6) {
            return mix(vec3(0.05, 0.88, 0.25), vec3(1.0, 0.92, 0.05), (t - 0.4) / 0.2);
          } else if (t < 0.8) {
            return mix(vec3(1.0, 0.92, 0.05), vec3(1.0, 0.4, 0.02), (t - 0.6) / 0.2);
          } else {
            return mix(vec3(1.0, 0.4, 0.02), vec3(0.6, 0.0, 0.0), (t - 0.8) / 0.2);
          }
        }

        void main() {
          if (uPointShape == 1) {
            vec2 coord = gl_PointCoord - vec2(0.5);
            if (length(coord) > 0.5) discard;
          }

          vec3 color = vec3(0.2, 0.7, 1.0);

          if (uPointColorMode == 0) {
            if (hasMap > 0.5) {
              vec4 texColor = texture2D(map, vUv);
              color = texColor.rgb;
            } else {
              color = vec3(0.8, 0.8, 0.85);
            }
          } else if (uPointColorMode == 1) {
            float range = max(0.01, uMaxElevation - uMinElevation);
            float normY = clamp((vSceneElevation - uMinElevation) / range, 0.0, 1.0);
            color = getElevationColor(normY);
          } else if (uPointColorMode == 2) {
            vec3 dX = dFdx(vSceneWorldPos);
            vec3 dY = dFdy(vSceneWorldPos);
            vec3 geoNormal = normalize(cross(dX, dY));
            float cosTheta = clamp(abs(geoNormal.y), 0.0, 1.0);
            float slopeAngleDeg = acos(cosTheta) * 57.2957795;
            float t = clamp(slopeAngleDeg / max(1.0, uSlopeMaxAngle), 0.0, 1.0);
            color = mix(vec3(0.06, 0.85, 0.4), vec3(0.95, 0.1, 0.15), t);
          } else if (uPointColorMode == 3) {
            color = vec3(0.12, 0.95, 0.45);
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: true
    });

    const points = new THREE.Points(pointsGeo, pointsMat);
    points.visible = this.pointCloudMode;
    child.add(points);
    child._pointsObject = points;
    this._pointsList.push(points);

    if (this.pointCloudMode && child.material) {
      child.material.visible = false;
    }
  }

  setHeatmapMode(enabled, options = {}) {
    this.setHeatmapEnabled(enabled);
    if (options.minElev !== undefined && options.maxElev !== undefined) {
      this.setHeatmapRange(options.minElev, options.maxElev);
    }
    if (options.opacity !== undefined) {
      this.setHeatmapOpacity(options.opacity);
    }
    if (options.contourSpacing !== undefined) {
      this.setContourSpacing(options.contourSpacing);
    }
    if (options.contourEnabled !== undefined) {
      this.setContourEnabled(options.contourEnabled);
    }
  }

  setHeatmapOpacity(opacity) {
    this.heatmapUniforms.uHeatmapOpacity.value = opacity;
  }

  setHeatmapRange(minY, maxY) {
    this.heatmapUniforms.uMinElevation.value = minY;
    this.heatmapUniforms.uMaxElevation.value = maxY;
  }

  setContourSpacing(spacing) {
    this.heatmapUniforms.uContourSpacing.value = spacing;
  }

  setContourEnabled(enabled) {
    this.heatmapUniforms.uContourEnabled.value = enabled;
  }

  setSlopeMode(enabled, options = {}) {
    this.setSlopeEnabled(enabled);
    if (options.criticalAngle !== undefined) {
      this.setSlopeCriticalAngle(options.criticalAngle);
    }
    if (options.maxAngle !== undefined) {
      this.setSlopeMaxAngle(options.maxAngle);
    }
    if (options.opacity !== undefined) {
      this.setSlopeOpacity(options.opacity);
    }
  }

  setSlopeEnabled(enabled) {
    this.slopeUniforms.uSlopeEnabled.value = enabled;
    if (this.tilesRenderer && this.tilesRenderer.group) {
      this.tilesRenderer.group.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.needsUpdate = true;
        }
      });
    }
  }

  setSlopeOpacity(opacity) {
    this.slopeUniforms.uSlopeOpacity.value = opacity;
  }

  setSlopeCriticalAngle(angle) {
    this.slopeUniforms.uSlopeCriticalAngle.value = angle;
  }

  setSlopeMaxAngle(angle) {
    this.slopeUniforms.uSlopeMaxAngle.value = angle;
  }

  // ─── Dense Point Cloud (LIDAR) Controls ───
  setPointCloudMode(enabled) {
    this.pointCloudMode = Boolean(enabled);
    this.pointCloudUniforms.uPointCloudEnabled.value = this.pointCloudMode;

    if (this.tilesRenderer && this.tilesRenderer.group) {
      this.tilesRenderer.group.traverse((child) => {
        if (child.isMesh) {
          if (this.pointCloudMode) {
            if (!child._pointsObject && child.geometry) {
              this._buildPointsForMesh(child);
            }
            if (child._pointsObject) {
              child._pointsObject.visible = true;
            }
            if (child.material) {
              child.material.visible = false;
            }
          } else {
            if (child._pointsObject) {
              child._pointsObject.visible = false;
            }
            if (child.material) {
              child.material.visible = true;
            }
          }
        }
      });
    }
  }

  setPointSize(size) {
    this.pointCloudUniforms.uPointSize.value = Number(size);
  }

  setPointShape(shape) {
    this.pointCloudUniforms.uPointShape.value = shape === 'square' ? 0 : 1;
  }

  setPointColorMode(mode) {
    // 'rgb' -> 0, 'elevation' -> 1, 'slope' -> 2, 'phosphor' -> 3
    const modeMap = { rgb: 0, elevation: 1, slope: 2, phosphor: 3 };
    this.pointCloudUniforms.uPointColorMode.value = modeMap[mode] ?? 0;
  }

  getLoadedPointsCount() {
    let total = 0;
    for (const pts of this._pointsList) {
      if (pts.geometry && pts.geometry.attributes.position) {
        total += pts.geometry.attributes.position.count;
      }
    }
    return total;
  }

  applyTransform() {
    if (!this.tilesRenderer || !this.tilesRenderer.group) return;

    const tileset = this.tilesRenderer.rootTileset || this.tilesRenderer.rootTileSet;
    const rawTransform = tileset?.root?.transform;
    const rootTransform = (rawTransform && Array.isArray(rawTransform) && rawTransform.length === 16)
      ? rawTransform
      : [
        0.01067727,  0.999943,    0.0,         0.0,
       -0.58055003,  0.00619904,  0.81420098,  0.0,
        0.81415457, -0.00869344,  0.58058312,  0.0,
        5198691.8546585, -55511.95275214, 3682424.14696158, 1.0
      ];

    const m4Root = new THREE.Matrix4().fromArray(rootTransform);
    const invRoot = m4Root.clone().invert();

    let rotMat = new THREE.Matrix4().identity();
    if (this.currentOrientationMode === 'rotX_90') {
      rotMat.makeRotationX(Math.PI / 2);
    } else if (this.currentOrientationMode === 'rotX_neg90') {
      rotMat.makeRotationX(-Math.PI / 2);
    } else if (this.currentOrientationMode === 'rotZ_90') {
      rotMat.makeRotationZ(Math.PI / 2);
    } else if (this.currentOrientationMode === 'rotZ_neg90') {
      rotMat.makeRotationZ(-Math.PI / 2);
    } else if (this.currentOrientationMode === 'rotY_90') {
      rotMat.makeRotationY(Math.PI / 2);
    } else if (this.currentOrientationMode === 'rotY_neg90') {
      rotMat.makeRotationY(-Math.PI / 2);
    }

    const finalTransform = new THREE.Matrix4().multiplyMatrices(rotMat, invRoot);

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    finalTransform.decompose(position, quaternion, scale);

    this.tilesRenderer.group.position.copy(position);
    this.tilesRenderer.group.position.y += (this.floorOffsetY + (this.meshSnapOffsetY || this.groundSnapOffset));
    this.tilesRenderer.group.quaternion.copy(quaternion);
    this.tilesRenderer.group.scale.copy(scale);

    console.log('[TilesetEngine] Transform applied. Group position:', this.tilesRenderer.group.position);
  }

  /**
   * Computes ground snap offset from tileset.json bounding box for instant height calibration
   */
  computeTilesetDatumFromBox(json, orientation = 'rotX_neg90') {
    if (!json || !json.root) return null;
    const root = json.root;
    const rawTransform = root.transform || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m4Root = new THREE.Matrix4().fromArray(rawTransform);
    const invRoot = m4Root.clone().invert();
    let rotMat = new THREE.Matrix4().identity();
    if (orientation === 'rotX_neg90') rotMat.makeRotationX(-Math.PI / 2);
    else if (orientation === 'rotX_90') rotMat.makeRotationX(Math.PI / 2);
    const finalMat = new THREE.Matrix4().multiplyMatrices(rotMat, invRoot);

    const box = root.boundingVolume?.box;
    if (!box || box.length !== 12) return null;

    const center = new THREE.Vector3(box[0], box[1], box[2]);
    const xAxis = new THREE.Vector3(box[3], box[4], box[5]);
    const yAxis = new THREE.Vector3(box[6], box[7], box[8]);
    const zAxis = new THREE.Vector3(box[9], box[10], box[11]);

    let minY = Infinity;
    let maxY = -Infinity;

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const pt = center.clone()
            .addScaledVector(xAxis, sx)
            .addScaledVector(yAxis, sy)
            .addScaledVector(zAxis, sz);
          pt.applyMatrix4(m4Root);
          pt.applyMatrix4(finalMat);

          if (pt.y < minY) {
            minY = pt.y;
          }
          if (pt.y > maxY) {
            maxY = pt.y;
          }
        }
      }
    }

    if (!isFinite(minY)) return null;

    const meshSnapOffset = -minY;
    const heightSpan = maxY - minY;
    return {
      groundOffset: this.groundAsl || Number(meshSnapOffset.toFixed(3)),
      groundAsl: this.groundAsl || Number(meshSnapOffset.toFixed(3)),
      meshSnapOffset: Number(meshSnapOffset.toFixed(3)),
      minYRaw: Number(minY.toFixed(3)),
      maxYRaw: Number(maxY.toFixed(3)),
      surfaceCenterPoint: {
        x: 0.0,
        y: Number(((maxY + minY) * 0.5 + meshSnapOffset).toFixed(3)),
        z: 0.0,
        _isEstimate: true
      },
      elevationRange: {
        min: Number((-heightSpan * 0.5).toFixed(3)),
        max: Number((heightSpan * 0.5).toFixed(3))
      }
    };
  }

  /**
   * Scans loaded 3D tile meshes to find the TRUE upper surface point at horizontal (0, 0)
   * (strictly on the upper surface of the 3D mesh, not inside or at the bottom)
   */
  findSurfaceCenterDatum() {
    if (!this.tilesRenderer || !this.tilesRenderer.group) return null;

    const box = new THREE.Box3().setFromObject(this.tilesRenderer.group);
    if (box.isEmpty() || !isFinite(box.min.x)) return null;

    const rayOriginY = box.max.y + 100.0;
    const raycaster = new THREE.Raycaster();
    const downVec = new THREE.Vector3(0, -1, 0);

    // Cast rays straight down starting at (0, 0) and small concentric offsets if (0,0) misses
    const searchOffsets = [
      [0, 0],
      [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5],
      [1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0],
      [2.0, 0], [-2.0, 0], [0, 2.0], [0, -2.0],
      [3.0, 0], [-3.0, 0], [0, 3.0], [0, -3.0],
      [5.0, 0], [-5.0, 0], [0, 5.0], [0, -5.0],
    ];

    let bestHit = null;

    for (const [ox, oz] of searchOffsets) {
      const rayOrigin = new THREE.Vector3(ox, rayOriginY, oz);
      raycaster.set(rayOrigin, downVec);

      const intersects = [];
      raycaster.intersectObject(this.tilesRenderer.group, true, intersects);

      if (intersects.length > 0) {
        for (const hit of intersects) {
          let isUpward = true;
          if (hit.face && hit.face.normal) {
            const worldNormal = hit.face.normal.clone();
            if (hit.object) worldNormal.transformDirection(hit.object.matrixWorld);
            if (worldNormal.y < -0.2) {
              isUpward = false;
            }
          }
          if (isUpward) {
            bestHit = hit.point.clone();
            break;
          }
        }
        if (bestHit) break;
      }
    }

    if (!bestHit) {
      // Fallback: search nearest vertex to (0, 0)
      let highestY = -Infinity;
      let fallbackPt = null;
      const v = new THREE.Vector3();

      this.tilesRenderer.group.traverse((child) => {
        if (child.isMesh && child.geometry) {
          child.updateMatrixWorld(true);
          const posAttr = child.geometry.getAttribute('position');
          if (posAttr && posAttr.count > 0) {
            const step = posAttr.count > 30000 ? Math.floor(posAttr.count / 15000) : 1;
            for (let i = 0; i < posAttr.count; i += step) {
              v.fromBufferAttribute(posAttr, i);
              v.applyMatrix4(child.matrixWorld);
              const dist2D = Math.hypot(v.x, v.z);
              if (dist2D < 15.0) {
                if (v.y > highestY) {
                  highestY = v.y;
                  fallbackPt = v.clone();
                }
              }
            }
          }
        }
      });
      if (fallbackPt) bestHit = fallbackPt;
    }

    if (!bestHit) return null;

    return {
      x: Number(bestHit.x.toFixed(3)),
      y: Number(bestHit.y.toFixed(3)),
      z: Number(bestHit.z.toFixed(3))
    };
  }

  /**
   * Creates or updates the 3D Datum Benchmark Marker at the upper surface center point
   */
  createDatumBenchmarkMarker(point) {
    if (!point || typeof point.x !== 'number') return;
    const posX = Number(point.x) || 0;
    const posY = (typeof point.y === 'number' ? point.y : 0.0) + 0.05;
    const posZ = Number(point.z) || 0;

    if (this.datumBenchmarkMarker) {
      this.datumBenchmarkMarker.setPosition(posX, posY, posZ);
      return;
    }
    const aslLabel = this.groundAsl ? ` (${this.groundAsl.toFixed(1)}m ASL)` : '';
    this.datumBenchmarkMarker = new DatumBenchmarkMarker(this.scene, { x: posX, y: posY, z: posZ }, {
      subLabel: `Center Surface Datum • 0.00m Rel${aslLabel}`
    });
    this.datumBenchmarkMarker.setVisible(this.datumMarkerVisible);
  }

  /**
   * Aligns the datum reference to the TRUE upper surface point at (0, 0)
   * and places the Datum Benchmark Marker directly on the surface
   */
  alignSurfaceDatum(force = false) {
    if (!this.tilesRenderer || !this.tilesRenderer.group) return;
    if (this.datumAligned && !force && this.surfaceCenterPoint && !this.surfaceCenterPoint._isEstimate) return;

    const surfacePt = this.findSurfaceCenterDatum();
    if (!surfacePt) return;

    this.surfaceCenterPoint = surfacePt;
    this.datumAligned = true;
    this.tilesRenderer.group.visible = true;

    // Position or update the benchmark marker directly on the upper surface
    if (this.datumBenchmarkMarker) {
      this.datumBenchmarkMarker.setPosition(this.surfaceCenterPoint.x, this.surfaceCenterPoint.y + 0.05, this.surfaceCenterPoint.z);
    } else {
      this.createDatumBenchmarkMarker(this.surfaceCenterPoint);
    }

    const datumPayload = {
      surfaceCenterPoint: this.surfaceCenterPoint,
      groundOffset: this.groundAsl || this.groundSnapOffset,
      groundAsl: this.groundAsl || this.groundSnapOffset,
      meshSnapOffset: this.meshSnapOffsetY || this.groundSnapOffset,
      elevationRange: this.elevationRange
    };

    this.onDatumAlignedCallbacks.forEach(cb => cb(datumPayload));
    console.log(`[TilesetEngine] Upper surface center datum established at: X=${this.surfaceCenterPoint.x}m, Y=${this.surfaceCenterPoint.y}m, Z=${this.surfaceCenterPoint.z}m (0.00m reference, ${this.groundAsl}m ASL)`);
  }

  setWireframe(wireframe) {
    if (!this.tilesRenderer || !this.tilesRenderer.group) return;
    this.tilesRenderer.group.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.wireframe = wireframe;
      }
    });
  }

  setScreenSpaceError(sse) {
    if (this.tilesRenderer) {
      this.tilesRenderer.errorTarget = sse;
    }
  }

  setFloorOffset(offsetY) {
    this.floorOffsetY = offsetY;
    if (this.tilesRenderer && this.tilesRenderer.group) {
      this.applyTransform();
    }
  }

  setOrientation(mode) {
    this.currentOrientationMode = mode;
    if (this.tilesRenderer && this.tilesRenderer.group) {
      this.applyTransform();
    }
  }

  setCamera(camera) {
    this.camera = camera;
    if (this.tilesRenderer && this.camera) {
      if (!this.tilesRenderer.hasCamera(this.camera)) {
        this.tilesRenderer.setCamera(this.camera);
      }
      if (this.renderer) {
        this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);
      }
    }
  }

  setRenderer(renderer) {
    this.renderer = renderer;
    if (this.tilesRenderer && this.camera && this.renderer) {
      this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);
    }
  }

  update(dt = 0.016) {
    if (this.tilesRenderer) {
      if (this.camera && !this.tilesRenderer.hasCamera(this.camera)) {
        this.tilesRenderer.setCamera(this.camera);
        if (this.renderer) {
          this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);
        }
      }
      this.tilesRenderer.update();
    }
    if (this.datumBenchmarkMarker) {
      this.datumBenchmarkMarker.update(dt);
    }
  }

  getGroup() {
    return this.tilesRenderer?.group;
  }

  raycast(raycaster, intersects) {
    if (this.tilesRenderer) {
      this.tilesRenderer.raycast(raycaster, intersects);
    }
  }

  getGeographicCoordinates() {
    if (this.geographicCoordinates) return this.geographicCoordinates;
    if (this.tilesRenderer?.root) {
      const geo = extract3DTilesGPS(this.tilesRenderer.root);
      if (geo) {
        this.geographicCoordinates = geo;
        return geo;
      }
    }
    return null;
  }

  onGeoCoordinates(callback) {
    if (this.geographicCoordinates) {
      callback(this.geographicCoordinates);
    } else {
      this.onGeoCoordinatesCallbacks.push(callback);
    }
  }

  onDatumAligned(callback) {
    if (this.datumAligned && this.surfaceCenterPoint) {
      callback({
        surfaceCenterPoint: this.surfaceCenterPoint,
        groundOffset: this.groundAsl || this.groundSnapOffset,
        groundAsl: this.groundAsl || this.groundSnapOffset,
        meshSnapOffset: this.meshSnapOffsetY || this.groundSnapOffset,
        elevationRange: this.elevationRange
      });
    } else {
      this.onDatumAlignedCallbacks.push(callback);
    }
  }

  setDatumMarkerVisible(visible) {
    this.datumMarkerVisible = Boolean(visible);
    if (this.datumBenchmarkMarker) {
      this.datumBenchmarkMarker.setVisible(this.datumMarkerVisible);
    }
  }

  getSurfaceCenterPoint() {
    return this.surfaceCenterPoint;
  }

  getLowestPoint() {
    return this.surfaceCenterPoint;
  }

  onLoad(callback) {
    if (this.isLoaded && this.tilesRenderer) {
      callback(this.tilesRenderer);
    } else {
      this.onLoadCallbacks.push(callback);
    }
  }

  dispose() {
    if (this._initialDatumTimer) {
      clearTimeout(this._initialDatumTimer);
      this._initialDatumTimer = null;
    }
    if (this.datumBenchmarkMarker) {
      this.datumBenchmarkMarker.dispose();
      this.datumBenchmarkMarker = null;
    }
    if (this.tilesRenderer) {
      if (this.tilesRenderer.group) {
        this.scene.remove(this.tilesRenderer.group);
        this.tilesRenderer.group.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
          }
          if (child._pointsObject) {
            if (child._pointsObject.material) child._pointsObject.material.dispose();
            child._pointsObject = null;
          }
        });
      }
      this.tilesRenderer.dispose();
      this.tilesRenderer = null;
    }
    for (const pts of this._pointsList) {
      if (pts.material) pts.material.dispose();
    }
    this._pointsList = [];
    this.isLoaded = false;
    this.initialOriented = false;
    this.datumAligned = false;
    this.onLoadCallbacks = [];
    this.onGeoCoordinatesCallbacks = [];
    this.onDatumAlignedCallbacks = [];
    this.geographicCoordinates = null;
    this.surfaceCenterPoint = null;
  }
}
