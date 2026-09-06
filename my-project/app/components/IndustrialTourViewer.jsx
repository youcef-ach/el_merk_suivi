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
import { createTagSpriteMaterial, TAG_BASE_SCALE_X, TAG_BASE_SCALE_Y } from '../hooks/useTags';
import { EquirectProjectiveShader } from '../shaders/EquirectProjectiveShader';
import { StaticCubemapShader } from '../shaders/StaticCubemapShader';
import { createMatterportRingMaterial } from '../shaders/MatterportRingShader';
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
  onSelectMeasurement,
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
    tierConfig
  } = useThreeScene([dummyTex], true);

  // Click Feedback Ripple Mesh Ref
  const rippleMeshRef = useRef(null);

  const createClickRipple = useCallback((hitPoint) => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!rippleMeshRef.current) {
      const geo = new THREE.RingGeometry(0.1, 0.22, 36);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 1002;
      scene.add(mesh);
      rippleMeshRef.current = mesh;
    }

    const ripple = rippleMeshRef.current;
    ripple.position.set(hitPoint.x, hitPoint.y, hitPoint.z + 0.025);
    ripple.rotation.set(0, 0, 0); // Flat on XY floor plane facing +Z
    ripple.scale.set(0.6, 0.6, 0.6);
    ripple.material.opacity = 0.95;
    ripple.visible = true;

    gsap.killTweensOf(ripple.scale);
    gsap.killTweensOf(ripple.material);

    gsap.to(ripple.scale, {
      x: 3.5,
      y: 3.5,
      z: 3.5,
      duration: 0.52,
      ease: 'power2.out',
    });

    gsap.to(ripple.material, {
      opacity: 0.0,
      duration: 0.52,
      ease: 'power2.out',
      onComplete: () => {
        ripple.visible = false;
      },
    });
  }, [sceneRef]);

  // Viewer State: 'DOLLHOUSE' | 'TRANSITION' | 'INSIDE'
  const [viewerState, _setViewerState] = useState('DOLLHOUSE');
  const viewerStateRef = useRef('DOLLHOUSE');
  const setViewerState = useCallback((val) => {
    viewerStateRef.current = typeof val === 'function' ? val(viewerStateRef.current) : val;
    _setViewerState(val);
  }, []);

  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const [isInscan, _setIsInscan] = useState(false);
  const isInscanRef = useRef(false);
  const setIsInscan = useCallback((val) => {
    isInscanRef.current = typeof val === 'function' ? val(isInscanRef.current) : val;
    _setIsInscan(val);
  }, []);
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
  const dummyCubeRef = useRef(null);
  const bubbleProjMatRef = useRef(null);
  const projectiveMatRef = useRef(null);
  const depthOccluderMatRef = useRef(null);
  const revealOverlayRef = useRef(null);
  const scansDataRef = useRef({});
  const activeScanIdRef = useRef(null);
  const previousScanIdRef = useRef(null);
  const scanSpheresRef = useRef(null);
  const keysHeldRef = useRef({ left: false, right: false });

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
  const onSelectMeasurementRef = useRef(null);
  measurementModeRef.current = measurementMode;
  onMeasurementClickRef.current = onMeasurementClick;
  onSelectMeasurementRef.current = onSelectMeasurement;

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
      name: 'EquirectProjectiveMaterial',
      uniforms: THREE.UniformsUtils.clone(EquirectProjectiveShader.uniforms),
      vertexShader: EquirectProjectiveShader.vertexShader,
      fragmentShader: EquirectProjectiveShader.fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      extensions: {
        derivatives: true,
        shaderTextureLOD: true
      }
    });
    projectiveMatRef.current = projMat;

    // Unified Projective Background Sphere Material (shares uniforms with mesh for 100% ray lock)
    const bubbleProjMat = new THREE.ShaderMaterial({
      name: 'BubbleProjectiveMaterial',
      uniforms: projMat.uniforms,
      vertexShader: EquirectProjectiveShader.vertexShader,
      fragmentShader: EquirectProjectiveShader.fragmentShader,
      side: THREE.BackSide,
      transparent: false,
      depthTest: true,
      depthWrite: false,
      extensions: {
        derivatives: true,
        shaderTextureLOD: true
      }
    });
    bubbleProjMatRef.current = bubbleProjMat;

    // Invisible Depth-Only Occluder Material for Physical 3D Occlusion
    // (colorWrite=false, depthWrite=true, depthTest=true)
    // Renders physical 3D walls/floors into the GPU depth buffer without altering pixels,
    // ensuring hotspot rings, tags, and tools naturally respect 3D depth and are occluded by walls.
    const depthOccluderMat = new THREE.MeshBasicMaterial({
      name: 'DepthOccluderMaterial',
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide
    });
    depthOccluderMatRef.current = depthOccluderMat;

    // Setup Static Cubemap Material for Distortion-Free Station Panoramas
    const bubbleStaticMat = new THREE.ShaderMaterial({
      name: 'BubbleStaticMaterial',
      uniforms: THREE.UniformsUtils.clone(StaticCubemapShader.uniforms),
      vertexShader: StaticCubemapShader.vertexShader,
      fragmentShader: StaticCubemapShader.fragmentShader,
      side: THREE.BackSide,
      transparent: false,
      depthTest: false,
      depthWrite: false
    });
    bubbleStaticMatRef.current = bubbleStaticMat;

    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.width = 1; dummyCanvas.height = 1;
    const dummyCube = new THREE.CubeTexture([
      dummyCanvas, dummyCanvas, dummyCanvas, dummyCanvas, dummyCanvas, dummyCanvas
    ]);
    dummyCube.needsUpdate = true;
    dummyCubeRef.current = dummyCube;
    bubbleStaticMat.uniforms.uCubeMap.value = dummyCube;
    bubbleStaticMat.uniforms.uNextCubeMap.value = dummyCube;

    // Infinite Sky Dome Background Sphere (BackSide, 500m radius)
    const bubbleGeo = new THREE.SphereGeometry(500, 64, 64);
    const magicBubble = new THREE.Mesh(bubbleGeo, bubbleProjMat);
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

    if (typeof window !== 'undefined') {
      window.__tourDiagnostics = {
        getActiveScan: () => activeScanIdRef.current,
        getMaterialInfo: () => ({
          transparent: projectiveMatRef.current?.transparent,
          depthWrite: projectiveMatRef.current?.depthWrite,
          depthTest: projectiveMatRef.current?.depthTest,
          opacity: projectiveMatRef.current?.uniforms?.uOpacity?.value,
          progress: projectiveMatRef.current?.uniforms?.uTransitionProgress?.value
        }),
        getCanvasResolution: () => {
          const cvs = rendererRef.current?.domElement;
          return cvs ? { width: cvs.width, height: cvs.height, dpr: window.devicePixelRatio } : null;
        }
      };
    }

    return () => {
      if (typeof window !== 'undefined' && window.__tourDiagnostics) {
        delete window.__tourDiagnostics;
      }
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
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        const res = await fetch(`${API_URL}/inspections/${tourId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        if (res.status === 401 || res.status === 403) {
          const redirectParam = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/auth?redirect=${redirectParam}`;
          return;
        }

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
        textureManager.setScansMetadata(metadataMap);
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

            model.renderOrder = 0;
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

            // ─── Setup Scan Hotspots (Multi-Ray Floor Snapping with BVH & Normal Validation) ───
            if (scansArray.length > 0) {
              model.updateMatrixWorld(true);

              const floorMeshes = [];
              model.traverse((child) => {
                if (child.isMesh) {
                  floorMeshes.push(child);
                }
              });

              const raycaster = new THREE.Raycaster();
              const down = new THREE.Vector3(0, 0, -1);
              const upVec = new THREE.Vector3(0, 0, 1);
              const normalMatrix = new THREE.Matrix3();

              // Multi-offset pattern around station (radius ~0.38m) to bypass tripod footprint & nadir blind-spot voids
              const sampleOffsets = [
                [0, 0],             // Center
                [0.38, 0],          // East
                [-0.38, 0],         // West
                [0, 0.38],          // North
                [0, -0.38],         // South
                [0.27, 0.27],       // North-East
                [-0.27, 0.27],      // North-West
                [0.27, -0.27],      // South-East
                [-0.27, -0.27],     // South-West
              ];

              // Pass 1: Multi-ray sampling per station with physics-based floor validation
              const stationFloors = [];
              const detectedDeltas = []; // cameraZ - floorZ

              scansArray.forEach((scan, index) => {
                const scanKey = scan['#name'] || scan.id || `scan_${index}`;
                const sObj = metadataMap[scanKey] || metadataMap[String(scanKey).replace(/^scan_/, '')];
                if (!sObj) {
                  stationFloors.push(null);
                  return;
                }

                const pos = sObj.positionVec;
                const validFloorHits = [];

                for (let s = 0; s < sampleOffsets.length; s++) {
                  const [ox, oy] = sampleOffsets[s];
                  // Shoot downward from camera station level (pos.z + 0.15m)
                  const rayOrigin = new THREE.Vector3(pos.x + ox, pos.y + oy, pos.z + 0.15);
                  raycaster.set(rayOrigin, down);
                  // Floor must be at least 0.75m below camera (filters out tripod head, bracket, scanner body)
                  raycaster.near = 0.75;
                  // Floor should not be more than 3.2m below camera station on same deck
                  raycaster.far = 3.2;

                  const intersects = raycaster.intersectObjects(floorMeshes, false);
                  for (let i = 0; i < intersects.length; i++) {
                    const hit = intersects[i];
                    if (!hit.face) continue;

                    // Calculate world normal of the hit surface
                    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
                    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();

                    // Floor surface MUST be facing upwards in Z-up coordinate system (normal.z > 0.50)
                    if (worldNormal.z > 0.50) {
                      validFloorHits.push({
                        floorZ: hit.point.z,
                        normal: worldNormal,
                        dist: pos.z - hit.point.z
                      });
                      break; // First valid upward surface along this ray is the floor!
                    }
                  }
                }

                if (validFloorHits.length > 0) {
                  // Sort by elevation and take the median to reject any outlier/pipe/cable hits
                  validFloorHits.sort((a, b) => a.floorZ - b.floorZ);
                  const medianHit = validFloorHits[Math.floor(validFloorHits.length / 2)];
                  stationFloors.push({
                    floorZ: medianHit.floorZ,
                    normal: medianHit.normal,
                    hitCount: validFloorHits.length
                  });
                  detectedDeltas.push(pos.z - medianHit.floorZ);
                } else {
                  stationFloors.push(null);
                }
              });

              // Calculate tour-wide median tripod height (cameraZ - floorZ)
              detectedDeltas.sort((a, b) => a - b);
              const medianTripodHeight = detectedDeltas.length > 0
                ? detectedDeltas[Math.floor(detectedDeltas.length / 2)]
                : 1.55; // fallback standard 1.55m

              console.log(`[FloorSnap] Calibrated ${detectedDeltas.length}/${scansArray.length} stations. Tour median tripod height: ${medianTripodHeight.toFixed(3)}m`);

              // Matterport-grade vector pucks lying flat on the floor in Z-up
              const ringGeo = new THREE.PlaneGeometry(0.55, 0.55);
              const hoverBuffer = new Float32Array(scansArray.length);
              const alphaBuffer = new Float32Array(scansArray.length);
              alphaBuffer.fill(1.0);
              ringGeo.setAttribute('aHover', new THREE.InstancedBufferAttribute(hoverBuffer, 1));
              ringGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphaBuffer, 1));

              const ringMat = createMatterportRingMaterial();
              const instMesh = new THREE.InstancedMesh(ringGeo, ringMat, scansArray.length);
              instMesh.renderOrder = 1;

              const dummy = new THREE.Object3D();
              const markerMetadata = [];

              scansArray.forEach((scan, index) => {
                const scanKey = scan['#name'] || scan.id || `scan_${index}`;
                const sObj = metadataMap[scanKey] || metadataMap[String(scanKey).replace(/^scan_/, '')];
                const pos = sObj ? sObj.positionVec : new THREE.Vector3();

                const floorInfo = stationFloors[index];
                // If floor detected, use detected floorZ; otherwise calibrate using tour-wide median tripod height
                const baseFloorZ = floorInfo ? floorInfo.floorZ : (pos.z - medianTripodHeight);
                // Elevation offset +0.025m (2.5cm) above physical floor to eliminate Z-fighting while remaining attached
                const finalFloorZ = baseFloorZ + 0.025;

                // Align puck orientation to floor normal if available, or horizontal XY
                dummy.position.set(pos.x, pos.y, finalFloorZ);
                const puckQuat = new THREE.Quaternion();
                if (floorInfo && floorInfo.normal && floorInfo.normal.z > 0.70) {
                  puckQuat.setFromUnitVectors(upVec, floorInfo.normal);
                  dummy.quaternion.copy(puckQuat);
                } else {
                  dummy.rotation.set(0, 0, 0);
                  puckQuat.set(0, 0, 0, 1);
                }
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                instMesh.setMatrixAt(index, dummy.matrix);

                markerMetadata.push({
                  id: scanKey,
                  instanceId: index,
                  realPosition: pos,
                  ringPosition: new THREE.Vector3(pos.x, pos.y, finalFloorZ),
                  ringQuaternion: puckQuat.clone(),
                  floorDetected: Boolean(floorInfo),
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
            const sizeMult = Math.min(2.0, Math.max(0.6, Number(tag.size) || 1.0));
            sprite.scale.set(TAG_BASE_SCALE_X * sizeMult, TAG_BASE_SCALE_Y * sizeMult, 1);
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

  // Expose real-time tour diagnostics for browser testing
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__tourDiagnostics = () => {
      const diag = {
        viewerState: viewerStateRef.current,
        activeScanId: activeScanIdRef.current,
        pixelRatio: rendererRef.current?.getPixelRatio(),
        canvasDimensions: `${rendererRef.current?.domElement?.width}x${rendererRef.current?.domElement?.height}`,
        modelVisible: modelRef.current?.visible,
        bubbleVisible: bubbleRef.current?.visible,
        bubbleMaterial: bubbleRef.current?.material?.type || bubbleRef.current?.material?.constructor?.name,
        cachedEquirects: Array.from(textureManager.equirectCache?.keys() || []),
        cachedKTX2: Array.from(textureManager.ktx2Cache?.keys() || []),
      };
      console.table(diag);
      return diag;
    };
    return () => {
      delete window.__tourDiagnostics;
    };
  }, []);

  // ─── 4. Projective Mesh Transition Engine ───
  const triggerTransition = useCallback(async (targetScanId) => {
    const targetScan = scansDataRef.current[targetScanId];
    if (!targetScan || !cameraRef.current) return;

    // Evaluate entry mode BEFORE transitioning viewerState
    const isEnteringFromDollhouse = (viewerStateRef.current === 'DOLLHOUSE' || activeScanIdRef.current === null || !isInscanRef.current);

    // Clean up any in-progress dollhouse reveal overlay
    if (revealOverlayRef.current && sceneRef.current) {
      sceneRef.current.remove(revealOverlayRef.current);
      revealOverlayRef.current = null;
    }

    setViewerState('TRANSITION');
    document.body.style.cursor = 'wait';
    console.log(`[TOUR_DIAG] Transition start -> target: ${targetScanId}, fromDollhouse: ${isEnteringFromDollhouse}`);

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

      // Check if target scan has KTX2 generated
      const targetScanRaw = targetScan?.raw || targetScan || {};
      const hasKTX2 = Boolean(
        targetScanRaw.ktx2_1024 ||
        targetScanRaw.ktx2_512 ||
        targetScanRaw.ktx2_256 ||
        textureManager.hasKTX2(nextScanIdNum)
      );

      let nextCubeMap = null;
      let load1024Promise = null;
      if (hasKTX2) {
        const cached1024 = textureManager.getCachedKTX2(nextScanIdNum, '1024');
        if (cached1024) {
          nextCubeMap = cached1024;
        } else {
          load1024Promise = textureManager.loadKTX2(nextScanIdNum, '1024').catch(() => null);
          const bestCached = textureManager.getBestCachedTexture(nextScanIdNum);
          if (bestCached) {
            nextCubeMap = bestCached.texture;
          } else {
            const fast256Promise = textureManager.loadKTX2(nextScanIdNum, '256').catch(() => null);
            nextCubeMap = await Promise.race([
              load1024Promise,
              fast256Promise,
              new Promise((r) => setTimeout(() => r(null), 150))
            ]);
          }
        }
      } else {
        try {
          nextCubeMap = await textureManager.loadCubeMap(nextScanIdNum);
        } catch (e2) {
          nextCubeMap = null;
        }
      }

      // Flight launches immediately with pre-loaded equirectangular texture (zero 150ms stall)

      let currentEquirect = null;
      let currentScan = null;
      let currentScanIdNum = null;
      let currentScanPos = cameraRef.current.position.clone();
      let currentInvRot = new THREE.Matrix3().identity();

      if (!isEnteringFromDollhouse && activeScanIdRef.current) {
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

      if (!isEnteringFromDollhouse && currentEquirect && currentScan) {
        const currRot3x3 = new THREE.Matrix3().setFromMatrix4(
          new THREE.Matrix4().makeRotationFromQuaternion(currentScan.quaternion)
        );
        projMat.uniforms.uCurrentEquirect.value = currentEquirect;
        projMat.uniforms.uCurrentScanPos.value.copy(currentScanPos);
        projMat.uniforms.uCurrentInvRot.value.copy(currentInvRot);
        if (projMat.uniforms.uCurrentRot) projMat.uniforms.uCurrentRot.value.copy(currRot3x3);
        projMat.uniforms.uTransitionProgress.value = 0.0;
      } else {
        projMat.uniforms.uCurrentEquirect.value = nextEquirect;
        projMat.uniforms.uCurrentScanPos.value.copy(targetScan.positionVec);
        projMat.uniforms.uCurrentInvRot.value.copy(targetScan.invRot3x3);
        if (projMat.uniforms.uCurrentRot) projMat.uniforms.uCurrentRot.value.copy(nextRot3x3);
        projMat.uniforms.uTransitionProgress.value = 1.0;
      }

      projMat.uniforms.uOpacity.value = 1.0;

      // When entering from dollhouse: KEEP model mesh in its genuine textured materials
      // so user sees the 3D building and rooms while flying in!
      if (!isEnteringFromDollhouse) {
        if (modelRef.current) {
          modelRef.current.visible = true;
          modelRef.current.traverse((child) => {
            if (child.isMesh) {
              child.material = projMat;
            }
          });
        }
        if (bubbleRef.current && bubbleProjMatRef.current) {
          bubbleRef.current.material = bubbleProjMatRef.current;
          bubbleRef.current.position.set(0, 0, 0);
          bubbleRef.current.quaternion.identity();
          bubbleRef.current.visible = true;
        }
      } else {
        if (modelRef.current) {
          modelRef.current.visible = true;
          modelRef.current.traverse((child) => {
            if (child.isMesh && child.userData.originalMaterial) {
              child.material = child.userData.originalMaterial;
            }
          });
        }
        if (bubbleRef.current) {
          bubbleRef.current.visible = false;
        }
      }

      const forward = new THREE.Vector3();
      if (isEnteringFromDollhouse) {
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

      // Execute Camera Flight Tween: flies inside the physical dollhouse mesh
      const flightDuration = isEnteringFromDollhouse ? 1.25 : 1.1;

      gsap.to(cameraRef.current.position, {
        x: targetScan.positionVec.x,
        y: targetScan.positionVec.y,
        z: targetScan.positionVec.z,
        duration: flightDuration,
        ease: 'power3.inOut',
        onUpdate: function () {
          if (!isEnteringFromDollhouse && totalDistance > 0) {
            const dist = cameraRef.current.position.distanceTo(startPos);
            const prog = Math.min(dist / totalDistance, 1.0);
            projMat.uniforms.uTransitionProgress.value = prog;
          }
        }
      });

      gsap.to(controlsRef.current.target, {
        x: targetLookAt.x,
        y: targetLookAt.y,
        z: targetLookAt.z,
        duration: flightDuration,
        ease: 'power3.inOut',
        onComplete: () => {
          const previousScanId = activeScanIdRef.current;
          previousScanIdRef.current = previousScanId;
          activeScanIdRef.current = targetScanId;

          // Garbage collect heavy textures of previous scan
          if (previousScanId && previousScanId !== targetScanId) {
            textureManager.disposeScanTextures(previousScanId.replace('scan_', ''), true);
          }

          // Ensure projective shader uniforms are cleanly locked at destination scan
          if (projMat?.uniforms) {
            projMat.uniforms.uTransitionProgress.value = 1.0;
            projMat.uniforms.uOpacity.value = 1.0;
            projMat.uniforms.uCurrentEquirect.value = nextEquirect;
            projMat.uniforms.uCurrentScanPos.value.copy(targetScan.positionVec);
            projMat.uniforms.uCurrentInvRot.value.copy(targetScan.invRot3x3);
            if (projMat.uniforms.uCurrentRot) projMat.uniforms.uCurrentRot.value.copy(nextRot3x3);
          }

          const dummyTex = dummyCubeRef.current;

          const isValidCubeTexture = (tex) => {
            return Boolean(
              tex &&
              tex !== dummyTex &&
              (tex.isCubeTexture ||
               tex.isCompressedCubeTexture ||
               tex.isCompressedTexture)
            );
          };

          const activateStaticCubemap = (cubeTex) => {
            if (!isValidCubeTexture(cubeTex)) return;
            if (activeScanIdRef.current !== targetScanId) return;
            if (!bubbleRef.current || !bubbleStaticMatRef.current) return;

            const bubbleMat = bubbleStaticMatRef.current;
            bubbleMat.uniforms.uCubeMap.value = cubeTex;
            bubbleMat.uniforms.uNextCubeMap.value = cubeTex;
            bubbleMat.uniforms.uTransitionProgress.value = 1.0;
            bubbleMat.uniforms.uOpacity.value = 1.0;

            bubbleRef.current.material = bubbleMat;
            bubbleRef.current.quaternion.copy(targetScan.quaternion);
            bubbleRef.current.position.copy(targetScan.positionVec);
            bubbleRef.current.visible = true;

            // Keep model mesh rendering projMat so there is NEVER a black drop or empty frame!
            if (modelRef.current) {
              modelRef.current.visible = true;
              modelRef.current.traverse((child) => {
                if (child.isMesh && projMat) {
                  child.material = projMat;
                }
              });
            }
          };

          // Check if 1024 (or high-res cubemap) is already loaded in memory
          const ready1024 = textureManager.getCachedKTX2(nextScanIdNum, '1024');
          const validInitialCube = hasKTX2
            ? (isValidCubeTexture(ready1024) ? ready1024 : null)
            : (isValidCubeTexture(nextCubeMap) ? nextCubeMap : null);

          // ─── First Enter from Dollhouse: Smooth Dissolve Projection on Arrival ───
          if (isEnteringFromDollhouse && modelRef.current && sceneRef.current) {
            const overlayGroup = new THREE.Group();
            overlayGroup.name = 'DollhouseRevealOverlay';

            projMat.transparent = true;
            projMat.depthWrite = false;
            projMat.depthTest = true;
            projMat.uniforms.uOpacity.value = 0.0;
            projMat.uniforms.uTransitionProgress.value = 1.0;
            projMat.uniforms.uCurrentEquirect.value = nextEquirect;
            projMat.uniforms.uNextEquirect.value = nextEquirect;
            projMat.uniforms.uCurrentScanPos.value.copy(targetScan.positionVec);
            projMat.uniforms.uCurrentInvRot.value.copy(targetScan.invRot3x3);
            if (projMat.uniforms.uCurrentRot) projMat.uniforms.uCurrentRot.value.copy(nextRot3x3);

            modelRef.current.traverse((child) => {
              if (child.isMesh && child.geometry) {
                const overlayMesh = new THREE.Mesh(child.geometry, projMat);
                overlayMesh.matrix.copy(child.matrix);
                overlayMesh.matrixWorld.copy(child.matrixWorld);
                overlayMesh.matrixAutoUpdate = false;
                overlayGroup.add(overlayMesh);
              }
            });
            sceneRef.current.add(overlayGroup);
            revealOverlayRef.current = overlayGroup;

            // Beautiful 0.5s dissolve: seamlessly projects the 360 photo over the room mesh
            gsap.to(projMat.uniforms.uOpacity, {
              value: 1.0,
              duration: 0.5,
              ease: 'power2.out',
              onComplete: () => {
                if (sceneRef.current && overlayGroup) {
                  sceneRef.current.remove(overlayGroup);
                }
                if (revealOverlayRef.current === overlayGroup) {
                  revealOverlayRef.current = null;
                }
                projMat.transparent = true;
                projMat.depthWrite = true;

                if (validInitialCube) {
                  activateStaticCubemap(validInitialCube);
                } else {
                  if (modelRef.current) {
                    modelRef.current.traverse((child) => {
                      if (child.isMesh) child.material = projMat;
                    });
                  }
                  if (bubbleRef.current && bubbleProjMatRef.current) {
                    bubbleRef.current.material = bubbleProjMatRef.current;
                    bubbleRef.current.position.set(0, 0, 0);
                    bubbleRef.current.quaternion.identity();
                    bubbleRef.current.visible = true;
                  }
                }
              }
            });
          } else {
            // Standard station-to-station arrival
            if (validInitialCube) {
              activateStaticCubemap(validInitialCube);
            } else {
              if (bubbleRef.current && bubbleProjMatRef.current) {
                bubbleRef.current.material = bubbleProjMatRef.current;
                bubbleRef.current.position.set(0, 0, 0);
                bubbleRef.current.quaternion.identity();
                bubbleRef.current.visible = true;
              }
              if (modelRef.current && projMat) {
                modelRef.current.visible = true;
                modelRef.current.traverse((child) => {
                  if (child.isMesh) {
                    child.material = projMat;
                  }
                });
              }
            }
          }

          // Asynchronously upgrade to high-res cubemap as soon as network download finishes
          if (hasKTX2 && !validInitialCube) {
            const fetch1024 = load1024Promise || textureManager.loadKTX2(nextScanIdNum, '1024');
            fetch1024.then((hdTex) => {
              if (hdTex && activeScanIdRef.current === targetScanId) {
                activateStaticCubemap(hdTex);
              }
            }).catch(() => {});
          } else if (!hasKTX2 && !validInitialCube) {
            textureManager.loadCubeMap(nextScanIdNum).then((cubeTex) => {
              if (cubeTex && activeScanIdRef.current === targetScanId) {
                activateStaticCubemap(cubeTex);
              }
            }).catch(() => {});
          }

          // Background-preload 256 LOD for closest 3 adjacent scans for instant next hops
          if (scansDataRef.current && typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            window.requestIdleCallback(() => {
              try {
                const currPos = targetScan.positionVec;
                const adjacent = Object.values(scansDataRef.current)
                  .filter((s) => s.id !== targetScanId)
                  .map((s) => ({ id: s.id, dist: s.positionVec.distanceTo(currPos) }))
                  .sort((a, b) => a.dist - b.dist)
                  .slice(0, 3);
                for (const adj of adjacent) {
                  const adjNum = adj.id.replace('scan_', '');
                  if (textureManager.hasKTX2(adjNum)) {
                    textureManager.loadKTX2(adjNum, '256').catch(() => {});
                  }
                }
              } catch (_) {}
            });
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

          if (scanSpheresRef.current) {
            scanSpheresRef.current.visible = true;
          }

          // Defer preloading adjacent scans by 1.0s to ensure zero landing CPU/GPU contention
          setTimeout(() => {
            if (activeScanIdRef.current === targetScanId) {
              preloadNearestScans(targetScanId);
            }
          }, 1000);

          console.log(`[TOUR_DIAG] Transition landing complete -> scan: ${targetScanId}, canvas: ${rendererRef.current?.domElement?.width}x${rendererRef.current?.domElement?.height}`);
        }
      });

    } catch (err) {
      console.error("Transition failed:", err);
      document.body.style.cursor = 'default';
      setViewerState('DOLLHOUSE');
      if (scanSpheresRef.current) {
        scanSpheresRef.current.visible = true;
      }
    }
  }, [cameraRef, controlsRef, dummyTex, keyboardEnabledRef, preloadNearestScans, tierConfig]);

  // ─── 5. Hotspot Distance Culling, Pitch-Aware Fading & Keyboard Camera Rotation Loop ───
  useEffect(() => {
    if (!isDataLoaded || !scanSpheresRef.current || !cameraRef.current) return;
    const instancedMesh = scanSpheresRef.current;
    if (!instancedMesh || !instancedMesh.isInstancedMesh) return;

    let rafId;
    const dummy = new THREE.Object3D();
    const camDir = new THREE.Vector3();
    const losRaycaster = new THREE.Raycaster();
    const rayDir = new THREE.Vector3();
    let lastTime = performance.now();

    const updateVisibility = () => {
      rafId = requestAnimationFrame(updateVisibility);

      const now = performance.now();
      const dt = Math.min((now - lastTime) * 0.001, 0.1);
      lastTime = now;

      // 1. Smooth Continuous Keyboard Camera Turn (ArrowLeft / ArrowRight or A / D)
      if (controlsRef.current && (viewerState === 'INSIDE' || viewerState === 'DOLLHOUSE')) {
        if (keysHeldRef.current.left) {
          controlsRef.current.rotateLeft(-1.95 * dt); // Inverted: left arrow rotates view left (~112°/sec)
          controlsRef.current.update();
        } else if (keysHeldRef.current.right) {
          controlsRef.current.rotateLeft(1.95 * dt); // Inverted: right arrow rotates view right
          controlsRef.current.update();
        }
      }

      // Update shader time for subtle dynamic pulse
      if (instancedMesh.material?.uniforms?.uTime) {
        instancedMesh.material.uniforms.uTime.value = now * 0.001;
      }

      // During panorama transition, hide rings completely for clean visual flight
      if (viewerState === 'TRANSITION') {
        if (instancedMesh.material?.uniforms?.uGlobalOpacity) {
          instancedMesh.material.uniforms.uGlobalOpacity.value = 0.0;
        }
        return;
      } else {
        if (instancedMesh.material?.uniforms?.uGlobalOpacity) {
          instancedMesh.material.uniforms.uGlobalOpacity.value = 1.0;
        }
      }

      const camera = cameraRef.current;
      const cameraPos = camera.position;
      camera.getWorldDirection(camDir);

      // Pitch fade: When user looks up towards the ceiling, fade out floor rings completely
      // camDir.z is vertical pitch in Z-up. When looking up (> 0.22, ~13°), starts fading.
      // At camDir.z >= 0.50 (~30° upwards), pitchFade is 0.0 (completely hidden)
      const pitchFade = viewerState === 'INSIDE'
        ? THREE.MathUtils.clamp(1.0 - (camDir.z - 0.22) / 0.28, 0.0, 1.0)
        : 1.0;

      const currentScan = scansDataRef.current[activeScanIdRef.current];
      const currentFloorZ = currentScan ? currentScan.positionVec.z : cameraPos.z;

      let matrixNeedsUpdate = false;
      let alphaNeedsUpdate = false;
      const aAlpha = instancedMesh.geometry?.attributes?.aAlpha;

      if (instancedMesh.userData.metadata) {
        instancedMesh.userData.metadata.forEach((data) => {
          const isCurrentActive = data.id === activeScanIdRef.current && viewerState === 'INSIDE';
          let shouldBeVisible = !isCurrentActive;
          let targetAlpha = 1.0;

          if (viewerState === 'INSIDE') {
            // Floor filtering: strictly hide rings on other floor decks (deck elevation diff > 2.2m)
            const deltaZ = Math.abs(data.realPosition.z - currentFloorZ);
            if (deltaZ > 2.2) {
              shouldBeVisible = false;
              targetAlpha = 0.0;
            }

            if (shouldBeVisible) {
              const dist = cameraPos.distanceTo(data.realPosition);
              // Hide if too close (under feet) or too far (> 13.5m)
              if (dist < 0.65 || dist > 13.5) {
                shouldBeVisible = false;
                targetAlpha = 0.0;
              } else {
                // Accurate 3D physical occlusion through building mesh
                if (modelRef.current && dist > 0.6) {
                  // Ray 1: From camera eye-height to the physical ring puck on the floor (+0.08m up to avoid floor self-hit)
                  const ringTarget = (data.ringPosition || data.realPosition).clone();
                  ringTarget.z += 0.08;
                  rayDir.subVectors(ringTarget, cameraPos).normalize();
                  const distToRing = cameraPos.distanceTo(ringTarget);
                  losRaycaster.set(cameraPos, rayDir);
                  losRaycaster.far = Math.max(0.1, distToRing - 0.15);
                  const occlusionsRing = losRaycaster.intersectObject(modelRef.current, true);

                  if (occlusionsRing.length > 0) {
                    shouldBeVisible = false;
                    targetAlpha = 0.0;
                  } else {
                    // Ray 2: Eye-level to eye-level station raycast
                    rayDir.subVectors(data.realPosition, cameraPos).normalize();
                    const distToStation = cameraPos.distanceTo(data.realPosition);
                    losRaycaster.set(cameraPos, rayDir);
                    losRaycaster.far = Math.max(0.1, distToStation - 0.20);
                    const occlusionsStation = losRaycaster.intersectObject(modelRef.current, true);
                    if (occlusionsStation.length > 0) {
                      shouldBeVisible = false;
                      targetAlpha = 0.0;
                    }
                  }
                }

                if (shouldBeVisible) {
                  // Smooth distance fade between 7.5m and 13.5m
                  const distFade = THREE.MathUtils.clamp(1.0 - (dist - 7.5) / 6.0, 0.0, 1.0);
                  targetAlpha = distFade * pitchFade;
                  if (targetAlpha <= 0.02) {
                    shouldBeVisible = false;
                  }
                }
              }
            }
          } else if (viewerState === 'DOLLHOUSE' || isMeshView) {
            // Dollhouse view: show all rings as compact indicators
            targetAlpha = 0.85;
            shouldBeVisible = true;
          }

          if (aAlpha) {
            const currentA = aAlpha.getX(data.instanceId);
            if (Math.abs(currentA - targetAlpha) > 0.015) {
              aAlpha.setX(data.instanceId, targetAlpha);
              alphaNeedsUpdate = true;
            }
          }

          if (data.isVisible !== shouldBeVisible) {
            data.isVisible = shouldBeVisible;
            dummy.position.copy(data.ringPosition || data.realPosition);
            if (data.ringQuaternion) {
              dummy.quaternion.copy(data.ringQuaternion);
            } else {
              dummy.rotation.set(0, 0, 0);
            }
            dummy.scale.setScalar(shouldBeVisible ? (viewerState === 'INSIDE' ? 1.0 : 0.42) : 0);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(data.instanceId, dummy.matrix);
            matrixNeedsUpdate = true;
          }
        });
      }

      if (alphaNeedsUpdate && aAlpha) {
        aAlpha.needsUpdate = true;
      }
      if (matrixNeedsUpdate) {
        instancedMesh.instanceMatrix.needsUpdate = true;
      }
    };

    updateVisibility();
    return () => cancelAnimationFrame(rafId);
  }, [isDataLoaded, cameraRef, viewerState, isMeshView]);

  // ─── 6. Keyboard Navigation: Arrow Left/Right Turns Camera, Up/Down Navigates Hotspots ───
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ignore when user is typing in form inputs, textareas, or modals
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        return;
      }

      const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
      if (!navKeys.includes(e.code)) return;

      // Prevent browser default window scrolling
      if (e.code.startsWith('Arrow')) {
        e.preventDefault();
      }

      // Left / Right: Smooth Camera Yaw Rotation
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        keysHeldRef.current.left = true;
        // Immediate snappy nudge on initial press
        if (controlsRef.current) {
          controlsRef.current.rotateLeft(-0.065);
          controlsRef.current.update();
        }
        return;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        keysHeldRef.current.right = true;
        if (controlsRef.current) {
          controlsRef.current.rotateLeft(0.065);
          controlsRef.current.update();
        }
        return;
      }

      // Up / Down: Move to Next/Previous Hotspot (Floor-Aware)
      if (viewerState !== 'INSIDE' || !activeScanIdRef.current || !cameraRef.current) return;
      if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown' && e.code !== 'KeyW' && e.code !== 'KeyS') return;

      const currentScan = scansDataRef.current[activeScanIdRef.current];
      if (!currentScan) return;
      const currentPos = currentScan.positionVec;
      const currentFloorZ = currentPos.z;

      // Forward direction in horizontal plane (XY in Z-up)
      const forward = new THREE.Vector3();
      cameraRef.current.getWorldDirection(forward);
      const forward2D = new THREE.Vector2(forward.x, forward.y).normalize();

      const isForward = e.code === 'ArrowUp' || e.code === 'KeyW';
      const moveDir2D = isForward ? forward2D : forward2D.clone().negate();

      let bestSameFloorMatch = null;
      let bestSameFloorScore = -Infinity;

      let bestStairsMatch = null;
      let bestStairsScore = -Infinity;

      Object.keys(scansDataRef.current).forEach((id) => {
        if (id === activeScanIdRef.current) return;
        const scan = scansDataRef.current[id];
        const pos = scan.positionVec;

        const deltaZ = Math.abs(pos.z - currentFloorZ);
        const deltaXY = new THREE.Vector2(pos.x - currentPos.x, pos.y - currentPos.y);
        const dist = deltaXY.length();

        // Target hotspots within walking range
        if (dist < 0.75 || dist > 13.0) return;

        const dir2D = deltaXY.clone().normalize();
        const dot = moveDir2D.dot(dir2D);

        // Half-cone tolerance (~66° angle from moving direction)
        if (dot < 0.40) return;

        // Backward navigation: bonus if returning to previous station
        const isPrevScan = !isForward && previousScanIdRef.current === id;
        const prevBonus = isPrevScan ? 1.5 : 0.0;

        // 1. Same Floor Candidate (deltaZ <= 1.4m)
        if (deltaZ <= 1.4) {
          const score = (dot * 3.2) - (dist * 0.15) - (deltaZ * 0.6) + prevBonus;
          if (score > bestSameFloorScore) {
            bestSameFloorScore = score;
            bestSameFloorMatch = id;
          }
        }
        // 2. Stairway / Floor Transition Candidate (1.4m < deltaZ <= 3.2m within 4.5m distance)
        else if (deltaZ <= 3.2 && dist <= 4.5 && dot > 0.65) {
          const score = (dot * 2.2) - (dist * 0.2);
          if (score > bestStairsScore) {
            bestStairsScore = score;
            bestStairsMatch = id;
          }
        }
      });

      // Prefer same-floor hotspot; take stairs only if navigating along stairwell
      const targetMatch = bestSameFloorMatch || bestStairsMatch;
      if (targetMatch) {
        triggerTransition(targetMatch);
      }
    };

    const onKeyUp = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        keysHeldRef.current.left = false;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        keysHeldRef.current.right = false;
      }
    };

    const onBlur = () => {
      keysHeldRef.current.left = false;
      keysHeldRef.current.right = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
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

    let hoveredInstanceId = -1;

    const onMove = (e) => {
      if (wasDraggingRef.current && onPointerDragMoveRef.current) {
        onPointerDragMoveRef.current(e);
        return;
      }

      // Matterport-style puck hover detection & cursor handling
      if (scanSpheresRef.current && renderer?.domElement && camera) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const instMesh = scanSpheresRef.current;
        const aHover = instMesh.geometry?.attributes?.aHover;
        const aAlpha = instMesh.geometry?.attributes?.aAlpha;
        const ringHits = raycaster.intersectObject(instMesh);

        if (ringHits.length > 0) {
          const hitInstanceId = ringHits[0].instanceId;
          const hitDistance = ringHits[0].distance;
          const targetMeta = instMesh.userData?.metadata?.[hitInstanceId];
          const ringAlpha = aAlpha ? aAlpha.getX(hitInstanceId) : 1.0;

          // Physical wall occlusion check: if building mesh is closer than the ring, the ring is behind a wall
          let isOccluded = false;
          if (modelRef.current) {
            const wallHits = raycaster.intersectObject(modelRef.current, true);
            if (wallHits.length > 0 && wallHits[0].distance < hitDistance - 0.05) {
              isOccluded = true;
            }
          }

          if (!isOccluded && targetMeta && targetMeta.id !== activeScanIdRef.current && targetMeta.isVisible && ringAlpha > 0.05) {
            renderer.domElement.style.cursor = 'pointer';

            if (hoveredInstanceId !== hitInstanceId) {
              if (hoveredInstanceId !== -1 && aHover) {
                aHover.setX(hoveredInstanceId, 0.0);
              }
              hoveredInstanceId = hitInstanceId;
              if (aHover) {
                aHover.setX(hitInstanceId, 1.0);
                aHover.needsUpdate = true;
              }
            }
            return;
          }
        }

        // Reset previous hovered ring when cursor leaves
        if (hoveredInstanceId !== -1) {
          if (aHover) {
            aHover.setX(hoveredInstanceId, 0.0);
            aHover.needsUpdate = true;
          }
          hoveredInstanceId = -1;
        }

        // If hovering over 3D model/floor in exploration mode, show pointer cursor for click-to-move
        if (modelRef.current && !measurementModeRef.current && !tagModeRef.current && !pointersModeRef.current) {
          const meshHits = raycaster.intersectObject(modelRef.current, true);
          if (meshHits.length > 0) {
            renderer.domElement.style.cursor = 'pointer';
            return;
          }
        }

        renderer.domElement.style.cursor = 'default';
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

      // Check drag displacement (ignore clicks if user was orbiting / panning)
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      if (Math.hypot(dx, dy) > 8) {
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

      // 3.5. 3D Measurement Selection Check
      const scene = sceneRef.current;
      if (scene) {
        const markersGroup = scene.getObjectByName('measurementMarkers');
        if (markersGroup && markersGroup.children.length > 0) {
          const prevThresh = raycaster.params?.Line?.threshold;
          if (raycaster.params) {
            if (!raycaster.params.Line) raycaster.params.Line = {};
            raycaster.params.Line.threshold = 0.8;
          }
          const mHits = raycaster.intersectObjects(markersGroup.children, true);
          if (raycaster.params?.Line) {
            raycaster.params.Line.threshold = prevThresh ?? 1;
          }
          if (mHits.length > 0) {
            for (const hit of mHits) {
              let cur = hit.object;
              while (cur && cur !== markersGroup) {
                if (cur.userData?.measurementId) {
                  onSelectMeasurementRef.current?.(cur.userData.measurementId);
                  return;
                }
                cur = cur.parent;
              }
            }
          }
        }
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

      // 6. Direct Click on Scan Ring Marker
      let targetScanId = null;

      if (scanSpheresRef.current) {
        const intersects = raycaster.intersectObject(scanSpheresRef.current);
        if (intersects.length > 0) {
          const instanceId = intersects[0].instanceId;
          const hitDistance = intersects[0].distance;
          const targetMeta = scanSpheresRef.current.userData.metadata?.[instanceId];
          const aAlpha = scanSpheresRef.current.geometry?.attributes?.aAlpha;
          const ringAlpha = aAlpha ? aAlpha.getX(instanceId) : 1.0;

          // Physical wall occlusion check on click
          let isOccluded = false;
          if (modelRef.current) {
            const wallHits = raycaster.intersectObject(modelRef.current, true);
            if (wallHits.length > 0 && wallHits[0].distance < hitDistance - 0.05) {
              isOccluded = true;
            }
          }

          if (!isOccluded && targetMeta && targetMeta.id !== activeScanIdRef.current && targetMeta.isVisible && ringAlpha > 0.05) {
            targetScanId = targetMeta.id;
          }
        }
      }

      // 7. Matterport-style Click Anywhere (Floor / 3D Building Mesh) -> Teleport to Nearest Scan Ring
      if (!targetScanId && modelRef.current && scanSpheresRef.current?.userData?.metadata) {
        const meshIntersects = raycaster.intersectObject(modelRef.current, true);
        if (meshIntersects.length > 0) {
          const hitPoint = meshIntersects[0].point;
          const metadata = scanSpheresRef.current.userData.metadata;

          let closestScan = null;
          let minDistance = Infinity;

          for (let i = 0; i < metadata.length; i++) {
            const scanMeta = metadata[i];
            const scanPos = scanMeta.ringPosition || scanMeta.realPosition;

            // In Z-up coordinate system: X & Y is horizontal plane, Z is elevation
            const distX = scanPos.x - hitPoint.x;
            const distY = scanPos.y - hitPoint.y;
            const horizDist = Math.hypot(distX, distY);

            // Vertical height difference
            const vertDist = Math.abs(scanPos.z - hitPoint.z);

            // Floor-aware weighting: penalize vertical difference heavily to stay on the same floor level
            const effectiveDist = horizDist + vertDist * 3.0;

            if (effectiveDist < minDistance) {
              minDistance = effectiveDist;
              closestScan = scanMeta;
            }
          }

          if (closestScan && closestScan.id !== activeScanIdRef.current) {
            targetScanId = closestScan.id;
            // Spawn an animated Matterport-style floor ripple at the clicked spot
            createClickRipple(hitPoint);
          }
        }
      }

      if (targetScanId) {
        triggerTransition(targetScanId);
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
    if (revealOverlayRef.current && sceneRef.current) {
      sceneRef.current.remove(revealOverlayRef.current);
      revealOverlayRef.current = null;
    }
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
    activeScanIdRef.current = null;
  };

  const handleFloorPlanView = () => {
    if (!modelRef.current || !cameraRef.current || !controlsRef.current) return;

    if (bubbleRef.current) bubbleRef.current.visible = false;
    if (revealOverlayRef.current && sceneRef.current) {
      sceneRef.current.remove(revealOverlayRef.current);
      revealOverlayRef.current = null;
    }
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
    activeScanIdRef.current = null;
  };

  const handleToggleMeshView = () => {
    if (!modelRef.current) return;
    const nextMesh = !isMeshView;
    setIsMeshView(nextMesh);

    if (nextMesh) {
      modelRef.current.visible = true;
      modelRef.current.traverse((child) => {
        if (child.isMesh && child.userData.originalMaterial) {
          child.material = child.userData.originalMaterial;
        }
      });
      if (bubbleRef.current) bubbleRef.current.visible = false;
    } else {
      if (viewerState === 'INSIDE') {
        modelRef.current.visible = true;
        const hasStaticCube = bubbleStaticMatRef.current &&
          bubbleStaticMatRef.current.uniforms?.uCubeMap?.value &&
          bubbleStaticMatRef.current.uniforms.uCubeMap.value !== dummyCubeRef.current;

        if (hasStaticCube && depthOccluderMatRef.current) {
          modelRef.current.traverse((child) => {
            if (child.isMesh) {
              child.material = depthOccluderMatRef.current;
            }
          });
          if (bubbleRef.current && bubbleStaticMatRef.current) {
            bubbleRef.current.material = bubbleStaticMatRef.current;
            bubbleRef.current.visible = true;
          }
        } else {
          modelRef.current.traverse((child) => {
            if (child.isMesh && projectiveMatRef.current) {
              child.material = projectiveMatRef.current;
            }
          });
          if (bubbleRef.current && bubbleProjMatRef.current) {
            bubbleRef.current.material = bubbleProjMatRef.current;
            bubbleRef.current.visible = true;
          }
        }
      }
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
