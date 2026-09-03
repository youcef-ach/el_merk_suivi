import { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

import { useThreeScene } from '../hooks/useThreeScene';
import { useStaging } from '../hooks/useStaging';
import { createAreaPointerGroup } from '../utils/createAreaPointerGraphics';
import { createTagSpriteMaterial } from '../hooks/useTags';
import { EquirectProjectiveShader } from '../shaders/EquirectProjectiveShader';
import { StaticCubemapShader } from '../shaders/StaticCubemapShader';
import { textureManager } from '../utils/TextureManager';
import { API_URL, MINIO_URL } from '../config/api';
import { Compass } from 'lucide-react';

// Inject BVH prototype methods
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const IndustrialTourViewer = forwardRef(({
  tourId,
  activeProfileId,
  stagingMode = false,
  measurementMode,
  onMeasurementClick,
  tagMode,
  onTagClick,
  onTagSelect,
  pointersMode,
  onPointerClick,
  onPointerSelect,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
  activeFloor = 'all'
}, ref) => {

  const dummyTex = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const {
    mountRef,
    sceneRef,
    cameraRef,
    rendererRef,
    controlsRef,
    keyboardEnabledRef,
    sceneReady,
    tierConfig,
    setDynamicDpr
  } = useThreeScene([dummyTex], true);

  // Viewer State: 'DOLLHOUSE' | 'TRANSITION' | 'INSIDE'
  const [viewerState, setViewerState] = useState('DOLLHOUSE');
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isInscan, setIsInscan] = useState(false);
  const [isMeshView, setIsMeshView] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // In-browser mobile console tool (Eruda) via ?debug=1
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/eruda';
      script.onload = () => {
        if (window.eruda) window.eruda.init();
      };
      document.body.appendChild(script);
    }
  }, []);

  // Entities
  const [tourDetails, setTourDetails] = useState(null);
  const [scansData, setScansData] = useState([]);
  const [scanSpheres, setScanSpheres] = useState([]);
  const [activeTagInfo, setActiveTagInfo] = useState(null);

  // Scene references
  const modelRef = useRef(null);
  const bubbleRef = useRef(null);
  const bubbleStaticMatRef = useRef(null);
  const bubbleProjMatRef = useRef(null);
  const projectiveMatRef = useRef(null);
  const scansDataRef = useRef({});
  const activeScanIdRef = useRef(null);
  const scanSpheresRef = useRef(null);

  // Staging Hook
  const staging = useStaging(
    sceneRef, cameraRef, rendererRef, controlsRef, modelRef, isDataLoaded, tourId, activeProfileId
  );

  // Expose Three.js internals and Studio handles to parent components
  useImperativeHandle(ref, () => ({
    sceneRef,
    cameraRef,
    rendererRef,
    controlsRef,
    modelRef,
    staging,
    scansData,
    scanSpheres,
    tourDetails,
    isDataLoaded,
  }), [sceneRef, cameraRef, rendererRef, controlsRef, modelRef, staging, scansData, scanSpheres, tourDetails, isDataLoaded]);

  // Mode reference trackers for event callbacks
  const measurementModeRef = useRef(false);
  const onMeasurementClickRef = useRef(null);
  measurementModeRef.current = measurementMode;
  onMeasurementClickRef.current = onMeasurementClick;

  const tagModeRef = useRef(false);
  const onTagClickRef = useRef(null);
  const onTagSelectRef = useRef(null);
  tagModeRef.current = tagMode;
  onTagClickRef.current = onTagClick;
  onTagSelectRef.current = onTagSelect;

  const pointersModeRef = useRef(false);
  const onPointerClickRef = useRef(null);
  const onPointerSelectRef = useRef(null);
  pointersModeRef.current = pointersMode;
  onPointerClickRef.current = onPointerClick;
  onPointerSelectRef.current = onPointerSelect;

  const onPointerDragStartRef = useRef(null);
  const onPointerDragMoveRef = useRef(null);
  const onPointerDragEndRef = useRef(null);
  onPointerDragStartRef.current = onPointerDragStart;
  onPointerDragMoveRef.current = onPointerDragMove;
  onPointerDragEndRef.current = onPointerDragEnd;

  // ─── 1. Setup Bubble Dome & Projective Material ───
  useEffect(() => {
    if (!sceneReady || !sceneRef.current || !rendererRef.current) return;

    const scene = sceneRef.current;
    const renderer = rendererRef.current;

    // Setup Projective Mesh Material (Equirectangular)
    const projMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(EquirectProjectiveShader.uniforms),
      vertexShader: EquirectProjectiveShader.vertexShader,
      fragmentShader: EquirectProjectiveShader.fragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
      depthTest: true,
      depthWrite: true
    });
    projectiveMatRef.current = projMat;

    // Unified Projective Background Sphere Material (shares uniforms with mesh for 100% ray lock)
    const bubbleProjMat = new THREE.ShaderMaterial({
      uniforms: projMat.uniforms,
      vertexShader: EquirectProjectiveShader.vertexShader,
      fragmentShader: EquirectProjectiveShader.fragmentShader,
      side: THREE.BackSide,
      transparent: false,
      depthTest: true,
      depthWrite: false
    });
    bubbleProjMatRef.current = bubbleProjMat;

    // Infinite Sky Dome Background Sphere (BackSide, 500m radius)
    const bubbleGeo = new THREE.SphereGeometry(500, 64, 64);
    const bubbleStaticMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(StaticCubemapShader.uniforms),
      vertexShader: StaticCubemapShader.vertexShader,
      fragmentShader: StaticCubemapShader.fragmentShader,
      side: THREE.BackSide,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });
    bubbleStaticMatRef.current = bubbleStaticMat;

    const dummyCube = new THREE.CubeTexture([
      document.createElement('canvas'), document.createElement('canvas'),
      document.createElement('canvas'), document.createElement('canvas'),
      document.createElement('canvas'), document.createElement('canvas')
    ]);
    dummyCube.needsUpdate = true;
    bubbleStaticMat.uniforms.uCubeMap.value = dummyCube;
    bubbleStaticMat.uniforms.uNextCubeMap.value = dummyCube;

    const magicBubble = new THREE.Mesh(bubbleGeo, bubbleStaticMat);
    magicBubble.renderOrder = -100;
    magicBubble.frustumCulled = false;
    magicBubble.visible = false;
    scene.add(magicBubble);
    bubbleRef.current = magicBubble;

    // Initialize TextureManager with renderer and tour storage paths
    textureManager.init(renderer);
    if (tourId) {
      textureManager.setBasePath(tourId);
    }

    return () => {
      if (magicBubble && scene) {
        scene.remove(magicBubble);
        magicBubble.geometry.dispose();
        magicBubble.material.dispose();
      }
    };
  }, [sceneReady, sceneRef, rendererRef, tourId]);

  // ─── 2. Fetch Inspection Data, Scans & 3D Building Mesh ───
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady || !tourId) return;

    let isSubscribed = true;

    const loadInspectionAssets = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch(`${API_URL}/inspections/${tourId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        if (!res.ok) {
          throw new Error(`Inspection fetch error: ${res.status}`);
        }

        const tour = await res.json();
        if (!isSubscribed) return;
        setTourDetails(tour);

        // Resolve URLs
        let glbUrl = tour.glbModelUrl;
        if (glbUrl && !glbUrl.startsWith('http')) {
          glbUrl = `${MINIO_URL}/virtual-inspections/${glbUrl}`;
        }

        // Adaptive Model LOD: On Tier 1 (budget mobile), check for decimated model_lod1.glb
        if (tierConfig?.preferredModel === 'model_lod1.glb' && glbUrl) {
          const lod1Candidate = glbUrl.replace(/model\.glb$/, 'model_lod1.glb');
          try {
            const headCheck = await fetch(lod1Candidate, { method: 'HEAD' });
            if (headCheck.ok) {
              glbUrl = lod1Candidate;
              console.log('[Tier 1] Adaptive Geometry: Serving decimated LOD1 mesh for 60 FPS mobile performance:', glbUrl);
            }
          } catch (_) { }
        }

        let scansUrl = tour.scansJsonUrl;
        if (scansUrl && !scansUrl.startsWith('http')) {
          scansUrl = `${MINIO_URL}/virtual-inspections/${scansUrl}`;
        }

        // Fetch Scan Metadata (try scan_metadata.json first, then scans.json)
        let loadedScans = null;
        try {
          const metaRes = await fetch(`${MINIO_URL}/virtual-inspections/inspections/${tourId}/scan_metadata.json`);
          if (metaRes.ok) {
            loadedScans = await metaRes.json();
          }
        } catch (e) {
          console.warn("Could not fetch scan_metadata.json:", e);
        }

        if (!loadedScans && scansUrl) {
          try {
            const scansRes = await fetch(scansUrl);
            if (scansRes.ok) {
              loadedScans = await scansRes.json();
            }
          } catch (e) {
            console.warn("Could not fetch scans JSON:", e.message);
          }
        }

        if (!loadedScans && tour.scans && tour.scans.length > 0) {
          loadedScans = tour.scans.map(s => ({
            '#name': s.id,
            x: s.posX,
            y: s.posY,
            alt: s.posZ,
            quaternion_wxyz: [s.quatW, s.quatX, s.quatY, s.quatZ]
          }));
        }

        if (!loadedScans) loadedScans = [];

        // Resilient check: If loadedScans positions are all zeroes, enrich from scans.json
        const allScansList = Array.isArray(loadedScans) ? loadedScans : Object.values(loadedScans);
        const hasPositions = allScansList.some(s => {
          const pos = Array.isArray(s.position) ? s.position : [s.x ?? 0, s.y ?? 0, s.alt ?? 0];
          return pos[0] !== 0 || pos[1] !== 0 || pos[2] !== 0;
        });

        if (!hasPositions && (tourId || scansUrl)) {
          try {
            const fallbackUrl = scansUrl || `${MINIO_URL}/virtual-inspections/inspections/${tourId}/scans.json`;
            const scansRes = await fetch(fallbackUrl);
            if (scansRes.ok) {
              const rawScans = await scansRes.json();
              if (Array.isArray(rawScans) && rawScans.length > 0) {
                const rawMap = new Map();
                rawScans.forEach(s => {
                  const k = s['#name'] || s.id;
                  if (k) rawMap.set(k, s);
                });

                if (Array.isArray(loadedScans)) {
                  loadedScans.forEach((s, idx) => {
                    const matched = rawMap.get(s['#name'] || s.id) || rawScans[idx];
                    if (matched) {
                      s.x = matched.x;
                      s.y = matched.y;
                      s.alt = matched.alt;
                      s.position = [matched.x, matched.y, matched.alt];
                      if (matched.rotation_quaternion) s.rotation_quaternion = matched.rotation_quaternion;
                    }
                  });
                } else if (typeof loadedScans === 'object') {
                  Object.entries(loadedScans).forEach(([k, s], idx) => {
                    const matched = rawMap.get(k) || rawMap.get(s['#name'] || s.id) || rawScans[idx];
                    if (matched) {
                      s.position = [matched.x, matched.y, matched.alt];
                      if (matched.rotation_quaternion) s.rotation_quaternion = matched.rotation_quaternion;
                    }
                  });
                }
              }
            }
          } catch (e) {
            console.warn("Could not fetch fallback scans.json:", e);
          }
        }

        // Map and pre-calculate inverse matrices for all scans
        const metadataMap = {};
        const scansArray = Array.isArray(loadedScans)
          ? loadedScans
          : Object.entries(loadedScans).map(([k, v]) => ({ '#name': k, ...v }));

        scansArray.forEach((scan, index) => {
          const scanKey = scan['#name'] || scan.id || `scan_${index}`;
          const cleanKey = String(scanKey).replace(/^scan_/, '');

          let posX = scan.x ?? scan.posX ?? scan.position?.[0] ?? 0;
          let posY = scan.y ?? scan.posY ?? scan.position?.[1] ?? 0;
          let posZ = scan.alt ?? scan.z ?? scan.posZ ?? scan.position?.[2] ?? 0;

          if (scan.position && typeof scan.position === 'object' && !Array.isArray(scan.position)) {
            posX = scan.position.x ?? posX;
            posY = scan.position.y ?? posY;
            posZ = scan.position.z ?? posZ;
          }

          let quat;
          if (scan.quaternion_xyzw && Array.isArray(scan.quaternion_xyzw) && scan.quaternion_xyzw.length === 4) {
            quat = new THREE.Quaternion(scan.quaternion_xyzw[0], scan.quaternion_xyzw[1], scan.quaternion_xyzw[2], scan.quaternion_xyzw[3]);
          } else if (scan.quaternion_wxyz && Array.isArray(scan.quaternion_wxyz) && scan.quaternion_wxyz.length === 4) {
            quat = new THREE.Quaternion(scan.quaternion_wxyz[1], scan.quaternion_wxyz[2], scan.quaternion_wxyz[3], scan.quaternion_wxyz[0]);
          } else if (scan.rotation_quaternion && Array.isArray(scan.rotation_quaternion) && scan.rotation_quaternion.length === 4) {
            // Raw Matterport rotation_quaternion in scans.json is [w, x, y, z]
            const rq = scan.rotation_quaternion;
            quat = new THREE.Quaternion(rq[1], rq[2], rq[3], rq[0]);
          } else {
            quat = new THREE.Quaternion(0, 0, 0, 1);
          }

          const rotMatrix = new THREE.Matrix4().makeRotationFromQuaternion(quat);
          const invRotMatrix = rotMatrix.clone().transpose();
          const invRot3x3 = new THREE.Matrix3().setFromMatrix4(invRotMatrix);

          const scanObj = {
            id: scanKey,
            index,
            positionVec: new THREE.Vector3(posX, posY, posZ),
            quaternion: quat,
            invRot3x3,
            raw: scan
          };

          metadataMap[scanKey] = scanObj;
          metadataMap[`scan_${cleanKey}`] = scanObj;
          metadataMap[cleanKey] = scanObj;
        });

        scansDataRef.current = metadataMap;
        setScansData(scansArray);

        // Load 3D GLB Model Mesh
        if (glbUrl) {
          const gltfLoader = new GLTFLoader();
          const dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
          gltfLoader.setDRACOLoader(dracoLoader);
          gltfLoader.setMeshoptDecoder(MeshoptDecoder);

          // Configure KTX2Loader for GLB models utilizing KHR_texture_basisu compressed textures
          if (textureManager.ktx2Loader) {
            gltfLoader.setKTX2Loader(textureManager.ktx2Loader);
          } else if (rendererRef.current) {
            const ktx2Loader = new KTX2Loader()
              .setTranscoderPath('/basis/')
              .detectSupport(rendererRef.current);
            gltfLoader.setKTX2Loader(ktx2Loader);
          }

          gltfLoader.load(glbUrl, (gltf) => {
            if (!isSubscribed) return;
            const model = gltf.scene;

            model.traverse((child) => {
              if (child.isMesh && child.material) {
                const oldMats = Array.isArray(child.material) ? child.material : [child.material];
                const newMats = oldMats.map(m => {
                  const basic = new THREE.MeshBasicMaterial({
                    map: m.map || null,
                    color: m.color || 0xffffff,
                    transparent: false,
                    side: THREE.DoubleSide
                  });
                  m.dispose();
                  return basic;
                });
                child.material = newMats.length === 1 ? newMats[0] : newMats;
                child.userData.originalMaterial = child.material;

                if (child.geometry) {
                  child.geometry.computeBoundingBox();
                  child.geometry.computeBoundingSphere();
                  const vertCount = child.geometry.attributes.position ? child.geometry.attributes.position.count : 0;
                  if (vertCount <= 800000 && typeof child.geometry.computeBoundsTree === 'function') {
                    try {
                      child.geometry.computeBoundsTree();
                      child.raycast = acceleratedRaycast;
                    } catch (_) {}
                  }
                }
              }
            });

            scene.add(model);
            modelRef.current = model;
            setIsModelLoaded(true);
            const extUsed = gltf.parser?.json?.extensionsUsed || [];
            console.log(`[GLTFLoader] 🚀 3D Digital Twin loaded successfully with hardware extensions:`, extUsed);

            // Initial Dollhouse Camera Framing (Z-up)
            const bbox = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);

            if (cameraRef.current && controlsRef.current) {
              cameraRef.current.up.set(0, 0, 1);
              cameraRef.current.position.set(
                center.x + maxDim * 0.9,
                center.y + maxDim * 0.9,
                center.z + maxDim * 0.8
              );
              controlsRef.current.target.copy(center);
              controlsRef.current.update();
            }

            // ─── Setup Scan Hotspots (Raycast onto Floor Meshes with BVH) ───
            if (scansArray.length > 0) {
              const floorMeshes = [];
              model.updateMatrixWorld(true);
              model.traverse((child) => {
                if (child.isMesh) {
                  floorMeshes.push(child);
                }
              });

              const raycaster = new THREE.Raycaster();
              const down = new THREE.Vector3(0, 0, -1);

              const ringPositions = scansArray.map((scan) => {
                const scanKey = scan['#name'] || scan.id;
                const sObj = metadataMap[scanKey];
                if (!sObj) return 0;
                const origin = sObj.positionVec.clone();
                raycaster.set(origin, down);
                const intersects = raycaster.intersectObjects(floorMeshes, false);
                let floorZ = origin.z - 1.6; // fallback if no floor hit
                if (intersects.length > 0) {
                  floorZ = intersects[0].point.z;
                }
                return floorZ;
              });

              const sphereGeo = new THREE.TorusGeometry(0.3, 0.05, 16, 32);
              const sphereMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.85,
                depthTest: true,
                depthWrite: false
              });

              const instMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, scansArray.length);
              instMesh.renderOrder = 999;

              const dummy = new THREE.Object3D();
              const tubeRadius = 0.05;
              const markerMetadata = [];

              scansArray.forEach((scan, index) => {
                const scanKey = scan['#name'] || scan.id || `scan_${index}`;
                const sObj = metadataMap[scanKey];
                const pos = sObj ? sObj.positionVec : new THREE.Vector3();
                const floorZ = ringPositions[index] + tubeRadius;

                dummy.position.set(pos.x, pos.y, floorZ);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                instMesh.setMatrixAt(index, dummy.matrix);

                markerMetadata.push({
                  id: scanKey,
                  instanceId: index,
                  realPosition: pos,
                  ringPosition: new THREE.Vector3(pos.x, pos.y, floorZ),
                  isVisible: true
                });
              });

              instMesh.instanceMatrix.needsUpdate = true;
              instMesh.computeBoundingSphere();
              instMesh.userData = { isScanRings: true, metadata: markerMetadata };
              scene.add(instMesh);
              scanSpheresRef.current = instMesh;
              setScanSpheres([instMesh]);
            }
          }, undefined, (err) => {
            console.error("GLB Model load error:", err);
            setIsModelLoaded(true);
          });
        } else {
          setIsModelLoaded(true);
        }

        // ─── Setup Site Inspection Tags ───
        if (tour.tags && tour.tags.length > 0 && !scene.getObjectByName('tagMarkers')) {
          const tagGroup = new THREE.Group();
          tagGroup.name = 'tagMarkers';
          tagGroup.renderOrder = 998;

          tour.tags.forEach((tag) => {
            const mat = createTagSpriteMaterial(tag.title, tag.icon, tag.color, false);
            mat.depthTest = false;
            const sprite = new THREE.Sprite(mat);
            sprite.position.set(tag.posX, tag.posY, tag.posZ);
            sprite.center.set(0.5, 0.0);
            const sizeMult = tag.size ?? 1.0;
            sprite.scale.set(0.4 * sizeMult, 0.6 * sizeMult, 1);
            sprite.renderOrder = 1000;
            sprite.userData.tagId = tag.id;
            sprite.userData.tagData = tag;
            tagGroup.add(sprite);
          });

          scene.add(tagGroup);
        }

        // ─── Setup Area Pointers (Safety / Machinery Zones) ───
        if (tour.areaPointers && tour.areaPointers.length > 0 && !scene.getObjectByName('areaPointers')) {
          const areaGroup = new THREE.Group();
          areaGroup.name = 'areaPointers';
          areaGroup.renderOrder = 997;

          tour.areaPointers.forEach(ap => {
            const ptr = createAreaPointerGroup(
              ap.name,
              ap.color || '#ff0000',
              ap.posX,
              ap.posY,
              ap.posZ,
              ap.height ?? 15.0,
              ap.thickness ?? 0.04,
              ap.labelSize ?? 1.0,
              ap.sizeX ?? 3.0,
              ap.sizeY ?? 3.0,
              ap.wallHeight ?? 3.0
            );
            ptr.userData = { pointerId: ap.id };
            areaGroup.add(ptr);
          });

          scene.add(areaGroup);
        }

        setIsDataLoaded(true);

      } catch (err) {
        console.error("IndustrialTourViewer Init error:", err);
        setIsDataLoaded(true);
      }
    };

    loadInspectionAssets();

    return () => {
      isSubscribed = false;
    };
  }, [sceneReady, sceneRef, tourId]);

  // ─── 3. Cone-of-Vision Directional Predictive Preload ───
  const preloadNearestScans = useCallback(async (currentScanId) => {
    try {
      const meta = scansDataRef.current;
      const currentScan = meta[currentScanId];
      if (!currentScan) return;

      const currentPos = currentScan.positionVec;
      const scoredScans = [];

      // Determine camera look vector in world space
      const lookDir = new THREE.Vector3();
      if (cameraRef.current) {
        cameraRef.current.getWorldDirection(lookDir);
      }

      for (const scanId in meta) {
        if (scanId === currentScanId) continue;
        const scan = meta[scanId];
        const dist = currentPos.distanceTo(scan.positionVec);

        // Vector from current station to target station
        const toStation = scan.positionVec.clone().sub(currentPos).normalize();

        // Alignment: 1.0 = directly in gaze center, 0.0 = 90° peripheral, -1.0 = behind back
        const alignment = lookDir.lengthSq() > 0 ? lookDir.dot(toStation) : 0;

        // Directional weight: scans inside user's cone of vision get heavy priority boost
        // Stations in front (alignment > 0) get reduced effective score (higher priority)
        const directionalWeight = alignment > 0 ? (1.0 - alignment * 0.65) : (1.0 - alignment * 1.5);
        const priorityScore = dist * directionalWeight;

        scoredScans.push({
          id: scanId.replace('scan_', ''),
          dist,
          alignment,
          priorityScore
        });
      }

      // Sort by priorityScore (lowest score = highest preloading priority)
      scoredScans.sort((a, b) => a.priorityScore - b.priorityScore);
      const prioritizedScanIds = scoredScans.slice(0, 5).map(item => item.id);

      textureManager.preloadBase(prioritizedScanIds);
    } catch (e) {
      console.warn("Failed to preload nearest scans:", e);
    }
  }, []);

  // Debounced listener: when user pans camera inside station, dynamically preload facing stations
  useEffect(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    let debounceTimer = null;

    const onControlsChange = () => {
      if (viewerState === 'INSIDE' && activeScanIdRef.current) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          preloadNearestScans(activeScanIdRef.current);
        }, 350);
      }
    };

    controls.addEventListener('change', onControlsChange);
    return () => {
      clearTimeout(debounceTimer);
      controls.removeEventListener('change', onControlsChange);
    };
  }, [viewerState, preloadNearestScans]);

  // ─── 4. Projective Mesh Transition Engine ───
  const triggerTransition = useCallback(async (targetScanId) => {
    const targetScan = scansDataRef.current[targetScanId];
    if (!targetScan || !cameraRef.current) return;

    setViewerState('TRANSITION');
    document.body.style.cursor = 'wait';

    // Trigger mobile haptic micro-pulse
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15); } catch (_) { }
    }

    if (scanSpheresRef.current) {
      scanSpheresRef.current.visible = false;
    }

    try {
      const nextScanIdNum = targetScanId.replace('scan_', '');

      // Load Equirectangular texture (Adaptive 2K on Tier 1&2 for 60 FPS flight, 4K on Tier 3)
      const flightTier = tierConfig?.flightEquirectTier || 'auto';
      const nextEquirect = await textureManager.loadEquirect(nextScanIdNum, flightTier);

      // Load best available KTX2 (instant cached 1024, or stream 1024 with 256 fallback)
      let nextCubeMap;
      try {
        nextCubeMap = await textureManager.loadBestKTX2(nextScanIdNum);
      } catch (e) {
        console.warn(`[KTX2] Fallback to cubemap for scan_${nextScanIdNum}:`, e);
        try {
          nextCubeMap = await textureManager.loadCubeMap(nextScanIdNum);
        } catch (e2) {
          nextCubeMap = dummyTex;
        }
      }

      const isFirstClick = activeScanIdRef.current === null;
      let currentEquirect = null;
      let currentScan = null;
      let currentScanIdNum = null;
      let currentScanPos = cameraRef.current.position.clone();
      let currentInvRot = new THREE.Matrix3().identity();

      if (!isFirstClick && activeScanIdRef.current) {
        currentScanIdNum = activeScanIdRef.current.replace('scan_', '');
        currentScan = scansDataRef.current[activeScanIdRef.current];
        currentEquirect = await textureManager.loadEquirect(currentScanIdNum, flightTier);
        if (currentScan) {
          currentScanPos = currentScan.positionVec;
          currentInvRot = currentScan.invRot3x3;
        }
      }

      const projMat = projectiveMatRef.current;
      const nextRot3x3 = new THREE.Matrix3().setFromMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(targetScan.quaternion)
      );

      projMat.uniforms.uNextEquirect.value = nextEquirect;
      projMat.uniforms.uNextScanPos.value.copy(targetScan.positionVec);
      projMat.uniforms.uNextInvRot.value.copy(targetScan.invRot3x3);
      if (projMat.uniforms.uNextRot) projMat.uniforms.uNextRot.value.copy(nextRot3x3);

      const relRot3x3 = new THREE.Matrix3().identity();
      let currentCubeMap = nextCubeMap;

      if (!isFirstClick && currentEquirect && currentScan) {
        const currRot3x3 = new THREE.Matrix3().setFromMatrix4(
          new THREE.Matrix4().makeRotationFromQuaternion(currentScan.quaternion)
        );
        projMat.uniforms.uCurrentEquirect.value = currentEquirect;
        projMat.uniforms.uCurrentScanPos.value.copy(currentScanPos);
        projMat.uniforms.uCurrentInvRot.value.copy(currentInvRot);
        if (projMat.uniforms.uCurrentRot) projMat.uniforms.uCurrentRot.value.copy(currRot3x3);
        projMat.uniforms.uTransitionProgress.value = 0.0;

        // Calculate Relative Rotation (R_A^-1 * R_B)
        const rotB_4 = new THREE.Matrix4().makeRotationFromQuaternion(targetScan.quaternion);
        const invRotA_4 = new THREE.Matrix4().makeRotationFromQuaternion(currentScan.quaternion).transpose();
        const relRot_4 = invRotA_4.multiply(rotB_4);
        relRot3x3.setFromMatrix4(relRot_4);

        const activeCachedTex = currentScanIdNum ? textureManager.getTextureCacheObj(currentScanIdNum) : null;
        currentCubeMap = activeCachedTex?.['1024'] || activeCachedTex?.['512'] || activeCachedTex?.['256'] || bubbleRef.current?.material?.uniforms?.uCubeMap?.value || nextCubeMap;
      } else {
        projMat.uniforms.uCurrentEquirect.value = nextEquirect;
        projMat.uniforms.uCurrentScanPos.value.copy(targetScan.positionVec);
        projMat.uniforms.uCurrentInvRot.value.copy(targetScan.invRot3x3);
        if (projMat.uniforms.uCurrentRot) projMat.uniforms.uCurrentRot.value.copy(nextRot3x3);
        projMat.uniforms.uTransitionProgress.value = 1.0;
      }

      projMat.uniforms.uOpacity.value = isFirstClick ? 0.0 : 1.0;

      // Assign Projective Shader to Foreground Model Mesh
      if (modelRef.current) {
        modelRef.current.visible = true;
        modelRef.current.traverse((child) => {
          if (child.isMesh) {
            child.material = projMat;
          }
        });
      }

      // Configure Background Dome with Shared Projective Shader (100% ray lock with 3D mesh)
      if (bubbleRef.current && bubbleProjMatRef.current) {
        bubbleRef.current.material = bubbleProjMatRef.current;
        bubbleRef.current.position.set(0, 0, 0);
        bubbleRef.current.quaternion.identity();
        bubbleRef.current.visible = true;
      }

      const forward = new THREE.Vector3();
      if (isFirstClick) {
        forward.set(0, 1, 0).applyQuaternion(targetScan.quaternion);
      } else {
        cameraRef.current.getWorldDirection(forward);
      }
      const targetLookAt = targetScan.positionVec.clone().add(forward.multiplyScalar(0.1));
      const startPos = cameraRef.current.position.clone();
      const totalDistance = startPos.distanceTo(targetScan.positionVec);

      document.body.style.cursor = 'default';

      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }

      // Dynamic Resolution Scaling (DRS): temporarily reduce fill rate during rapid camera translation
      if (tierConfig?.useDrs && setDynamicDpr) {
        setDynamicDpr(tierConfig.drsFlightFactor);
      }

      // Cinematic FOV "Breathing" Warp: 75° -> 83° -> 75°
      if (cameraRef.current) {
        const baseFov = 75;
        const peakFov = 83;
        gsap.to(cameraRef.current, {
          fov: peakFov,
          duration: 0.5,
          ease: 'power2.out',
          onUpdate: () => cameraRef.current?.updateProjectionMatrix(),
          onComplete: () => {
            if (cameraRef.current) {
              gsap.to(cameraRef.current, {
                fov: baseFov,
                duration: 0.6,
                ease: 'power2.inOut',
                onUpdate: () => cameraRef.current?.updateProjectionMatrix()
              });
            }
          }
        });
      }

      // Execute Camera Flight Tween
      gsap.to(cameraRef.current.position, {
        x: targetScan.positionVec.x,
        y: targetScan.positionVec.y,
        z: targetScan.positionVec.z,
        duration: 1.1,
        ease: 'power3.inOut',
        onUpdate: function () {
          if (!isFirstClick && totalDistance > 0) {
            const dist = cameraRef.current.position.distanceTo(startPos);
            const prog = Math.min(dist / totalDistance, 1.0);
            projMat.uniforms.uTransitionProgress.value = prog;
          }
          if (isFirstClick) {
            const prog = this.progress();
            projMat.uniforms.uOpacity.value = prog;
          }
        }
      });

      gsap.to(controlsRef.current.target, {
        x: targetLookAt.x,
        y: targetLookAt.y,
        z: targetLookAt.z,
        duration: 1.1,
        ease: 'power3.inOut',
        onComplete: () => {
          const previousScanId = activeScanIdRef.current;
          activeScanIdRef.current = targetScanId;

          // Garbage collect heavy textures of previous scan
          if (previousScanId && previousScanId !== targetScanId) {
            textureManager.disposeScanTextures(previousScanId.replace('scan_', ''), true);
          }

          if (bubbleRef.current && bubbleStaticMatRef.current) {
            bubbleRef.current.material = bubbleStaticMatRef.current;
            bubbleRef.current.quaternion.copy(targetScan.quaternion);
            bubbleRef.current.position.copy(targetScan.positionVec);
            bubbleRef.current.material.uniforms.uCubeMap.value = nextCubeMap;
            bubbleRef.current.material.uniforms.uNextCubeMap.value = nextCubeMap;
            bubbleRef.current.material.uniforms.uTransitionProgress.value = 1.0;
            bubbleRef.current.material.uniforms.uOpacity.value = 1.0;
            bubbleRef.current.visible = true;

            // Upgrade to 1024px KTX2 in background for crisp HD look-around
            textureManager.loadKTX2(nextScanIdNum, '1024').then((hdTex) => {
              if (activeScanIdRef.current === targetScanId && bubbleRef.current?.material?.uniforms) {
                bubbleRef.current.material.uniforms.uCubeMap.value = hdTex;
                bubbleRef.current.material.uniforms.uNextCubeMap.value = hdTex;
              }
            }).catch(() => { });
          }

          // Restore model mesh original material and hide inside scan
          if (modelRef.current) {
            modelRef.current.traverse((child) => {
              if (child.isMesh && child.userData.originalMaterial) {
                child.material = child.userData.originalMaterial;
              }
            });
            modelRef.current.visible = false;
          }

          // Configure controls for interior look around
          if (controlsRef.current) {
            controlsRef.current.enabled = true;
            controlsRef.current.minDistance = 0;
            controlsRef.current.maxDistance = 0.2;
            controlsRef.current.enableZoom = false;
            controlsRef.current.target.copy(targetLookAt);
          }

          keyboardEnabledRef.current = false;
          setViewerState('INSIDE');
          setIsInscan(true);
          setIsMeshView(false);

          // Restore full pixel ratio upon landing at destination station
          if (tierConfig?.useDrs && setDynamicDpr) {
            setDynamicDpr(1.0);
          }

          if (scanSpheresRef.current) {
            scanSpheresRef.current.visible = true;
          }

          // Ensure full 1024 resolution is active on arrival
          textureManager.loadKTX2(nextScanIdNum, '1024').then((tex1024) => {
            if (activeScanIdRef.current === targetScanId && bubbleRef.current?.material?.uniforms) {
              bubbleRef.current.material.uniforms.uCubeMap.value = tex1024;
              bubbleRef.current.material.uniforms.uNextCubeMap.value = tex1024;
            }
          }).catch(() => { });

          // Preload nearest 5 scan bases in background
          preloadNearestScans(targetScanId);
        }
      });

    } catch (err) {
      console.error("Transition failed:", err);
      if (setDynamicDpr) setDynamicDpr(1.0);
      document.body.style.cursor = 'default';
      setViewerState('DOLLHOUSE');
      if (scanSpheresRef.current) {
        scanSpheresRef.current.visible = true;
      }
    }
  }, [cameraRef, controlsRef, dummyTex, keyboardEnabledRef, preloadNearestScans, tierConfig, setDynamicDpr]);

  // ─── 5. Hotspot Distance Culling & Visibility Update Loop ───
  useEffect(() => {
    if (!isDataLoaded || !scanSpheresRef.current || !cameraRef.current) return;
    const instancedMesh = scanSpheresRef.current;
    if (!instancedMesh || !instancedMesh.isInstancedMesh) return;

    let rafId;
    const dummy = new THREE.Object3D();

    const updateVisibility = () => {
      rafId = requestAnimationFrame(updateVisibility);
      const cameraPos = cameraRef.current.position;
      let needsUpdate = false;
      const showAll = viewerState === 'DOLLHOUSE' || isMeshView;
      const threshold = 18.0;

      if (instancedMesh.userData.metadata) {
        instancedMesh.userData.metadata.forEach((data) => {
          const isCurrentActive = data.id === activeScanIdRef.current && viewerState === 'INSIDE';
          let shouldBeVisible = !isCurrentActive;

          if (!showAll && shouldBeVisible) {
            const dist = cameraPos.distanceTo(data.realPosition);
            shouldBeVisible = dist < threshold;
          }

          if (data.isVisible !== shouldBeVisible) {
            data.isVisible = shouldBeVisible;
            dummy.position.copy(data.ringPosition || data.realPosition);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.setScalar(shouldBeVisible ? 1 : 0);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(data.instanceId, dummy.matrix);
            needsUpdate = true;
          }
        });
      }

      if (needsUpdate) {
        instancedMesh.instanceMatrix.needsUpdate = true;
      }
    };

    updateVisibility();
    return () => cancelAnimationFrame(rafId);
  }, [isDataLoaded, cameraRef, viewerState, isMeshView]);

  // ─── 6. Keyboard Directional Walk Navigation (53° Forward Cone) ───
  useEffect(() => {
    const onKeyDown = (e) => {
      if (viewerState !== 'INSIDE' || !activeScanIdRef.current || !cameraRef.current) return;
      const keys = ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'];
      if (!keys.includes(e.code)) return;

      const forward = new THREE.Vector3();
      cameraRef.current.getWorldDirection(forward);
      forward.z = 0; // Horizontal ground plane in Z-up
      forward.normalize();

      const moveDir = new THREE.Vector3();
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        moveDir.copy(forward);
      } else {
        moveDir.copy(forward).negate();
      }

      const currentScan = scansDataRef.current[activeScanIdRef.current];
      if (!currentScan) return;
      const currentPos = currentScan.positionVec;

      let bestMatch = null;
      let bestScore = -Infinity;

      Object.keys(scansDataRef.current).forEach(id => {
        if (id === activeScanIdRef.current) return;
        const scan = scansDataRef.current[id];
        const dirToScan = new THREE.Vector3().subVectors(scan.positionVec, currentPos);
        dirToScan.z = 0; // Ground plane in Z-up
        const dist = dirToScan.length();

        // Target scans within 15 meters
        if (dist < 0.1 || dist > 15.0) return;

        dirToScan.normalize();
        const dot = moveDir.dot(dirToScan);

        // ~53 degree tolerance forward cone
        if (dot > 0.6) {
          const score = dot - (dist * 0.12);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = id;
          }
        }
      });

      if (bestMatch) {
        triggerTransition(bestMatch);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerState, triggerTransition, cameraRef]);

  // ─── 7. Click Handlers & Raycasting (Hotspots, Tags, Tools) ───
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera || !isDataLoaded) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const pointerDownPosRef = { current: { x: 0, y: 0 } };
    const wasDraggingRef = { current: false };

    const onDown = (e) => {
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
      if (onPointerDragStartRef.current) {
        const started = onPointerDragStartRef.current(e);
        if (started) {
          wasDraggingRef.current = true;
          e.stopPropagation();
        }
      }
    };

    const onMove = (e) => {
      if (wasDraggingRef.current && onPointerDragMoveRef.current) {
        onPointerDragMoveRef.current(e);
      }
    };

    const onUp = (e) => {
      if (wasDraggingRef.current && onPointerDragEndRef.current) {
        onPointerDragEndRef.current(e);
      }
    };

    const onClick = (e) => {
      if (wasDraggingRef.current) {
        wasDraggingRef.current = false;
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Staging click handling
      if (stagingMode && staging.handleCanvasClick) {
        const handled = staging.handleCanvasClick(e);
        if (handled) return;
      }

      // 1. Measurement Mode Click
      if (measurementModeRef.current && onMeasurementClickRef.current) {
        onMeasurementClickRef.current(e);
        return;
      }

      // 2. Tag Mode Click (Create Tag)
      if (tagModeRef.current && onTagClickRef.current) {
        onTagClickRef.current(e);
        return;
      }

      // 3. Area Pointer Click
      if (pointersModeRef.current && onPointerClickRef.current) {
        onPointerClickRef.current(e);
        return;
      }

      // 4. Tag Marker Selection (when not placing tags)
      if (!tagModeRef.current && onTagSelectRef.current) {
        const handled = onTagSelectRef.current(e);
        if (handled) return;
      }

      // 5. Area Pointer Selection (when not placing pointers)
      if (!pointersModeRef.current && onPointerSelectRef.current) {
        const handled = onPointerSelectRef.current(e);
        if (handled) return;
      }

      // 6. Scan Marker Teleport Click
      if (scanSpheresRef.current) {
        const intersects = raycaster.intersectObject(scanSpheresRef.current);
        if (intersects.length > 0) {
          const instanceId = intersects[0].instanceId;
          const targetMeta = scanSpheresRef.current.userData.metadata?.[instanceId];
          if (targetMeta && targetMeta.id !== activeScanIdRef.current) {
            triggerTransition(targetMeta.id);
          }
        }
      }
    };

    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);

    return () => {
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
    };
  }, [isDataLoaded, rendererRef, cameraRef, sceneRef, triggerTransition]);

  // ─── 8. View Control Actions ───
  const handleDollhouseView = () => {
    if (!modelRef.current || !cameraRef.current || !controlsRef.current) return;

    if (bubbleRef.current) bubbleRef.current.visible = false;
    if (modelRef.current) {
      modelRef.current.visible = true;
      modelRef.current.traverse((child) => {
        if (child.isMesh && child.userData.originalMaterial) {
          child.material = child.userData.originalMaterial;
        }
      });
    }

    const bbox = new THREE.Box3().setFromObject(modelRef.current);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    controlsRef.current.enabled = true;
    controlsRef.current.minDistance = 0.5;
    controlsRef.current.maxDistance = 500;
    controlsRef.current.enableZoom = true;
    cameraRef.current.up.set(0, 0, 1);

    gsap.to(cameraRef.current.position, {
      x: center.x + maxDim * 0.9,
      y: center.y + maxDim * 0.9,
      z: center.z + maxDim * 0.8,
      duration: 1.2,
      ease: 'power3.inOut',
      onUpdate: () => controlsRef.current.update()
    });

    gsap.to(controlsRef.current.target, {
      x: center.x,
      y: center.y,
      z: center.z,
      duration: 1.2,
      ease: 'power3.inOut',
      onUpdate: () => controlsRef.current.update()
    });

    keyboardEnabledRef.current = true;
    setViewerState('DOLLHOUSE');
    setIsInscan(false);
  };

  const handleFloorPlanView = () => {
    if (!modelRef.current || !cameraRef.current || !controlsRef.current) return;

    if (bubbleRef.current) bubbleRef.current.visible = false;
    if (modelRef.current) {
      modelRef.current.visible = true;
      modelRef.current.traverse((child) => {
        if (child.isMesh && child.userData.originalMaterial) {
          child.material = child.userData.originalMaterial;
        }
      });
    }

    const bbox = new THREE.Box3().setFromObject(modelRef.current);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y);

    controlsRef.current.enabled = true;
    controlsRef.current.minDistance = 0.5;
    controlsRef.current.maxDistance = 500;
    controlsRef.current.enableZoom = true;

    gsap.to(cameraRef.current.position, {
      x: center.x + 0.01,
      y: center.y + 0.01,
      z: bbox.max.z + maxDim * 1.2,
      duration: 1.2,
      ease: 'power3.inOut',
      onUpdate: () => controlsRef.current.update()
    });

    gsap.to(controlsRef.current.target, {
      x: center.x,
      y: center.y,
      z: center.z,
      duration: 1.2,
      ease: 'power3.inOut',
      onUpdate: () => controlsRef.current.update()
    });

    keyboardEnabledRef.current = false;
    setViewerState('DOLLHOUSE');
    setIsInscan(false);
  };

  const handleToggleMeshView = () => {
    if (!modelRef.current) return;
    const nextMesh = !isMeshView;
    setIsMeshView(nextMesh);

    if (nextMesh) {
      modelRef.current.visible = true;
      if (bubbleRef.current) bubbleRef.current.visible = false;
    } else {
      modelRef.current.visible = false;
      if (bubbleRef.current && viewerState === 'INSIDE') bubbleRef.current.visible = true;
    }
  };

  // ─── 9. Mobile Gyroscope 360° Motion Look-Around ───
  const [isGyroActive, setIsGyroActive] = useState(false);

  const toggleGyroscope = useCallback(async () => {
    if (isGyroActive) {
      setIsGyroActive(false);
      if (controlsRef.current) {
        controlsRef.current.enableRotate = true;
      }
      return false;
    }

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      } catch (_) {
        return false;
      }
    }

    setIsGyroActive(true);
    if (controlsRef.current) {
      controlsRef.current.enableRotate = false;
    }
    return true;
  }, [isGyroActive]);

  useEffect(() => {
    if (viewerState !== 'INSIDE' && isGyroActive) {
      setIsGyroActive(false);
      if (controlsRef.current) {
        controlsRef.current.enableRotate = true;
      }
    }
  }, [viewerState, isGyroActive]);

  useEffect(() => {
    if (!isGyroActive) return;

    const euler = new THREE.Euler();
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X
    const zee = new THREE.Vector3(0, 0, 1);

    const onOrientation = (event) => {
      if (!cameraRef.current || !controlsRef.current || !activeScanIdRef.current) return;
      if (event.alpha === null || event.beta === null || event.gamma === null) return;

      const alpha = THREE.MathUtils.degToRad(event.alpha);
      const beta = THREE.MathUtils.degToRad(event.beta);
      const gamma = THREE.MathUtils.degToRad(event.gamma);
      const orient = window.orientation ? THREE.MathUtils.degToRad(window.orientation) : 0;

      euler.set(beta, alpha, -gamma, 'YXZ');
      q0.setFromEuler(euler);
      q0.multiply(q1);
      q0.multiply(new THREE.Quaternion().setFromAxisAngle(zee, -orient));

      const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(q0);
      const camPos = cameraRef.current.position;
      controlsRef.current.target.set(
        camPos.x + forward.x * 0.1,
        camPos.y + forward.y * 0.1,
        camPos.z + forward.z * 0.1
      );
      controlsRef.current.update();
    };

    window.addEventListener('deviceorientation', onOrientation, true);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
    };
  }, [isGyroActive]);

  // Expose methods & internals to parent
  useImperativeHandle(ref, () => ({
    sceneRef,
    cameraRef,
    rendererRef,
    modelRef,
    controlsRef,
    scansData,
    scanSpheres,
    staging,
    tourDetails,
    viewerState,
    triggerTransition,
    handleDollhouseView,
    handleFloorPlanView,
    handleToggleMeshView,
    toggleGyroscope,
    isGyroActive,
    activeScanId: activeScanIdRef.current,
  }), [sceneRef, cameraRef, rendererRef, modelRef, controlsRef, scansData, scanSpheres, staging, tourDetails, viewerState, triggerTransition, toggleGyroscope, isGyroActive]);

  return (
    <div
      className="viewer-viewport-relative"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        touchAction: 'none',
        overscrollBehavior: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100%',
          touchAction: 'none',
          overscrollBehavior: 'none'
        }}
      />

      {/* Floating View State Overlay & Tag Info Popup */}
      {activeTagInfo && (
        <div
          className="tag-info-popup"
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '24px',
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '16px 20px',
            color: '#fff',
            zIndex: 50,
            maxWidth: '360px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: activeTagInfo.color || '#00e5ff' }}>
              {activeTagInfo.title}
            </h4>
            <button
              onClick={() => setActiveTagInfo(null)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
            >
              ×
            </button>
          </div>
          {activeTagInfo.description && (
            <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4' }}>
              {activeTagInfo.description}
            </p>
          )}
          {activeTagInfo.documents && activeTagInfo.documents.length > 0 && (
            <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Attached Documents:
              </span>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px', fontSize: '0.8rem' }}>
                {activeTagInfo.documents.map(doc => (
                  <li key={doc.id}>
                    <a
                      href={`${MINIO_URL}/virtual-inspections/${doc.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#38bdf8', textDecoration: 'underline' }}
                    >
                      {doc.title || 'Document'}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Staging Transform Toolbar */}
      {stagingMode && staging?.selectedItemId && (
        <div style={{
          position: 'absolute',
          bottom: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1500,
          background: 'rgba(13, 14, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          fontFamily: 'Inter, -apple-system, sans-serif'
        }}>
          {/* Transform Modes */}
          <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '8px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); staging.setTransformMode('translate'); }}
              style={{
                background: staging.transformMode === 'translate' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                color: staging.transformMode === 'translate' ? '#00e5ff' : 'rgba(255,255,255,0.7)',
                border: staging.transformMode === 'translate' ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid transparent',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3-3M2 12h20M12 2v20"/></svg>
              Move
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); staging.setTransformMode('rotate'); }}
              style={{
                background: staging.transformMode === 'rotate' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                color: staging.transformMode === 'rotate' ? '#00e5ff' : 'rgba(255,255,255,0.7)',
                border: staging.transformMode === 'rotate' ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid transparent',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Rotate
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); staging.setTransformMode('scale'); }}
              style={{
                background: staging.transformMode === 'scale' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                color: staging.transformMode === 'scale' ? '#00e5ff' : 'rgba(255,255,255,0.7)',
                border: staging.transformMode === 'scale' ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid transparent',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 3l-6 6M21 3v6M21 3h-6M3 21l6-6M3 21v-6M3 21h6M15 15l6 6M9 9L3 3"/></svg>
              Scale
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); staging.setUniformScale(!staging.uniformScale); }}
              style={{
                background: staging.uniformScale ? 'rgba(255, 204, 0, 0.15)' : 'transparent',
                color: staging.uniformScale ? '#ffcc00' : 'rgba(255,255,255,0.7)',
                border: staging.uniformScale ? '1px solid rgba(255, 204, 0, 0.3)' : '1px solid transparent',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.2s',
                display: staging.transformMode === 'scale' ? 'flex' : 'none',
                alignItems: 'center',
                gap: '6px',
                marginLeft: '4px'
              }}
              title="Toggle Uniform Scale"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="12" cy="12" r="3"/></svg>
              Uniform
            </button>
          </div>

          {/* Dimensions Display */}
          {staging.transformMode === 'scale' && staging.selectedDimensions && (
            <div style={{
              display: 'flex', gap: '12px', paddingLeft: '8px', paddingRight: '8px', borderRight: '1px solid rgba(255,255,255,0.1)',
              fontSize: '11px', color: 'rgba(255,255,255,0.8)', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '40px' }}>
                <span style={{ color: '#ff4444', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Width</span>
                <span id="staging-dim-width" style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '12px', color: '#fff' }}>{staging.selectedDimensions[0].toFixed(2)}m</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '40px' }}>
                <span style={{ color: '#44ff44', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Height</span>
                <span id="staging-dim-height" style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '12px', color: '#fff' }}>{staging.selectedDimensions[1].toFixed(2)}m</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '40px' }}>
                <span style={{ color: '#4444ff', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Depth</span>
                <span id="staging-dim-depth" style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '12px', color: '#fff' }}>{staging.selectedDimensions[2].toFixed(2)}m</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '4px', paddingLeft: '4px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); staging.duplicateSelected(); }}
              title="Duplicate (Ctrl+D)"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.8)',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); staging.deleteSelected(); }}
              title="Delete (Del/Backspace)"
              style={{
                background: 'rgba(255, 50, 50, 0.1)',
                border: '1px solid rgba(255, 50, 50, 0.2)',
                color: '#ff4444',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 50, 50, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 50, 50, 0.1)'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating 360° Mobile Gyroscope Button */}
      {viewerState === 'INSIDE' && (
        <button
          onClick={toggleGyroscope}
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            background: isGyroActive ? 'rgba(14, 165, 233, 0.95)' : 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: '#fff',
            border: isGyroActive ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50px',
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            zIndex: 45,
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
            transition: 'all 0.2s ease'
          }}
          title="Toggle 360° Gyroscope Motion Controls"
        >
          <Compass
            style={{
              width: 16,
              height: 16,
              color: isGyroActive ? '#fff' : '#38bdf8',
              transform: isGyroActive ? 'rotate(45deg)' : 'none',
              transition: 'transform 0.3s'
            }}
          />
          <span>{isGyroActive ? 'Gyro Active' : '360° Motion'}</span>
        </button>
      )}

      {/* Floating Hardware Tier & Diagnostic Badge */}
      {isMounted && tierConfig && (
        <div style={{ position: 'absolute', bottom: '24px', left: '24px', zIndex: 50 }}>
          <button
            onClick={() => setShowTierModal(!showTierModal)}
            style={{
              background: tierConfig.tier === 3 ? 'rgba(16, 185, 129, 0.25)' : tierConfig.tier === 2 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(245, 158, 11, 0.25)',
              border: `1px solid ${tierConfig.tier === 3 ? '#10b981' : tierConfig.tier === 2 ? '#38bdf8' : '#f59e0b'}`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              color: '#fff',
              borderRadius: '50px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              transition: 'all 0.2s'
            }}
            title="Click to view hardware tier & diagnostic stats"
          >
            <span style={{ fontSize: '13px' }}>⚡</span>
            <span>Tier {tierConfig.tier}: {tierConfig.tier === 1 ? 'Budget Mobile' : tierConfig.tier === 2 ? 'Balanced' : 'Ultra PC'}</span>
          </button>

          {showTierModal && (
            <div
              style={{
                position: 'absolute',
                bottom: '48px',
                left: '0',
                width: '280px',
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '12px',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                padding: '14px',
                color: '#e2e8f0',
                fontSize: '11px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                zIndex: 60
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '12px' }}>Device Hardware Profile</span>
                <button onClick={() => setShowTierModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                <div><strong style={{ color: '#94a3b8' }}>Tier:</strong> <span style={{ color: '#fff', fontWeight: 600 }}>{tierConfig.tier}</span></div>
                <div><strong style={{ color: '#94a3b8' }}>DPR:</strong> <span style={{ color: '#fff' }}>{tierConfig.maxDpr}x</span></div>
                <div><strong style={{ color: '#94a3b8' }}>Flight Texture:</strong> <span style={{ color: '#fff' }}>{tierConfig.flightEquirectTier.toUpperCase()}</span></div>
                <div><strong style={{ color: '#94a3b8' }}>Model:</strong> <span style={{ color: '#fff' }}>{tierConfig.preferredModel.replace('.glb', '')}</span></div>
                <div style={{ gridColumn: 'span 2' }}><strong style={{ color: '#94a3b8' }}>Depth:</strong> <span style={{ color: '#fff' }}>{tierConfig.useLogDepth ? 'Logarithmic' : 'Linear (Early-Z ON)'}</span></div>
                <div style={{ gridColumn: 'span 2' }}><strong style={{ color: '#94a3b8' }}>Device:</strong> <span style={{ color: '#94a3b8', fontSize: '10px' }}>{tierConfig.label}</span></div>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ color: '#94a3b8', marginBottom: '6px' }}>Force Tier Override:</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[1, 2, 3].map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        localStorage.setItem('viewer_quality_override', `tier${t}`);
                        window.location.reload();
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        borderRadius: '6px',
                        border: tierConfig.tier === t ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                        background: tierConfig.tier === t ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      Tier {t}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      localStorage.removeItem('viewer_quality_override');
                      window.location.reload();
                    }}
                    style={{
                      padding: '4px 6px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '10px'
                    }}
                    title="Reset to Auto"
                  >
                    Auto
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

IndustrialTourViewer.displayName = 'IndustrialTourViewer';
export default IndustrialTourViewer;
