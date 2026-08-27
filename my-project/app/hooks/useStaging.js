import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFurniture } from '../utils/furnitureFactory';
import { getSketchfabDownloadUrl, downloadAndExtractSketchfabGltf } from '../utils/sketchfabService';
import { API_URL as API } from '../config/api';

export const useStaging = (sceneRef, cameraRef, rendererRef, controlsRef, modelRef, isDataLoaded, tourId, activeProfileId) => {
  const getToken = () => localStorage.getItem('access_token');
  const [stagedItems, setStagedItems] = useState([]);
  const [placementModeItem, setPlacementModeItem] = useState(null);
  const [bakedTexturesMap, setBakedTexturesMap] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedDimensions, setSelectedDimensions] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');
  const [uniformScale, setUniformScale] = useState(false);
  const [loadingModelId, setLoadingModelId] = useState(null);

  const stagedGroupRef = useRef(null);
  const transformControlRef = useRef(null);
  const ghostRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const lastValidTransformRef = useRef(null);
  const envRaycasterRef = useRef(new THREE.Raycaster());

  const checkEnvironmentCollision = useCallback((box) => {
    if (!modelRef.current) return false;
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const extents = size.clone().multiplyScalar(0.5);

    const rayOrigin = center.clone();
    rayOrigin.y = box.min.y + Math.min(extents.y, 0.2);

    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(1, 0, 1).normalize(),
      new THREE.Vector3(-1, 0, 1).normalize(),
      new THREE.Vector3(1, 0, -1).normalize(),
      new THREE.Vector3(-1, 0, -1).normalize(),
    ];

    for (const dir of directions) {
      envRaycasterRef.current.set(rayOrigin, dir);
      const hits = envRaycasterRef.current.intersectObject(modelRef.current, true);
      
      const validHits = hits.filter(hit => {
        if (hit.face && hit.face.normal && hit.object) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
          const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          // If the normal is mostly pointing up or down, it's a floor or ceiling.
          // We only care about walls (where the normal is mostly horizontal).
          return Math.abs(worldNormal.y) < 0.7;
        }
        return true;
      });

      if (validHits.length > 0) {
        let tx = dir.x !== 0 ? extents.x / Math.abs(dir.x) : Infinity;
        let tz = dir.z !== 0 ? extents.z / Math.abs(dir.z) : Infinity;
        const maxDist = Math.min(tx, tz);
        
        if (validHits[0].distance < maxDist * 0.95) {
          return true;
        }
      }
    }
    return false;
  }, [modelRef]);

  // Initialize group and transform controls
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !isDataLoaded) return;

    if (!stagedGroupRef.current) {
      stagedGroupRef.current = new THREE.Group();
      stagedGroupRef.current.name = 'staged_furniture_group';
      sceneRef.current.add(stagedGroupRef.current);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      stagedGroupRef.current.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(5, 10, 5);
      stagedGroupRef.current.add(dirLight);
    }

    if (!transformControlRef.current) {
      transformControlRef.current = new TransformControls(cameraRef.current, rendererRef.current.domElement);
      transformControlRef.current.addEventListener('dragging-changed', function (event) {
        if (controlsRef.current) {
          controlsRef.current.enabled = !event.value;
        }
        if (event.value && transformControlRef.current.object) {
          const obj = transformControlRef.current.object;
          lastValidTransformRef.current = {
            position: obj.position.clone(),
            rotation: obj.rotation.clone(),
            scale: obj.scale.clone()
          };
        } else {
          lastValidTransformRef.current = null;
        }
      });
      sceneRef.current.add(transformControlRef.current.getHelper());
    }

    // Load from backend if activeProfileId is set
    if (activeProfileId && tourId) {
      const token = getToken();
      if (token) {
        fetch(`${API}/inspections/${tourId}/staging-profiles/${activeProfileId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(profile => {
            if (profile && profile.stagedItems) {
              const loadedItems = profile.stagedItems.map(item => ({
                id: item.id,
                isPolyHaven: item.isPolyHaven,
                isSketchfab: item.isSketchfab,
                polyHavenId: item.polyHavenId,
                sketchfabId: item.sketchfabId,
                type: item.type,
                color: item.color,
                dimensions: item.dimensions,
                position: [item.positionX, item.positionY, item.positionZ],
                rotation: [item.rotationX, item.rotationY, item.rotationZ],
                scale: [item.scaleX, item.scaleY, item.scaleZ]
              }));
              setStagedItems(loadedItems);
              loadedItems.forEach(item => spawnFurnitureMesh(item));
            }
          })
          .catch(e => console.error("Failed to load staging config", e));
      }
    }

    return () => {
      if (transformControlRef.current) {
        transformControlRef.current.detach();
        sceneRef.current.remove(transformControlRef.current.getHelper());
        transformControlRef.current.dispose();
        transformControlRef.current = null;
      }
    };
  }, [isDataLoaded, tourId, activeProfileId]);

  // Update TransformControl mode
  useEffect(() => {
    if (transformControlRef.current) {
      transformControlRef.current.setMode(transformMode);
      if (transformMode === 'scale' && uniformScale) {
        transformControlRef.current.showX = false;
        transformControlRef.current.showY = false;
        transformControlRef.current.showZ = false;
      } else {
        transformControlRef.current.showX = true;
        transformControlRef.current.showY = true;
        transformControlRef.current.showZ = true;
      }
      // For floor items, translating on Y (up/down) is often bad, but let's allow 3D movement for now
      // Or restrict to XZ plane if desired.
    }
  }, [transformMode, uniformScale]);

  // Remove local storage autosave, we will save manually via an explicit save button
  // ─── Save Staged Items ──────────────────────────────
  const saveStagedItems = async () => {
    if (!tourId || !activeProfileId) return false;
    const token = getToken();
    if (!token) return false;

    try {
      const res = await fetch(`${API}/inspections/${tourId}/staging-profiles/${activeProfileId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ items: stagedItems }),
      });
      if (!res.ok) throw new Error('Failed to save staging items');
      return true;
    } catch (err) {
      console.error('Save staging failed:', err);
      return false;
    }
  };

  const loadedModelsCache = useRef({});

  const load3DModel = async (itemData) => {
    const cacheKey = itemData.isSketchfab ? itemData.sketchfabId : 
                     itemData.isPolyHaven ? itemData.polyHavenId : 
                     itemData.isLocalModel ? itemData.id : null;
                     
    if (!cacheKey) return null;
    
    if (loadedModelsCache.current[cacheKey]) {
      return loadedModelsCache.current[cacheKey];
    }

    return new Promise((resolve, reject) => {
      if (itemData.isPolyHaven) {
        fetch(`https://api.polyhaven.com/files/${itemData.polyHavenId}`)
          .then(res => res.json())
          .then(data => {
            const gltfEntry = data.gltf?.['1k']?.gltf || data.gltf?.['2k']?.gltf || data.gltf?.['4k']?.gltf;
            if (gltfEntry && gltfEntry.url) {
              const gltfUrl = gltfEntry.url;
              const includeMap = gltfEntry.include || {};
              const textureUrlMap = {};
              for (const [relativePath, fileInfo] of Object.entries(includeMap)) {
                if (fileInfo.url) textureUrlMap[relativePath] = fileInfo.url;
              }

              const manager = new THREE.LoadingManager();
              const gltfBaseUrl = gltfUrl.substring(0, gltfUrl.lastIndexOf('/') + 1);
              manager.resolveURL = (url) => {
                if (url.startsWith(gltfBaseUrl)) {
                  const relativePath = url.substring(gltfBaseUrl.length);
                  if (textureUrlMap[relativePath]) return textureUrlMap[relativePath];
                }
                for (const [relPath, absUrl] of Object.entries(textureUrlMap)) {
                  if (url.endsWith(relPath)) return absUrl;
                }
                return url;
              };

              const loader = new GLTFLoader(manager);
              loader.setCrossOrigin('anonymous');
              loader.load(
                gltfUrl,
                (gltf) => {
                  gltf.scene.scale.set(1, 1, 1);
                  gltf.scene.traverse(child => {
                    if (child.isMesh) {
                      child.castShadow = true;
                      child.receiveShadow = true;
                      if (child.material) {
                        const materials = Array.isArray(child.material) ? child.material : [child.material];
                        materials.forEach(m => {
                          if (m.color && m.userData.originalColor === undefined) {
                            m.userData.originalColor = m.color.getHex();
                          }
                        });
                      }
                    }
                  });
                  loadedModelsCache.current[cacheKey] = gltf.scene;
                  resolve(gltf.scene);
                },
                undefined,
                reject
              );
            } else {
              reject(new Error('No GLTF entry found'));
            }
          })
          .catch(reject);

      } else if (itemData.isSketchfab) {
        const sfToken = localStorage.getItem('sketchfab_token') || undefined;
        getSketchfabDownloadUrl(itemData.sketchfabId, sfToken)
          .then(zipUrl => downloadAndExtractSketchfabGltf(zipUrl))
          .then(({ gltfUrl, blobUrls, cleanup }) => {
            const manager = new THREE.LoadingManager();
            manager.resolveURL = (url) => {
              for (const [relPath, blobUrl] of Object.entries(blobUrls)) {
                if (url.endsWith(relPath)) return blobUrl;
              }
              return url;
            };

            const loader = new GLTFLoader(manager);
            loader.setCrossOrigin('anonymous');
            loader.load(
              gltfUrl,
              (gltf) => {
                cleanup();
                const box = new THREE.Box3().setFromObject(gltf.scene);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                if (maxDim > 5) {
                  const scale = 2.0 / maxDim;
                  gltf.scene.scale.setScalar(scale);
                }

                gltf.scene.traverse(child => {
                  if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                      const materials = Array.isArray(child.material) ? child.material : [child.material];
                      const basicMaterials = materials.map(m => {
                        const basic = new THREE.MeshBasicMaterial({
                          map: m.map || null,
                          color: m.color || 0xffffff,
                          transparent: m.transparent || false,
                          opacity: m.opacity || 1,
                          side: m.side || THREE.FrontSide,
                          alphaTest: m.alphaTest || 0,
                          depthTest: true,
                          depthWrite: true
                        });
                        basic.userData.originalColor = basic.color.getHex();
                        m.dispose();
                        return basic;
                      });
                      child.material = Array.isArray(child.material) ? basicMaterials : basicMaterials[0];
                    }
                  }
                });
                loadedModelsCache.current[cacheKey] = gltf.scene;
                resolve(gltf.scene);
              },
              undefined,
              (err) => {
                cleanup();
                reject(err);
              }
            );
          })
          .catch(reject);
      } else if (itemData.isLocalModel) {
        const loader = new GLTFLoader();
        loader.load(
          itemData.modelUrl,
          (gltf) => {
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 5) {
              const scale = 2.0 / maxDim;
              gltf.scene.scale.setScalar(scale);
            }

            gltf.scene.traverse(child => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                  const materials = Array.isArray(child.material) ? child.material : [child.material];
                  const basicMaterials = materials.map(m => {
                    const basic = new THREE.MeshBasicMaterial({
                      map: m.map || null,
                      color: m.color || 0xffffff,
                      transparent: m.transparent || false,
                      opacity: m.opacity || 1,
                      side: m.side || THREE.FrontSide,
                      alphaTest: m.alphaTest || 0,
                      depthTest: true,
                      depthWrite: true
                    });
                    basic.userData.originalColor = basic.color.getHex();
                    m.dispose();
                    return basic;
                  });
                  child.material = Array.isArray(child.material) ? basicMaterials : basicMaterials[0];
                }
              }
            });
            loadedModelsCache.current[cacheKey] = gltf.scene;
            resolve(gltf.scene);
          },
          undefined,
          reject
        );
      }
    });
  };

  const spawnFurnitureMesh = (itemData) => {
    const group = new THREE.Group();
    group.position.fromArray(itemData.position);
    group.rotation.fromArray(itemData.rotation);
    group.scale.fromArray(itemData.scale);
    group.userData = { isStagedItem: true, id: itemData.id, isPolyHaven: itemData.isPolyHaven, polyHavenId: itemData.polyHavenId, isSketchfab: itemData.isSketchfab, sketchfabId: itemData.sketchfabId, isLocalModel: itemData.isLocalModel, modelUrl: itemData.modelUrl };

    const computeAndSetBaseSize = (targetObject) => {
      targetObject.updateMatrixWorld(true);
      const tempBox = new THREE.Box3().setFromObject(targetObject);
      group.userData.baseSize = tempBox.getSize(new THREE.Vector3());
    };

    if (itemData.isPolyHaven || itemData.isSketchfab || itemData.isLocalModel) {
      const cacheKey = itemData.isSketchfab ? itemData.sketchfabId : 
                       itemData.isPolyHaven ? itemData.polyHavenId : itemData.id;
      if (loadedModelsCache.current[cacheKey]) {
        const sceneClone = loadedModelsCache.current[cacheKey].clone();
        sceneClone.traverse(child => {
          if (child.isMesh && child.material) {
            child.material = Array.isArray(child.material) ? child.material.map(m => m.clone()) : child.material.clone();
          }
        });
        group.add(sceneClone);
        computeAndSetBaseSize(sceneClone);
      } else {
        const loadingGeo = new THREE.BoxGeometry(1, 1, 1);
        const loadingMat = new THREE.MeshStandardMaterial({ color: 0x888888, wireframe: true });
        const loadingMesh = new THREE.Mesh(loadingGeo, loadingMat);
        loadingMesh.position.y = 0.5;
        group.add(loadingMesh);

        setLoadingModelId(itemData.id);
        load3DModel(itemData).then(scene => {
          group.remove(loadingMesh);
          const sceneClone = scene.clone();
          sceneClone.traverse(child => {
            if (child.isMesh && child.material) {
              child.material = Array.isArray(child.material) ? child.material.map(m => m.clone()) : child.material.clone();
            }
          });
          group.add(sceneClone);
          computeAndSetBaseSize(sceneClone);
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
        }).catch(err => {
          console.error('Failed to load model', err);
        }).finally(() => {
          setLoadingModelId(null);
        });
      }
    } else {
      const mesh = createFurniture(itemData.type, itemData.color);
      group.add(mesh);
      computeAndSetBaseSize(mesh);
    }
    
    stagedGroupRef.current.add(group);
    return group;
  };

  const getStagedMeshes = () => {
    return stagedGroupRef.current ? stagedGroupRef.current.children : [];
  };

  // Handle ghost mesh for placement
  useEffect(() => {
    let isActive = true;

    if (placementModeItem && sceneRef.current) {
      if (ghostRef.current) {
        sceneRef.current.remove(ghostRef.current);
        ghostRef.current = null;
      }
      
      const setupGhost = async () => {
        let modelScene = null;
        if (placementModeItem.isPolyHaven || placementModeItem.isSketchfab || placementModeItem.isLocalModel) {
           setLoadingModelId(placementModeItem.id);
           try {
             const scene = await load3DModel({
                isPolyHaven: !!placementModeItem.isPolyHaven,
                isSketchfab: !!placementModeItem.isSketchfab,
                isLocalModel: !!placementModeItem.isLocalModel,
                polyHavenId: placementModeItem.isPolyHaven ? placementModeItem.id : undefined,
                sketchfabId: placementModeItem.isSketchfab ? placementModeItem.id : undefined,
                id: placementModeItem.id,
                modelUrl: placementModeItem.modelUrl,
             });
             if (isActive && scene) {
                modelScene = scene.clone();
             }
           } catch(e) {
             console.error("Ghost load failed", e);
           } finally {
             if (isActive) setLoadingModelId(null);
           }
        } else {
           modelScene = createFurniture(placementModeItem.type, placementModeItem.color);
        }

        if (!isActive || !modelScene) return;
        
        ghostRef.current = modelScene;
        ghostRef.current.traverse(child => {
          if (child.isMesh && child.material) {
            child.material = Array.isArray(child.material) ? child.material.map(m => m.clone()) : child.material.clone();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
               m.transparent = true;
               m.opacity = 0.5;
            });
          }
        });
        
        ghostRef.current.rotation.set(Math.PI / 2, 0, 0);
        sceneRef.current.add(ghostRef.current);
      };
      
      setupGhost();
    } else if (!placementModeItem && ghostRef.current && sceneRef.current) {
      sceneRef.current.remove(ghostRef.current);
      ghostRef.current = null;
    }

    return () => { isActive = false; };
  }, [placementModeItem, sceneRef]);

  // Mouse move for ghost placement
  useEffect(() => {
    if (!placementModeItem || !isDataLoaded || !modelRef.current) return;

    const onMouseMove = (e) => {
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const intersects = raycasterRef.current.intersectObject(modelRef.current, true);

      if (intersects.length > 0 && ghostRef.current) {
        ghostRef.current.position.copy(intersects[0].point);
        ghostRef.current.visible = true;

        ghostRef.current.updateMatrixWorld();
        const ghostBox = new THREE.Box3().setFromObject(ghostRef.current);
        const size = new THREE.Vector3();
        ghostBox.getSize(size);
        ghostBox.expandByVector(size.multiplyScalar(-0.1));

        let collided = false;
        if (checkEnvironmentCollision(ghostBox)) {
          collided = true;
        } else if (stagedGroupRef.current) {
          for (const otherObj of stagedGroupRef.current.children) {
            if (!otherObj.userData.isStagedItem) continue;
            const otherBox = new THREE.Box3().setFromObject(otherObj);
            const otherSize = new THREE.Vector3();
            otherBox.getSize(otherSize);
            otherBox.expandByVector(otherSize.multiplyScalar(-0.1));
            
            if (ghostBox.intersectsBox(otherBox)) {
              collided = true;
              break;
            }
          }
        }
        
        ghostRef.current.userData.collided = collided;
        ghostRef.current.traverse(child => {
           if (child.isMesh && child.material) {
              if (collided) {
                 child.material.color.setHex(0xff0000);
                 child.material.opacity = 0.8;
              } else {
                 child.material.color.setHex(0x00ff00);
                 child.material.opacity = 0.5;
              }
           }
        });
      } else if (ghostRef.current) {
        ghostRef.current.visible = false;
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [placementModeItem, isDataLoaded]);

  // Handle selection highlighting
  useEffect(() => {
    if (!stagedGroupRef.current) return;
    
    if (!selectedItemId) {
      setSelectedDimensions(null);
    }

    stagedGroupRef.current.children.forEach(mesh => {
      const isSelected = mesh.userData.id === selectedItemId;
      if (isSelected && transformControlRef.current) {
        transformControlRef.current.attach(mesh);
        
        const box = new THREE.Box3().setFromObject(mesh);
        let currentSize = new THREE.Vector3();
        if (mesh.userData.baseSize) {
          currentSize.copy(mesh.userData.baseSize).multiply(mesh.scale);
        } else {
          box.getSize(currentSize);
        }
        setSelectedDimensions([Math.abs(currentSize.x), Math.abs(currentSize.y), Math.abs(currentSize.z)]);
      } else if (!isSelected && transformControlRef.current && transformControlRef.current.object === mesh) {
        transformControlRef.current.detach();
      }
      
      mesh.traverse(child => {
        if (child.isMesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            if (mat.userData.originalColor === undefined && mat.color) {
              mat.userData.originalColor = mat.color.getHex();
            }
            if (isSelected) {
              mat.color.setHex(0xffaaaa);
            } else if (mat.userData.originalColor !== undefined) {
              mat.color.setHex(mat.userData.originalColor);
            }
          });
        }
      });
    });
  }, [selectedItemId]);

  // Watch for TransformControls changes to update React state
  useEffect(() => {
    if (!transformControlRef.current) return;

    const onChange = () => {
      const obj = transformControlRef.current.object;
      if (obj) {
        obj.updateMatrixWorld(true);
        const currentBox = new THREE.Box3().setFromObject(obj);
        let currentSize = new THREE.Vector3();
        if (obj.userData.baseSize) {
          currentSize.copy(obj.userData.baseSize).multiply(obj.scale);
        } else {
          currentBox.getSize(currentSize);
        }
        
        const dimX = Math.abs(currentSize.x);
        const dimY = Math.abs(currentSize.y);
        const dimZ = Math.abs(currentSize.z);
        setSelectedDimensions([dimX, dimY, dimZ]);

        // Direct DOM update for zero-latency real-time display during scale
        const dimW = document.getElementById('staging-dim-width');
        const dimH = document.getElementById('staging-dim-height');
        const dimD = document.getElementById('staging-dim-depth');
        if (dimW) dimW.innerText = dimX.toFixed(2) + 'm';
        if (dimH) dimH.innerText = dimY.toFixed(2) + 'm';
        if (dimD) dimD.innerText = dimZ.toFixed(2) + 'm';

        // --- Collision Detection ---
        if (lastValidTransformRef.current && stagedGroupRef.current) {
          const activeBox = currentBox;
          
          const size = new THREE.Vector3();
          activeBox.getSize(size);
          activeBox.expandByVector(size.multiplyScalar(-0.1)); // Shrink 10%

          let collided = false;
          if (checkEnvironmentCollision(activeBox)) {
            collided = true;
          }
          
          if (!collided) {
            for (const otherObj of stagedGroupRef.current.children) {
              if (otherObj === obj || !otherObj.userData.isStagedItem) continue;

              const otherBox = new THREE.Box3().setFromObject(otherObj);
              const otherSize = new THREE.Vector3();
              otherBox.getSize(otherSize);
              otherBox.expandByVector(otherSize.multiplyScalar(-0.1));

              if (activeBox.intersectsBox(otherBox)) {
                collided = true;
                break;
              }
            }
          }

          if (collided) {
            // Revert transform
            obj.position.copy(lastValidTransformRef.current.position);
            obj.rotation.copy(lastValidTransformRef.current.rotation);
            obj.scale.copy(lastValidTransformRef.current.scale);
            obj.updateMatrixWorld();
            return; // Don't trigger state update
          } else {
            // Update valid transform
            lastValidTransformRef.current.position.copy(obj.position);
            lastValidTransformRef.current.rotation.copy(obj.rotation);
            lastValidTransformRef.current.scale.copy(obj.scale);
          }
        }
        // --- End Collision Detection ---

        setStagedItems(prev => prev.map(item => {
          if (item.id === obj.userData.id) {
            return {
              ...item,
              position: obj.position.toArray(),
              rotation: obj.rotation.toArray(),
              scale: obj.scale.toArray()
            };
          }
          return item;
        }));
      }
    };

    transformControlRef.current.addEventListener('change', onChange);
    // Also listen to objectChange for robust transform updates
    transformControlRef.current.addEventListener('objectChange', onChange);
    return () => {
      if (transformControlRef.current) {
        transformControlRef.current.removeEventListener('change', onChange);
        transformControlRef.current.removeEventListener('objectChange', onChange);
      }
    };
  }, [isDataLoaded]);

  // Robust polling fallback for real-time scale dimensions
  useEffect(() => {
    let rafId;
    if (transformMode === 'scale' && selectedItemId) {
      const updateDimensions = () => {
        if (transformControlRef.current && transformControlRef.current.object) {
          const obj = transformControlRef.current.object;
          obj.updateMatrixWorld(true);
          const currentBox = new THREE.Box3().setFromObject(obj);
          let currentSize = new THREE.Vector3();
          
          if (obj.userData.baseSize) {
            currentSize.copy(obj.userData.baseSize).multiply(obj.scale);
          } else {
            currentBox.getSize(currentSize);
          }
          
          const dimX = Math.abs(currentSize.x).toFixed(2);
          const dimY = Math.abs(currentSize.y).toFixed(2);
          const dimZ = Math.abs(currentSize.z).toFixed(2);
          
          const dimW = document.getElementById('staging-dim-width');
          const dimH = document.getElementById('staging-dim-height');
          const dimD = document.getElementById('staging-dim-depth');
          
          if (dimW && dimW.innerText !== dimX + 'm') dimW.innerText = dimX + 'm';
          if (dimH && dimH.innerText !== dimY + 'm') dimH.innerText = dimY + 'm';
          if (dimD && dimD.innerText !== dimZ + 'm') dimD.innerText = dimZ + 'm';
        }
        rafId = requestAnimationFrame(updateDimensions);
      };
      rafId = requestAnimationFrame(updateDimensions);
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [transformMode, selectedItemId]);

  const handleCanvasClick = useCallback((event) => {
    if (!isDataLoaded) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycasterRef.current.setFromCamera(mouse, cameraRef.current);

    // 1. Placement Mode
    if (placementModeItem) {
      if (ghostRef.current && ghostRef.current.userData.collided) {
        return true; // Block placement, consume event
      }
      if (modelRef.current) {
        const intersects = raycasterRef.current.intersectObject(modelRef.current, true);
        if (intersects.length > 0) {
          const newItem = {
            id: `item_${Date.now()}`,
            isPolyHaven: !!placementModeItem.isPolyHaven,
            isSketchfab: !!placementModeItem.isSketchfab,
            isLocalModel: !!placementModeItem.isLocalModel,
            polyHavenId: placementModeItem.isPolyHaven ? placementModeItem.id : undefined,
            sketchfabId: placementModeItem.isSketchfab ? placementModeItem.id : undefined,
            modelUrl: placementModeItem.modelUrl,
            dimensions: placementModeItem.dimensions,
            type: placementModeItem.type,
            color: placementModeItem.color,
            position: intersects[0].point.toArray(),
            rotation: [Math.PI / 2, 0, 0],
            scale: [1, 1, 1]
          };
          
          spawnFurnitureMesh(newItem);
          setStagedItems(prev => [...prev, newItem]);
          setSelectedItemId(newItem.id);
          setPlacementModeItem(null); // Exit placement mode
        }
      }
      return true; // Event consumed
    }

    // 2. Selection Mode
    const stagedMeshes = getStagedMeshes();
    if (stagedMeshes.length > 0) {
      const intersects = raycasterRef.current.intersectObjects(stagedMeshes, true);
      if (intersects.length > 0) {
        // Find the root group of the furniture
        let obj = intersects[0].object;
        while (obj.parent && obj.parent !== stagedGroupRef.current) {
          obj = obj.parent;
        }
        setSelectedItemId(obj.userData.id);
        return true; // Event consumed
      }
    }

    // Deselect if clicking empty space (and not interacting with transform controls)
    // Actually we shouldn't deselect if clicking TransformControls. 
    // We can rely on a simpler check: if we got here, we clicked empty space or scan spheres.
    // TransformControls intercepts pointerdown, so a full click means we missed it.
    if (selectedItemId) {
        setSelectedItemId(null);
    }
    
    return false; // Event not consumed by staging
  }, [placementModeItem, isDataLoaded, selectedItemId]);

  const deleteSelected = () => {
    if (selectedItemId) {
      const mesh = stagedGroupRef.current.children.find(c => c.userData.id === selectedItemId);
      if (mesh) {
        stagedGroupRef.current.remove(mesh);
        if (transformControlRef.current) transformControlRef.current.detach();
      }
      setStagedItems(prev => prev.filter(i => i.id !== selectedItemId));
      setSelectedItemId(null);
    }
  };

  const duplicateSelected = () => {
    if (selectedItemId) {
      const item = stagedItems.find(i => i.id === selectedItemId);
      if (item) {
        const newItem = {
          ...item,
          id: `item_${Date.now()}`,
          position: [item.position[0] + 0.5, item.position[1] + 0.5, item.position[2]]
        };
        spawnFurnitureMesh(newItem);
        setStagedItems(prev => [...prev, newItem]);
        setSelectedItemId(newItem.id);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      } else if (e.key === 'Escape') {
        setPlacementModeItem(null);
        setSelectedItemId(null);
      } else if (e.key === 'g' || e.key === 'G') {
        setTransformMode('translate');
      } else if (e.key === 'r' || e.key === 'R') {
        setTransformMode('rotate');
      } else if (e.key === 's' || e.key === 'S') {
        setTransformMode('scale');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItemId, stagedItems]);


  return {
    stagedItems,
    setPlacementModeItem,
    placementModeItem,
    selectedItemId,
    transformMode,
    setTransformMode,
    handleCanvasClick,
    deleteSelected,
    duplicateSelected,
    saveStagedItems,
    stagedGroupRef,
    loadingModelId,
    bakedTexturesMap,
    setBakedTexturesMap,
    selectedDimensions,
    uniformScale,
    setUniformScale
  };
};
