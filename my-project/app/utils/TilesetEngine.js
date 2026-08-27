import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';

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
    this.isLoaded = false;
    this.initialOriented = false;
    this.onLoadCallbacks = [];

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
  }

  loadTileset(tilesetUrl, initialOrientation = 'rotX_neg90') {
    if (this.tilesRenderer) {
      this.dispose();
    }

    console.log('[TilesetEngine] Initializing 3D TilesRenderer with URL:', tilesetUrl);
    this.currentOrientationMode = initialOrientation;
    this.initialOriented = false;
    this.tilesRenderer = new TilesRenderer(tilesetUrl);

    this.tilesRenderer.setCamera(this.camera);
    this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);

    // Performance & cache tuning matching 3d_tiles test
    this.tilesRenderer.maxDepth = 25;
    this.tilesRenderer.errorTarget = 8;
    this.tilesRenderer.lruCache.minBytes = 256 * 1024 * 1024;
    this.tilesRenderer.lruCache.maxBytes = 768 * 1024 * 1024;

    const onTilesetLoaded = (e) => {
      if (this.initialOriented) return;
      this.initialOriented = true;
      console.log('[TilesetEngine] 3D Tileset root loaded successfully. Event:', e?.type || 'load');
      this.applyTransform();
      this.isLoaded = true;
      this.onLoadCallbacks.forEach((cb) => cb(this.tilesRenderer));
    };

    // Support both 3d-tiles-renderer v0.5.x and v0.3.x events
    this.tilesRenderer.addEventListener('load-root-tileset', onTilesetLoaded);
    this.tilesRenderer.addEventListener('load-tileset', onTilesetLoaded);
    this.tilesRenderer.addEventListener('load-tile-set', onTilesetLoaded);

    this.tilesRenderer.addEventListener('load-error', (e) => {
      console.error('[TilesetEngine] Tile loading error:', e?.url || e);
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
            child.material.customProgramCacheKey = () => 'engine_gis_shaders_v6';

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
                   } else if (t < 0.95) {
                     return mix(vec3(1.0, 0.4, 0.02), vec3(0.92, 0.08, 0.12), (t - 0.8) / 0.15);
                   } else {
                     return mix(vec3(0.92, 0.08, 0.12), vec3(1.0, 1.0, 1.0), (t - 0.95) / 0.05);
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
                   // Calculate true geometric face normal via world-position derivatives
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
                 }`
              );
            };

            // ─── Auto-Calibrate: sample actual vertex world-space Y to find real elevation range ───
            if (!this._hasCalibrated && child.geometry) {
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
                  this.heatmapUniforms.uMinElevation.value = sampleMin;
                  this.heatmapUniforms.uMaxElevation.value = sampleMax;
                  this._calibratedMin = sampleMin;
                  this._calibratedMax = sampleMax;
                  this._hasCalibrated = true;
                }
              }
            }

            // Build / Attach synchronized THREE.Points object for Point Cloud Mode
            if (!child._pointsObject && child.geometry) {
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
                    
                    // Depth-attenuated point size
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
                  uniform int uPointColorMode; // 0: RGB, 1: Elevation, 2: Slope, 3: Phosphor
                  uniform float uMinElevation;
                  uniform float uMaxElevation;
                  uniform float uSlopeMaxAngle;

                  vec3 getElevationColor(float t) {
                    t = clamp(t, 0.0, 1.0);
                    if (t < 0.2) return mix(vec3(0.02, 0.12, 0.85), vec3(0.0, 0.78, 0.98), t / 0.2);
                    else if (t < 0.4) return mix(vec3(0.0, 0.78, 0.98), vec3(0.05, 0.88, 0.25), (t - 0.2) / 0.2);
                    else if (t < 0.6) return mix(vec3(0.05, 0.88, 0.25), vec3(1.0, 0.92, 0.05), (t - 0.4) / 0.2);
                    else if (t < 0.8) return mix(vec3(1.0, 0.92, 0.05), vec3(1.0, 0.4, 0.02), (t - 0.6) / 0.2);
                    else if (t < 0.95) return mix(vec3(1.0, 0.4, 0.02), vec3(0.92, 0.08, 0.12), (t - 0.8) / 0.15);
                    else return mix(vec3(0.92, 0.08, 0.12), vec3(1.0, 1.0, 1.0), (t - 0.95) / 0.05);
                  }

                  void main() {
                    // Circular point disc clipping
                    if (uPointShape == 1) {
                      vec2 coord = gl_PointCoord - vec2(0.5);
                      if (length(coord) > 0.5) discard;
                    }

                    vec3 color = vec3(0.2, 0.7, 1.0);

                    if (uPointColorMode == 0) {
                      // 1. True-Color RGB Texture
                      if (hasMap > 0.5) {
                        vec4 texColor = texture2D(map, vUv);
                        color = texColor.rgb;
                      } else {
                        color = vec3(0.8, 0.8, 0.85);
                      }
                    } else if (uPointColorMode == 1) {
                      // 2. LIDAR Elevation Colormap
                      float range = max(0.01, uMaxElevation - uMinElevation);
                      float normY = clamp((vSceneElevation - uMinElevation) / range, 0.0, 1.0);
                      color = getElevationColor(normY);
                    } else if (uPointColorMode == 2) {
                      // 3. Slope & Steepness
                      vec3 dX = dFdx(vSceneWorldPos);
                      vec3 dY = dFdy(vSceneWorldPos);
                      vec3 geoNormal = normalize(cross(dX, dY));
                      float cosTheta = clamp(abs(geoNormal.y), 0.0, 1.0);
                      float slopeAngleDeg = acos(cosTheta) * 57.2957795;
                      float t = clamp(slopeAngleDeg / max(1.0, uSlopeMaxAngle), 0.0, 1.0);
                      color = mix(vec3(0.06, 0.85, 0.4), vec3(0.95, 0.1, 0.15), t);
                    } else if (uPointColorMode == 3) {
                      // 4. Cyber Laser Phosphor
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
          }
        }
      });
    });

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
          if (child.material) {
            child.material.visible = !this.pointCloudMode;
          }
          if (child._pointsObject) {
            child._pointsObject.visible = this.pointCloudMode;
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
    this.tilesRenderer.group.position.y += this.floorOffsetY;
    this.tilesRenderer.group.quaternion.copy(quaternion);
    this.tilesRenderer.group.scale.copy(scale);

    console.log('[TilesetEngine] Transform applied. Group position:', this.tilesRenderer.group.position);
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

  update() {
    if (this.tilesRenderer) {
      this.tilesRenderer.update();
    }
  }

  getGroup() {
    return this.tilesRenderer?.group;
  }

  onLoad(callback) {
    if (this.isLoaded && this.tilesRenderer) {
      callback(this.tilesRenderer);
    } else {
      this.onLoadCallbacks.push(callback);
    }
  }

  dispose() {
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
        });
      }
      this.tilesRenderer.dispose();
      this.tilesRenderer = null;
    }
    this.isLoaded = false;
    this.initialOriented = false;
    this.onLoadCallbacks = [];
  }
}
