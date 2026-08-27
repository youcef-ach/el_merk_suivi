import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createAreaPointerGroup } from '../utils/createAreaPointerGraphics';
import { createTagSpriteMaterial } from './useTags';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { TilesetEngine } from '../utils/TilesetEngine';
import { OrthomosaicLayer } from '../utils/OrthomosaicLayer';
import { API_URL, MINIO_URL } from '../config/api';

// Inject BVH methods into Three.js prototypes
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

/**
 * Enhanced useTourData:
 * Supports Cesium 3D Tiles (via 3d-tiles-renderer), GLTF/GLB models,
 * Georeferenced Orthomosaics, 360° Panorama dual-box fading,
 * Red scan rings instanced mesh, and Drone Survey deliverables.
 */
export const useTourData = (sceneRef, dummyTex, tourId, sceneReady, rendererRef, cameraRef, activeProfileId, beforeRenderCallbacksRef) => {
  const modelRef = useRef(null);
  const tilesetEngineRef = useRef(null);
  const orthoLayerRef = useRef(null);

  // Dual Box Refs for 360 Panoramas
  const box1Ref = useRef(null);
  const panoramaGroup1Ref = useRef(null);
  const box2Ref = useRef(null);
  const panoramaGroup2Ref = useRef(null);

  // State for loaded entities
  const [scanSpheres, setScanSpheres] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [scansData, setScansData] = useState([]);
  const [tourDetails, setTourDetails] = useState(null);
  const stagingProfilesRef = useRef([]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady || !tourId) return;

    let isSubscribed = true;

    const initEngine = async () => {
      let glbUrl = null;
      let jsonUrl = null;
      let tilesetUrl = null;
      let orthoUrl = null;
      let tourTags = [];
      let tourAreaPointers = [];

      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch(`${API_URL}/inspections/${tourId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Tour fetch failed: ${res.status} ${errText}`);
        }

        const tour = await res.json();
        if (!isSubscribed) return;
        setTourDetails(tour);

        // 3D Tileset / RealityScan photogrammetry model
        if (tour.tilesetUrl) {
          tilesetUrl = tour.tilesetUrl.startsWith('http') 
            ? tour.tilesetUrl 
            : `${MINIO_URL}/virtual-inspections/${tour.tilesetUrl}`;
        }

        // Traditional GLB model
        if (tour.glbModelUrl) {
          glbUrl = tour.glbModelUrl.startsWith('http')
            ? tour.glbModelUrl
            : `${MINIO_URL}/virtual-inspections/${tour.glbModelUrl}`;
        }

        // Orthomosaic / Orthoprojection
        if (tour.orthoUrl) {
          orthoUrl = tour.orthoUrl.startsWith('http')
            ? tour.orthoUrl
            : `${MINIO_URL}/virtual-inspections/${tour.orthoUrl}`;
        }

        // Scan telemetry mapping for 360 red rings
        if (tour.scansJsonUrl) {
          jsonUrl = tour.scansJsonUrl.startsWith('http')
            ? tour.scansJsonUrl
            : `${MINIO_URL}/virtual-inspections/${tour.scansJsonUrl}`;
        }

        if (tour.tags && tour.tags.length > 0) tourTags = tour.tags;
        if (tour.areaPointers && tour.areaPointers.length > 0) tourAreaPointers = tour.areaPointers;
        if (tour.stagingProfiles) stagingProfilesRef.current = tour.stagingProfiles;

      } catch (err) {
        console.error("CRITICAL ENGINE ERROR:", err.message);
        return;
      }

      // ─── 1. Load Cesium 3D Tiles if configured ───
      if (tilesetUrl) {
        console.log('[useTourData] Pure 3D Tileset loading via TilesetEngine:', tilesetUrl);
        const engine = new TilesetEngine(scene, cameraRef.current, rendererRef.current);
        engine.loadTileset(tilesetUrl, 'rotX_neg90');
        tilesetEngineRef.current = engine;

        // Register continuous update in main Three.js render frame
        if (beforeRenderCallbacksRef && beforeRenderCallbacksRef.current) {
          beforeRenderCallbacksRef.current.push(() => {
            engine.update();
          });
        }
        setIsDataLoaded(true);
        return; // Pure 3D Tiles only mode as requested
      }
      const glbPromise = glbUrl ? new Promise((resolve, reject) => {
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
      }) : Promise.resolve(null);

      // ─── 4. Load Scans Telemetry for 360 Red Rings ───
      const jsonPromise = jsonUrl ? fetch(jsonUrl).then((res) => {
        if (!res.ok) throw new Error("JSON endpoint returned " + res.status);
        return res.json();
      }).catch(err => {
        console.warn("Scan telemetry fetch notice:", err.message);
        return [];
      }) : Promise.resolve([]);

      Promise.all([glbPromise, jsonPromise])
        .then(([gltf, scanData]) => {
          if (!isSubscribed) return;

          if (gltf) {
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
            scene.add(gltf.scene);
            modelRef.current = gltf.scene;
          }

          setIsModelLoaded(true);

          // ─── 5. Place 360 Scan Red Rings on Floor / Ground ───
          if (Array.isArray(scanData) && scanData.length > 0) {
            const ringGeo = new THREE.RingGeometry(0.12, 0.18, 32);
            const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true });

            const instancedMesh = new THREE.InstancedMesh(ringGeo, markerMat, scanData.length);
            instancedMesh.renderOrder = 10;
            
            const dummy = new THREE.Object3D();
            const scanMetadata = [];
            setScansData(scanData);

            scanData.forEach((data, i) => {
              const scanKey = data['#name'] || `scan_${i}`;
              const posX = data.x || 0;
              const posY = data.y || 0;
              const posZ = data.alt || data.z || 0;

              dummy.position.set(posX, posY, posZ);
              dummy.updateMatrix();
              instancedMesh.setMatrixAt(i, dummy.matrix);

              scanMetadata.push({
                id: scanKey,
                realPosition: new THREE.Vector3(posX, posY, posZ),
                snappedPosition: new THREE.Vector3(posX, posY, posZ),
                rotation_quaternion: data.rotation_quaternion,
                instanceId: i,
                isVisible: true
              });
            });

            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.computeBoundingSphere();
            instancedMesh.userData = { isScanRings: true, metadata: scanMetadata };
            scene.add(instancedMesh);
            setScanSpheres([instancedMesh]);
          }

          // ─── 6. Render Site Inspection Tags ───
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

          // ─── 7. Render Area Pointers ───
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

          // ─── 8. Setup Dual 360 Panorama Cubemaps ───
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
          console.error("Asset loading error:", err);
          setIsDataLoaded(true);
        });
    };

    initEngine();

    return () => {
      isSubscribed = false;
      if (tilesetEngineRef.current) {
        tilesetEngineRef.current.dispose();
        tilesetEngineRef.current = null;
      }
      if (orthoLayerRef.current) {
        orthoLayerRef.current.dispose();
        orthoLayerRef.current = null;
      }
    };
  }, [sceneRef, dummyTex, tourId, sceneReady]);

  // Load Panorama Textures helper
  const loadPanoramaTextures = async (scanId, targetBox) => {
    if (!targetBox || !tourId) return;

    // Check if staged profile has baked panoramas
    const profile = stagingProfilesRef.current.find(p => p.id === activeProfileId);
    const baked = profile?.bakedPanoramas?.filter(p => p.scanId === scanId);

    const faces = ['front', 'back', 'top', 'bottom', 'right', 'left'];
    const faceOrder = [0, 1, 2, 3, 4, 5]; // Box face mapping
    const texLoader = new THREE.TextureLoader();

    const loadPromises = faces.map((face, index) => {
      const bakedFace = baked?.find(b => b.face === face);
      let url = bakedFace ? bakedFace.imageUrl : `${MINIO_URL}/virtual-inspections/${tourId}/panoramas/${scanId}_${face}.jpg`;
      
      return new Promise((resolve) => {
        texLoader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            targetBox.material[faceOrder[index]].map = tex;
            targetBox.material[faceOrder[index]].needsUpdate = true;
            resolve();
          },
          undefined,
          () => {
            // Fallback
            targetBox.material[faceOrder[index]].map = dummyTex;
            targetBox.material[faceOrder[index]].needsUpdate = true;
            resolve();
          }
        );
      });
    });

    await Promise.all(loadPromises);
  };

  return {
    modelRef,
    tilesetEngineRef,
    orthoLayerRef,
    box1Ref,
    panoramaGroup1Ref,
    box2Ref,
    panoramaGroup2Ref,
    scanSpheres,
    loadPanoramaTextures,
    isDataLoaded,
    isModelLoaded,
    scansData,
    tourDetails,
  };
};
