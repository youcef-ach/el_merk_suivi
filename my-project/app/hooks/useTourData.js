import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createAreaPointerGroup } from '../utils/createAreaPointerGraphics';
import { createTagSpriteMaterial } from './useTags';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Inject BVH methods into Three.js prototypes
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// DO NOT globally override THREE.Mesh.prototype.raycast as it breaks InstancedMesh.
// Instead, we will assign it directly to the GLB child meshes.

/**
 * Handles loading GLB models, scan coordinates, and initializing Dual Panorama boxes.
 * 
 * @param {React.MutableRefObject<THREE.Scene>} sceneRef 
 * @param {THREE.Texture} dummyTex 
 */

export const useTourData = (sceneRef, dummyTex, tourId, sceneReady, rendererRef, cameraRef) => {

  const modelRef = useRef(null);

  // Dual Box Refs
  const box1Ref = useRef(null);
  const panoramaGroup1Ref = useRef(null);
  const box2Ref = useRef(null);
  const panoramaGroup2Ref = useRef(null);

  // State for loaded entities to trigger re-renders or allow interaction
  const [scanSpheres, setScanSpheres] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;

    const initEngine = async () => {
      let glbUrl = null;
      let jsonUrl = null;
      let tourTags = [];
      let tourAreaPointers = [];

      if (!tourId) {
        return;
      }

      try {
        const token = localStorage.getItem('access_token');
        if (!token || token === 'undefined') throw new Error("Missing authentication token in browser");

        const res = await fetch(`http://197.140.9.103/api/inspections/${tourId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Tour fetch failed: ${res.status} ${errText}`);
        }

        const tour = await res.json();
        if (tour.glbModelUrl) {
          glbUrl = `http://197.140.9.103/virtual-inspections/${tour.glbModelUrl}`;
        } else {
          throw new Error('This tour has no GLB architecture model attached to it.');
        }

        if (tour.scansJsonUrl) {
          jsonUrl = `http://197.140.9.103/virtual-inspections/${tour.scansJsonUrl}`;
        } else {
          throw new Error('This tour has no Scan telemetry mapping attached to it.');
        }

        // Capture tags from the tour data for rendering
        if (tour.tags && tour.tags.length > 0) {
          tourTags = tour.tags;
        }
        if (tour.areaPointers && tour.areaPointers.length > 0) {
          tourAreaPointers = tour.areaPointers;
        }
      } catch (err) {
        console.error("CRITICAL ENGINE ERROR:", err.message);
        alert("Engine Initialization Failed: " + err.message);
        return; // Strictly abort engine
      }

      // Load GLB model and scan JSON in parallel
      const glbPromise = new Promise((resolve, reject) => {
        const gltfLoader = new GLTFLoader();
        
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        gltfLoader.setDRACOLoader(dracoLoader);

        if (rendererRef && rendererRef.current) {
          const ktx2Loader = new KTX2Loader()
            .setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/')
            .detectSupport(rendererRef.current)
            .setWorkerLimit(Math.max(1, (navigator.hardwareConcurrency || 4) - 1)); // Use background workers
          gltfLoader.setKTX2Loader(ktx2Loader);
        }
        
        gltfLoader.setMeshoptDecoder(MeshoptDecoder);

        gltfLoader.load(glbUrl, resolve, undefined, reject);
      });

      const jsonPromise = fetch(jsonUrl).then((res) => {
        if (!res.ok) throw new Error("JSON endpoint returned " + res.status);
        return res.json();
      });

      Promise.all([glbPromise, jsonPromise])
        .then(([gltf, scanData]) => {
          // --- Setup GLB model (MeshBasicMaterial — no lighting needed) ---
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              const oldMats = Array.isArray(child.material) ? child.material : [child.material];
              const newMats = oldMats.map(m => {
                const basic = new THREE.MeshBasicMaterial({
                  map: m.map || null,
                  color: m.color || 0xffffff,
                  transparent: false, // Prevents GPU depth-sorting lag
                  side: m.side,
                });
                m.dispose();
                return basic;
              });
              child.material = newMats.length === 1 ? newMats[0] : newMats;

              // 2. Freeze Transformation Matrices (Massive CPU saver)
              child.matrixAutoUpdate = false;
              child.updateMatrix();

              if (child.geometry) {
                // 3. Ensure Frustum Culling is Accurate
                // Sometimes compressed GLBs have corrupted bounding boxes.
                // We must force recalculate them so they don't render when behind the camera.
                child.geometry.computeBoundingBox();
                child.geometry.computeBoundingSphere();

                // Generate BVH spatial index for ultra-fast raycasting
                child.geometry.computeBoundsTree();
                child.raycast = acceleratedRaycast; // Only apply to GLB meshes
              }
            }
          });
          scene.add(gltf.scene);
          modelRef.current = gltf.scene;

          // Pre-compile shaders to prevent massive GPU stutter on first frame render
          if (rendererRef && rendererRef.current && cameraRef && cameraRef.current) {
            rendererRef.current.compile(scene, cameraRef.current);
          }

          setIsModelLoaded(true);

          // Compute the floor level: bbox.min.z is the absolute bottom of the model
          // (which may include sub-floor geometry like pillars/slabs below the walkable surface).
          // Using min.z + 15% of total height reliably lands on the actual floor plane.
          const bbox = new THREE.Box3().setFromObject(gltf.scene);
          const modelHeight = bbox.max.z - bbox.min.z;
          const floorZ = bbox.min.z + modelHeight * 0.15 + 0.02;
          console.log('[useTourData] bbox:', bbox.min.z.toFixed(3), bbox.max.z.toFixed(3), '→ floorZ:', floorZ.toFixed(3));

          // --- Place scan rings on the model floor ---
          const ringGeo = new THREE.RingGeometry(0.1, 0.15, 32);
          const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true });

          const instancedMesh = new THREE.InstancedMesh(ringGeo, markerMat, scanData.length);
          instancedMesh.renderOrder = 10;
          
          const dummy = new THREE.Object3D();
          const scanMetadata = [];

          // scanData is an array of { #name, x, y, alt, rotation_quaternion }
          scanData.forEach((data, i) => {
            const scanKey = data['#name'];
            const posX = data.x;
            const posY = data.y;
            const posZ = data.alt;

            dummy.position.set(posX, posY, posZ);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);

            scanMetadata.push({
              id: scanKey,
              realPosition: new THREE.Vector3(posX, posY, posZ),
              snappedPosition: new THREE.Vector3(posX, posY, posZ), // Will be updated by raycaster
              rotation_quaternion: data.rotation_quaternion,
              instanceId: i,
              isVisible: true // Track visibility state for distance thresholding
            });
          });

          instancedMesh.instanceMatrix.needsUpdate = true;
          instancedMesh.computeBoundingSphere(); // CRITICAL FIX: required for raycaster to hit instances!
          instancedMesh.userData = { isScanRings: true, metadata: scanMetadata };
          scene.add(instancedMesh);

          setScanSpheres([instancedMesh]);

          // --- Render Tag Sprites ---
          // Only create base tag sprites if useTags (studio) hasn't already created the group.
          // This ensures tags are visible in the engine view (read-only) and avoids
          // duplicates in studio where useTags manages its own interactive sprites.
          if (tourTags.length > 0 && !scene.getObjectByName('tagMarkers')) {
            const tagGroup = new THREE.Group();
            tagGroup.name = 'tagMarkers';
            tagGroup.renderOrder = 998;

            tourTags.forEach((tag) => {
              const mat = createTagSpriteMaterial(tag.title, tag.icon, tag.color, false);
              mat.depthTest = false; // Always float on top of geometry, same as Studio

              const sprite = new THREE.Sprite(mat);
              sprite.position.set(tag.posX, tag.posY, tag.posZ);
              sprite.center.set(0.5, 0.0);

              const sizeMult = tag.size ?? 1.0;
              sprite.scale.set(0.4 * sizeMult, 0.6 * sizeMult, 1);

              sprite.renderOrder = 1000;
              sprite.userData.tagId = tag.id;
              tagGroup.add(sprite);
            });

            scene.add(tagGroup);
            console.log(`[useTourData] Rendered ${tourTags.length} tag sprite(s)`);
          }

          // --- Render Area Pointers ---
          if (tourAreaPointers.length > 0 && !scene.getObjectByName('areaPointers')) {
            const areaPointersGroup = new THREE.Group();
            areaPointersGroup.name = 'areaPointers';
            areaPointersGroup.renderOrder = 997; // Just below tags

            tourAreaPointers.forEach(ap => {
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
              areaPointersGroup.add(ptr);
            });
            scene.add(areaPointersGroup);
            console.log(`[useTourData] Rendered ${tourAreaPointers.length} area pointer(s)`);
          }

          const createPanoramaBox = () => {
            const boxMaterials = Array(6).fill(0).map(() =>
              new THREE.MeshBasicMaterial({
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                map: dummyTex
              })
            );
            const group = new THREE.Group();
            const boxGeo = new THREE.BoxGeometry(20, 20, 20);
            boxGeo.scale(-1, 1, 1);
            const texturedBox = new THREE.Mesh(boxGeo, boxMaterials);
            texturedBox.rotation.x = Math.PI / 2;
            texturedBox.visible = false;

            texturedBox.renderOrder = -1;
            texturedBox.frustumCulled = false;

            group.add(texturedBox);
            scene.add(group);
            return { group, texturedBox };
          };

          const pano1 = createPanoramaBox();
          panoramaGroup1Ref.current = pano1.group;
          box1Ref.current = pano1.texturedBox;

          const pano2 = createPanoramaBox();
          panoramaGroup2Ref.current = pano2.group;
          box2Ref.current = pano2.texturedBox;

          setIsDataLoaded(true);
        })
        .catch(err => {
          alert("MinIO Scans JSON Fetch Failed: " + err.message);
          console.error("Error loading scan data:", err);
        });
    };

    initEngine();
  }, [sceneRef, dummyTex, tourId, sceneReady]);

  // --- Snap Scan Spheres to Floor ---
  useEffect(() => {
    if (!isModelLoaded || !isDataLoaded || scanSpheres.length === 0 || !modelRef.current) return;

    // Force matrix update to ensure raycaster checks accurate geometry coordinates
    modelRef.current.updateMatrixWorld(true);

    // Temporarily set all model materials to DoubleSide so the downward ray
    // hits floor meshes regardless of normal direction (floors typically have
    // upward normals, which would cause FrontSide materials to ignore our
    // downward ray — making it pass through and hit the wrong floor).
    const originalSides = [];
    modelRef.current.traverse((child) => {
      if (child.isMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          originalSides.push({ mat, side: mat.side });
          mat.side = THREE.DoubleSide;
        });
      }
    });

    const instancedMesh = scanSpheres[0];
    if (!instancedMesh || !instancedMesh.isInstancedMesh) {
      originalSides.forEach(({ mat, side }) => { mat.side = side; });
      return;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true; // BVH optimization flag: stops searching after the first hit
    const downVector = new THREE.Vector3(0, 0, -1);
    const dummy = new THREE.Object3D();

    instancedMesh.userData.metadata.forEach((data) => {
      const startPos = data.realPosition.clone();
      
      raycaster.set(startPos, downVector);
      const intersects = raycaster.intersectObject(modelRef.current, true);

      let floorZ = startPos.z - 1.6;
      if (intersects.length > 0) {
        floorZ = intersects[0].point.z + 0.05;
      }
      
      data.snappedPosition = new THREE.Vector3(startPos.x, startPos.y, floorZ);
      dummy.position.copy(data.snappedPosition);
      
      // If this scan is currently active, hide it (scale 0), otherwise scale 1
      // However, at initial load, no sphere is active yet, so just scale 1
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(data.instanceId, dummy.matrix);
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.computeBoundingSphere(); // Update bounding sphere again

    // Restore original material sides
    originalSides.forEach(({ mat, side }) => { mat.side = side; });

  }, [isModelLoaded, isDataLoaded, scanSpheres]);

  const loadPanoramaTextures = (scanId, renderer) => {
    return new Promise((resolve) => {
      const bitmapLoader = new THREE.ImageBitmapLoader();
      bitmapLoader.setOptions({ imageOrientation: 'flipY' });
      const faces = ['py', 'pz', 'px', 'nz', 'nx', 'ny'];

      const baseUrl = tourId
        ? `http://197.140.9.103/virtual-inspections/inspections/${tourId}/`
        : `/`;

      const loadPromises = faces.map((face) => {
        return new Promise((resFace) => {
          bitmapLoader.load(`${baseUrl}images/${scanId}_${face}.jpg`, (imageBitmap) => {
            const tex = new THREE.Texture(imageBitmap);
            tex.colorSpace = THREE.SRGBColorSpace; // CRITICAL: Treat JPEG as sRGB to prevent washed-out colors
            tex.needsUpdate = true;
            if (renderer) renderer.initTexture(tex);
            resFace(tex);
          });
        });
      });

      Promise.all(loadPromises).then(resolve);
    });
  };

  return {
    modelRef,
    box1Ref,
    panoramaGroup1Ref,
    box2Ref,
    panoramaGroup2Ref,
    scanSpheres,
    isDataLoaded,
    loadPanoramaTextures
  };
};
