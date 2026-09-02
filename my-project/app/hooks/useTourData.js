import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createAreaPointerGroup } from '../utils/createAreaPointerGraphics';
import { createTagSpriteMaterial } from './useTags';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { DepthWarpedPanoramaShader, ProjectiveMeshShader } from '../shaders/HybridProjectiveShaders';
import { loadDepthCube, loadColorCube, fetchDepthRanges } from '../utils/depthCubeLoader';
import { textureManager } from '../utils/TextureManager';
import { MINIO_URL, API_URL } from '../config/api';

// Inject BVH methods into Three.js prototypes
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

/**
 * Handles loading GLB models, scan coordinates, and initializing Dual Panorama boxes.
 * 
 * @param {React.MutableRefObject<THREE.Scene>} sceneRef 
 * @param {THREE.Texture} dummyTex 
 */
export const useTourData = (sceneRef, dummyTex, tourId, sceneReady, rendererRef, cameraRef, activeProfileId, activeFloor = 'all') => {

  const modelRef = useRef(null);
  
  // The Magic Bubble (Depth-Warped Panorama)
  const magicBubbleRef = useRef(null);

  // We need the Projective Material to apply to the global mesh
  const projectiveMaterialRef = useRef(null);

  // Depth ranges metadata
  const depthRangesRef = useRef({});

  // State for loaded entities to trigger re-renders or allow interaction
  const [scanSpheres, setScanSpheres] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [scansData, setScansData] = useState([]);
  const stagingProfilesRef = useRef([]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;

    const initEngine = async () => {
      let glbUrl = null;
      let jsonUrl = null;
      let tourTags = [];
      let tourAreaPointers = [];

      if (tourId) {
        glbUrl = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/model.glb`;
        jsonUrl = `${MINIO_URL}/virtual-inspections/inspections/${tourId}/scans.json`;
        textureManager.setBasePath(tourId);
      } else {
        glbUrl = '/model/building_draco.glb';
        jsonUrl = '/data/scan_positions.json';
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
            .setWorkerLimit(Math.max(1, (navigator.hardwareConcurrency || 4) - 1));
          gltfLoader.setKTX2Loader(ktx2Loader);
        }
        
        gltfLoader.setMeshoptDecoder(MeshoptDecoder);

        gltfLoader.load(glbUrl, resolve, undefined, reject);
      });

      const jsonPromise = fetch(jsonUrl).then((res) => {
        if (!res.ok) throw new Error("JSON endpoint returned " + res.status);
        return res.json();
      });

      const metaUrl = tourId 
        ? `${MINIO_URL}/virtual-inspections/inspections/${tourId}/scan_metadata.json` 
        : '/panoramas_native/scan_metadata.json';
      const metaPromise = fetch(metaUrl).then(res => res.json()).catch(() => ({}));

      // Depth ranges
      const depthJsonPromise = fetch('/depth_cube/depth_ranges.json').then(res => res.json()).catch(() => ({}));

      Promise.all([glbPromise, jsonPromise, depthJsonPromise, metaPromise])
        .then(([gltf, rawScanData, depthRanges, metaData]) => {
          depthRangesRef.current = depthRanges;
          const scanData = Array.isArray(rawScanData) ? rawScanData : rawScanData.scans || [];
          
          // --- Setup Projective Material for the Global Mesh ---
          const projMat = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(ProjectiveMeshShader.uniforms),
            vertexShader: ProjectiveMeshShader.vertexShader,
            fragmentShader: ProjectiveMeshShader.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: true,
          });
          projectiveMaterialRef.current = projMat;

          // --- Setup GLB model ---
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              const oldMats = Array.isArray(child.material) ? child.material : [child.material];
              const newMats = oldMats.map(m => {
                const basic = new THREE.MeshBasicMaterial({
                  map: m.map || null,
                  color: m.color || 0xffffff,
                  transparent: false,
                  side: m.side,
                });
                m.dispose();
                return basic;
              });
              child.material = newMats.length === 1 ? newMats[0] : newMats;

              child.userData.originalBasicMaterial = child.material;
              child.userData.projectiveMaterial = projMat;

              child.matrixAutoUpdate = false;
              child.updateMatrix();

              if (child.geometry) {
                child.geometry.computeBoundingBox();
                child.geometry.computeBoundingSphere();
                child.geometry.computeBoundsTree();
                child.raycast = acceleratedRaycast;
              }
            }
          });
          
          gltf.scene.visible = true;
          scene.add(gltf.scene);
          modelRef.current = gltf.scene;

          if (rendererRef && rendererRef.current && cameraRef && cameraRef.current) {
            rendererRef.current.compile(scene, cameraRef.current);
          }

          setIsModelLoaded(true);

          // Place scan rings on the model floor
          const ringGeo = new THREE.RingGeometry(0.1, 0.15, 32);
          const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true });

          const instancedMesh = new THREE.InstancedMesh(ringGeo, markerMat, scanData.length);
          instancedMesh.renderOrder = 10;
          
          const dummy = new THREE.Object3D();
          const scanMetadata = [];
          
          setScansData(scanData);

          scanData.forEach((data, i) => {
            const scanKey = data.id || data['#name'];
            const posX = data.position ? data.position.x : data.x;
            const posY = data.position ? data.position.y : data.y;
            const posZ = data.position ? data.position.z : data.alt;
            const metaQuat = metaData && metaData[scanKey]?.quaternion_xyzw;
            const rotQuat = metaQuat || data.rotation_quaternion;

            dummy.position.set(posX, posY, posZ);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);

            scanMetadata.push({
              id: scanKey,
              realPosition: new THREE.Vector3(posX, posY, posZ),
              snappedPosition: new THREE.Vector3(posX, posY, posZ),
              rotation_quaternion: rotQuat,
              floor_level: data.floor_level,
              instanceId: i,
              isVisible: true
            });
          });

          instancedMesh.instanceMatrix.needsUpdate = true;
          instancedMesh.computeBoundingSphere();
          instancedMesh.userData = { isScanRings: true, metadata: scanMetadata };
          scene.add(instancedMesh);

          setScanSpheres([instancedMesh]);

          // Render Tag Sprites
          if (tourTags.length > 0 && !scene.getObjectByName('tagMarkers')) {
            const tagGroup = new THREE.Group();
            tagGroup.name = 'tagMarkers';
            tagGroup.renderOrder = 998;

            tourTags.forEach((tag) => {
              const mat = createTagSpriteMaterial(tag.title, tag.icon, tag.color, false);
              mat.depthTest = false;

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
          }

          // Render Area Pointers
          if (tourAreaPointers.length > 0 && !scene.getObjectByName('areaPointers')) {
            const areaPointersGroup = new THREE.Group();
            areaPointersGroup.name = 'areaPointers';
            areaPointersGroup.renderOrder = 997;

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
          }

          // Create The Magic Bubble (Box for Depth Warping)
          const bubbleGeo = new THREE.BoxGeometry(20, 20, 20, 64, 64, 64);
          
          const bubbleMat = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(DepthWarpedPanoramaShader.uniforms),
            vertexShader: DepthWarpedPanoramaShader.vertexShader,
            fragmentShader: DepthWarpedPanoramaShader.fragmentShader,
            glslVersion: DepthWarpedPanoramaShader.glslVersion,
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide
          });

          const dummyCube = new THREE.CubeTexture([
            document.createElement('canvas'), document.createElement('canvas'),
            document.createElement('canvas'), document.createElement('canvas'),
            document.createElement('canvas'), document.createElement('canvas')
          ]);
          dummyCube.needsUpdate = true;
          bubbleMat.uniforms.uColorCube.value = dummyCube;
          bubbleMat.uniforms.uNextColorCube.value = dummyCube;
          bubbleMat.uniforms.uDepthCube.value = dummyCube;

          const magicBubble = new THREE.Mesh(bubbleGeo, bubbleMat);
          magicBubble.renderOrder = -1;
          magicBubble.frustumCulled = false;
          magicBubble.visible = false;
          
          scene.add(magicBubble);
          magicBubbleRef.current = magicBubble;

          setIsDataLoaded(true);
        })
        .catch(err => {
          console.error("Error loading scan data:", err);
        });
    };

    initEngine();
  }, [sceneRef, dummyTex, tourId, sceneReady]);

  // Snap Scan Spheres to Floor with BVH
  useEffect(() => {
    if (!isModelLoaded || !isDataLoaded || scanSpheres.length === 0 || !modelRef.current) return;

    modelRef.current.updateMatrixWorld(true);

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
    raycaster.firstHitOnly = true;
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
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(data.instanceId, dummy.matrix);
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.computeBoundingSphere();

    originalSides.forEach(({ mat, side }) => { mat.side = side; });

  }, [isModelLoaded, isDataLoaded, scanSpheres]);

  const loadPanoramaTextures = (scanId, renderer) => {
    return new Promise((resolve) => {
      let colorCube = null;
      let depthCube = null;
      let equirectTexture = null;
      let ranges = null;
      let loadedCount = 0;
      const TOTAL = 4;

      const checkComplete = () => {
        if (loadedCount < TOTAL) return;
        const r = (ranges && ranges[scanId]) || { min_m: 0.1, max_m: 15.0 };
        resolve({ colorCube, depthCube, equirectTexture, minDepth: r.min_m, maxDepth: r.max_m });
      };

      const cleanId = String(scanId).replace(/^scan_/, '');
      let colorPromise;
      if (renderer) {
        textureManager.init(renderer);
        colorPromise = textureManager.loadCubeMap(cleanId)
          .catch(() => loadColorCube(scanId));
      } else {
        colorPromise = loadColorCube(scanId);
      }

      colorPromise.then((cube) => {
        if (renderer && renderer.initTexture && cube) {
          try { renderer.initTexture(cube); } catch (e) {}
        }
        colorCube = cube;
        loadedCount++;
        checkComplete();
      }).catch(() => {
        console.warn('Failed to load color cube for', scanId);
        loadedCount++;
        checkComplete();
      });

      loadDepthCube(scanId).then((cube) => {
        if (renderer && renderer.initTexture && cube) {
          try { renderer.initTexture(cube); } catch (e) {}
        }
        depthCube = cube;
        loadedCount++;
        checkComplete();
      }).catch(() => {
        console.warn('Failed to load depth cube for', scanId);
        loadedCount++;
        checkComplete();
      });

      const normalizedScanId = String(scanId).replace(/^scan_/, '');
      let equirectUrl = tourId 
        ? `${MINIO_URL}/virtual-inspections/inspections/${tourId}/equirect_low/scan_${normalizedScanId}_equirect_low.jpg`
        : `/equirect_low/scan_${normalizedScanId}_equirect_low.jpg`;

      new THREE.TextureLoader().load(
        equirectUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          if (renderer && renderer.initTexture) {
            try { renderer.initTexture(texture); } catch (e) {}
          }
          equirectTexture = texture;
          loadedCount++;
          checkComplete();
        },
        undefined,
        (err) => {
          console.warn('Failed to load equirect texture for', scanId, err);
          loadedCount++;
          checkComplete();
        }
      );

      fetchDepthRanges().then((r) => {
        ranges = r;
        loadedCount++;
        checkComplete();
      }).catch(() => {
        loadedCount++;
        checkComplete();
      });
    });
  };

  return {
    modelRef,
    magicBubbleRef,
    projectiveMaterialRef,
    scanSpheres,
    isDataLoaded,
    loadPanoramaTextures,
    scansData
  };
};
