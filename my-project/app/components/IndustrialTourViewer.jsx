import { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

import { useThreeScene } from '../hooks/useThreeScene';
import { useStaging } from '../hooks/useStaging';
import { createAreaPointerGroup } from '../utils/createAreaPointerGraphics';
import { createTagSpriteMaterial } from '../hooks/useTags';
import { ProjectiveMeshShader } from '../shaders/HybridProjectiveShaders';
import { StaticCubemapShader } from '../shaders/StaticCubemapShader';
import { textureManager } from '../utils/TextureManager';
import { API_URL, MINIO_URL } from '../config/api';

// Inject BVH prototype methods
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const IndustrialTourViewer = forwardRef(({
  tourId,
  activeProfileId,
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

  const { mountRef, sceneRef, cameraRef, rendererRef, controlsRef, keyboardEnabledRef, sceneReady } = useThreeScene([dummyTex], true);

  // Viewer State: 'DOLLHOUSE' | 'TRANSITION' | 'INSIDE'
  const [viewerState, setViewerState] = useState('DOLLHOUSE');
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isInscan, setIsInscan] = useState(false);
  const [isMeshView, setIsMeshView] = useState(false);

  // Entities
  const [tourDetails, setTourDetails] = useState(null);
  const [scansData, setScansData] = useState([]);
  const [scanSpheres, setScanSpheres] = useState([]);
  const [activeTagInfo, setActiveTagInfo] = useState(null);

  // Scene references
  const modelRef = useRef(null);
  const bubbleRef = useRef(null);
  const projectiveMatRef = useRef(null);
  const scansDataRef = useRef({});
  const activeScanIdRef = useRef(null);
  const scanSpheresRef = useRef(null);

  // Staging Hook
  const staging = useStaging(
    sceneRef, cameraRef, rendererRef, controlsRef, modelRef, isDataLoaded, tourId, activeProfileId
  );

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

    // Room-Bounded Static Panorama Sphere (BackSide)
    const bubbleGeo = new THREE.SphereGeometry(14, 64, 64);
    const bubbleMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(StaticCubemapShader.uniforms),
      vertexShader: StaticCubemapShader.vertexShader,
      fragmentShader: StaticCubemapShader.fragmentShader,
      side: THREE.BackSide,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });

    const dummyCube = new THREE.CubeTexture([
      document.createElement('canvas'), document.createElement('canvas'),
      document.createElement('canvas'), document.createElement('canvas'),
      document.createElement('canvas'), document.createElement('canvas')
    ]);
    dummyCube.needsUpdate = true;
    bubbleMat.uniforms.uCubeMap.value = dummyCube;
    bubbleMat.uniforms.uNextCubeMap.value = dummyCube;

    const magicBubble = new THREE.Mesh(bubbleGeo, bubbleMat);
    magicBubble.renderOrder = -1;
    magicBubble.frustumCulled = false;
    magicBubble.visible = false;
    scene.add(magicBubble);
    bubbleRef.current = magicBubble;

    // Initialize TextureManager with renderer and tour storage paths
    textureManager.init(renderer);
    if (tourId) {
      textureManager.setBasePath(tourId);
    }

    // Setup Projective Mesh Material (Equirectangular)
    const projMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(ProjectiveMeshShader.uniforms),
      vertexShader: ProjectiveMeshShader.vertexShader,
      fragmentShader: ProjectiveMeshShader.fragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
      depthTest: true,
      depthWrite: true
    });
    projectiveMatRef.current = projMat;

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

        let scansUrl = tour.scansJsonUrl;
        if (scansUrl && !scansUrl.startsWith('http')) {
          scansUrl = `${MINIO_URL}/virtual-inspections/${scansUrl}`;
        }

        // Fetch Scans JSON or DB Scans
        let loadedScans = [];
        if (scansUrl) {
          try {
            const scansRes = await fetch(scansUrl);
            if (scansRes.ok) {
              loadedScans = await scansRes.json();
            }
          } catch (e) {
            console.warn("Could not fetch scans JSON:", e.message);
          }
        }

        if (loadedScans.length === 0 && tour.scans && tour.scans.length > 0) {
          loadedScans = tour.scans.map(s => ({
            '#name': s.id,
            x: s.posX,
            y: s.posY,
            alt: s.posZ,
            rotation_quaternion: [s.quatW, s.quatX, s.quatY, s.quatZ]
          }));
        }

        // Map and pre-calculate matrices for all scans
        const metadataMap = {};
        const scansArray = Array.isArray(loadedScans) ? loadedScans : Object.entries(loadedScans).map(([k, v]) => ({ '#name': k, ...v }));
        
        scansArray.forEach((scan, index) => {
          const scanKey = scan['#name'] || scan.id || `scan_${index}`;
          const posX = scan.x ?? scan.posX ?? scan.position?.[0] ?? 0;
          const posY = scan.y ?? scan.posY ?? scan.position?.[1] ?? 0;
          const posZ = scan.alt ?? scan.z ?? scan.posZ ?? scan.position?.[2] ?? 0;

          const qVals = scan.rotation_quaternion || scan.quaternion_xyzw || [0, 0, 0, 1];
          const quat = qVals.length === 4 
            ? new THREE.Quaternion(qVals[0], qVals[1], qVals[2], qVals[3]) 
            : new THREE.Quaternion(0, 0, 0, 1);

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
        });

        scansDataRef.current = metadataMap;
        setScansData(scansArray);

        // Load 3D GLB Model Mesh
        if (glbUrl) {
          const gltfLoader = new GLTFLoader();
          const dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
          gltfLoader.setDRACOLoader(dracoLoader);

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
                  child.geometry.computeBoundsTree();
                  child.raycast = acceleratedRaycast;
                }
              }
            });

            scene.add(model);
            modelRef.current = model;
            setIsModelLoaded(true);

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

  // ─── 3. Preload Nearest Scans Helper ───
  const preloadNearestScans = useCallback(async (currentScanId) => {
    try {
      const meta = scansDataRef.current;
      const currentScan = meta[currentScanId];
      if (!currentScan) return;

      const currentPos = currentScan.positionVec;
      const distances = [];

      for (const scanId in meta) {
        if (scanId === currentScanId) continue;
        const scan = meta[scanId];
        const dist = currentPos.distanceTo(scan.positionVec);
        distances.push({ id: scanId.replace('scan_', ''), dist });
      }

      distances.sort((a, b) => a.dist - b.dist);
      const nearest5 = distances.slice(0, 5).map(item => item.id);
      textureManager.preloadBase(nearest5);
    } catch (e) {
      console.warn("Failed to preload nearest scans:", e);
    }
  }, []);

  // ─── 4. Projective Mesh Transition Engine ───
  const triggerTransition = useCallback(async (targetScanId) => {
    const targetScan = scansDataRef.current[targetScanId];
    if (!targetScan || !cameraRef.current) return;

    setViewerState('TRANSITION');
    document.body.style.cursor = 'wait';

    if (scanSpheresRef.current) {
      scanSpheresRef.current.visible = false;
    }

    try {
      const nextScanIdNum = targetScanId.replace('scan_', '');

      // Load Equirectangular low-res for real-time mesh projection
      const nextEquirect = await textureManager.loadEquirect(nextScanIdNum);

      // Load KTX2 compressed cubemap or native cubemaps for the background bubble
      let nextCubeMap;
      try {
        nextCubeMap = await textureManager.loadKTX2(nextScanIdNum, '2048');
      } catch (e) {
        try {
          nextCubeMap = await textureManager.loadCubeMap(nextScanIdNum);
        } catch (e2) {
          nextCubeMap = dummyTex;
        }
      }

      const isFirstClick = activeScanIdRef.current === null;
      let currentEquirect = null;
      let currentScan = null;
      let currentScanPos = cameraRef.current.position.clone();
      let currentInvRot = new THREE.Matrix3().identity();

      if (!isFirstClick) {
        const currentScanIdNum = activeScanIdRef.current.replace('scan_', '');
        currentScan = scansDataRef.current[activeScanIdRef.current];
        currentEquirect = await textureManager.loadEquirect(currentScanIdNum);
        if (currentScan) {
          currentScanPos = currentScan.positionVec;
          currentInvRot = currentScan.invRot3x3;
        }
      }

      const projMat = projectiveMatRef.current;
      projMat.uniforms.uNextColorMap.value = nextEquirect;
      projMat.uniforms.uNextScanPos.value.copy(targetScan.positionVec);
      const nextQ = targetScan.quaternion;
      projMat.uniforms.uNextScanQuatInverse.value.set(-nextQ.x, -nextQ.y, -nextQ.z, nextQ.w);

      const relRot3x3 = new THREE.Matrix3().identity();
      let currentCubeMap = nextCubeMap;

      if (!isFirstClick && currentEquirect && currentScan) {
        projMat.uniforms.uCurrentColorMap.value = currentEquirect;
        projMat.uniforms.uCurrentScanPos.value.copy(currentScanPos);
        const currQ = currentScan.quaternion;
        projMat.uniforms.uCurrentScanQuatInverse.value.set(-currQ.x, -currQ.y, -currQ.z, currQ.w);
        projMat.uniforms.uTransitionProgress.value = 0.0;

        // Calculate Relative Rotation (R_A^-1 * R_B)
        const rotB_4 = new THREE.Matrix4().makeRotationFromQuaternion(targetScan.quaternion);
        const invRotA_4 = new THREE.Matrix4().makeRotationFromQuaternion(currentScan.quaternion).transpose();
        const relRot_4 = invRotA_4.multiply(rotB_4);
        relRot3x3.setFromMatrix4(relRot_4);

        if (bubbleRef.current?.material?.uniforms?.uNextCubeMap?.value) {
          currentCubeMap = bubbleRef.current.material.uniforms.uNextCubeMap.value;
        } else if (bubbleRef.current?.material?.uniforms?.uCubeMap?.value) {
          currentCubeMap = bubbleRef.current.material.uniforms.uCubeMap.value;
        }
      } else {
        projMat.uniforms.uCurrentColorMap.value = nextEquirect;
        projMat.uniforms.uCurrentScanPos.value.copy(targetScan.positionVec);
        projMat.uniforms.uCurrentScanQuatInverse.value.set(-nextQ.x, -nextQ.y, -nextQ.z, nextQ.w);
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

      // Configure Sky Dome Bubble
      if (bubbleRef.current) {
        bubbleRef.current.position.copy(targetScan.positionVec);
        bubbleRef.current.quaternion.copy(targetScan.quaternion);
        bubbleRef.current.material.uniforms.uCubeMap.value = currentCubeMap;
        bubbleRef.current.material.uniforms.uNextCubeMap.value = nextCubeMap;
        bubbleRef.current.material.uniforms.uRelRot.value.copy(relRot3x3);
        bubbleRef.current.material.uniforms.uTransitionProgress.value = isFirstClick ? 1.0 : 0.0;
        bubbleRef.current.material.uniforms.uOpacity.value = isFirstClick ? 0.0 : 1.0;
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
            if (bubbleRef.current) {
              bubbleRef.current.material.uniforms.uTransitionProgress.value = prog;
              bubbleRef.current.position.lerpVectors(startPos, targetScan.positionVec, prog);
            }
          }
          if (isFirstClick) {
            const prog = this.progress();
            projMat.uniforms.uOpacity.value = prog;
            if (bubbleRef.current) {
              bubbleRef.current.material.uniforms.uOpacity.value = prog;
            }
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

          if (bubbleRef.current) {
            bubbleRef.current.quaternion.copy(targetScan.quaternion);
            bubbleRef.current.position.copy(targetScan.positionVec);
            bubbleRef.current.material.uniforms.uCubeMap.value = nextCubeMap;
            bubbleRef.current.material.uniforms.uNextCubeMap.value = nextCubeMap;
            bubbleRef.current.material.uniforms.uTransitionProgress.value = 1.0;
            bubbleRef.current.material.uniforms.uOpacity.value = 1.0;
            bubbleRef.current.visible = true;
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

          if (scanSpheresRef.current) {
            scanSpheresRef.current.visible = true;
          }

          // Progressive Resolution Upgrade (256 -> 512 -> 1024 -> 2048)
          textureManager.loadKTX2(nextScanIdNum, '512').then((tex512) => {
            if (activeScanIdRef.current === targetScanId && bubbleRef.current) {
              bubbleRef.current.material.uniforms.uCubeMap.value = tex512;
              textureManager.loadKTX2(nextScanIdNum, '1024').then((tex1024) => {
                if (activeScanIdRef.current === targetScanId && bubbleRef.current) {
                  bubbleRef.current.material.uniforms.uCubeMap.value = tex1024;
                  textureManager.loadKTX2(nextScanIdNum, '2048').then((tex2048) => {
                    if (activeScanIdRef.current === targetScanId && bubbleRef.current) {
                      bubbleRef.current.material.uniforms.uCubeMap.value = tex2048;
                    }
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
          }).catch(() => {});

          // Preload nearest 5 scan bases in background
          preloadNearestScans(targetScanId);
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
  }, [cameraRef, controlsRef, dummyTex, keyboardEnabledRef, preloadNearestScans]);

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

    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. Measurement Mode Click
      if (measurementModeRef.current) {
        const targets = [];
        if (modelRef.current) targets.push(modelRef.current);
        const hits = raycaster.intersectObjects(targets, true);
        if (hits.length > 0 && onMeasurementClickRef.current) {
          onMeasurementClickRef.current(hits[0].point);
        }
        return;
      }

      // 2. Tag Mode Click (Create Tag)
      if (tagModeRef.current) {
        const targets = [];
        if (modelRef.current) targets.push(modelRef.current);
        const hits = raycaster.intersectObjects(targets, true);
        if (hits.length > 0 && onTagClickRef.current) {
          onTagClickRef.current(hits[0].point);
        }
        return;
      }

      // 3. Area Pointer Click
      if (pointersModeRef.current) {
        const targets = [];
        if (modelRef.current) targets.push(modelRef.current);
        const hits = raycaster.intersectObjects(targets, true);
        if (hits.length > 0 && onPointerClickRef.current) {
          onPointerClickRef.current(hits[0].point);
        }
        return;
      }

      // 4. Tag Marker Selection
      const tagGroup = sceneRef.current?.getObjectByName('tagMarkers');
      if (tagGroup) {
        const tagHits = raycaster.intersectObjects(tagGroup.children, true);
        if (tagHits.length > 0) {
          const sprite = tagHits[0].object;
          if (onTagSelectRef.current) {
            onTagSelectRef.current(sprite.userData.tagData || sprite.userData.tagId);
          } else {
            setActiveTagInfo(sprite.userData.tagData);
          }
          return;
        }
      }

      // 5. Scan Marker Teleport Click
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
    return () => renderer.domElement.removeEventListener('click', onClick);
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
    activeScanId: activeScanIdRef.current,
  }), [sceneRef, cameraRef, rendererRef, modelRef, controlsRef, scansData, scanSpheres, staging, tourDetails, viewerState, triggerTransition]);

  return (
    <div className="viewer-viewport-relative" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

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
    </div>
  );
});

IndustrialTourViewer.displayName = 'IndustrialTourViewer';
export default IndustrialTourViewer;
