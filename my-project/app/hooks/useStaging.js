import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFurniture } from '../utils/furnitureFactory';
import { getSketchfabDownloadUrl, downloadAndExtractSketchfabGltf } from '../utils/sketchfabService';

const API = 'http://localhost:3000/api';

export const useStaging = (sceneRef, cameraRef, rendererRef, controlsRef, modelRef, isDataLoaded, tourId, activeProfileId) => {
  const getToken = () => localStorage.getItem('access_token');
  const [stagedItems, setStagedItems] = useState([]);
  const [placementModeItem, setPlacementModeItem] = useState(null);
  const [bakedTexturesMap, setBakedTexturesMap] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');
  const [loadingModelId, setLoadingModelId] = useState(null);

  const stagedGroupRef = useRef(null);
  const transformControlRef = useRef(null);
  const ghostRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());

  // Initialize group and transform controls
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !isDataLoaded) return;

    if (!stagedGroupRef.current) {
      stagedGroupRef.current = new THREE.Group();
      stagedGroupRef.current.name = 'staged_furniture_group';
      sceneRef.current.add(stagedGroupRef.current);
    }

    if (!transformControlRef.current) {
      transformControlRef.current = new TransformControls(cameraRef.current, rendererRef.current.domElement);
      transformControlRef.current.addEventListener('dragging-changed', function (event) {
        if (controlsRef.current) {
          controlsRef.current.enabled = !event.value;
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
      // For floor items, translating on Y (up/down) is often bad, but let's allow 3D movement for now
      // Or restrict to XZ plane if desired.
    }
  }, [transformMode]);

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

  const spawnFurnitureMesh = (itemData) => {
    const group = new THREE.Group();
    group.position.fromArray(itemData.position);
    group.rotation.fromArray(itemData.rotation);
    group.scale.fromArray(itemData.scale);
    group.userData = { isStagedItem: true, id: itemData.id, isPolyHaven: itemData.isPolyHaven, polyHavenId: itemData.polyHavenId };

    if (itemData.isPolyHaven) {
      // Create a temporary loading box
      const w = (itemData.dimensions?.[0] || 1000) * 0.001;
      const h = (itemData.dimensions?.[1] || 1000) * 0.001;
      const d = (itemData.dimensions?.[2] || 1000) * 0.001;
      const loadingGeo = new THREE.BoxGeometry(w, h, d);
      const loadingMat = new THREE.MeshStandardMaterial({ color: 0x888888, wireframe: true });
      const loadingMesh = new THREE.Mesh(loadingGeo, loadingMat);
      loadingMesh.position.y = h / 2; // Center bottom to origin
      group.add(loadingMesh);

      // Fetch and load GLTF
      setLoadingModelId(itemData.id);
      fetch(`https://api.polyhaven.com/files/${itemData.polyHavenId}`)
        .then(res => res.json())
        .then(data => {
          const gltfEntry = data.gltf?.['1k']?.gltf || data.gltf?.['2k']?.gltf || data.gltf?.['4k']?.gltf;
          if (gltfEntry && gltfEntry.url) {
            const gltfUrl = gltfEntry.url;
            const includeMap = gltfEntry.include || {};

            // Build a URL remap from relative texture paths to absolute CDN URLs
            const textureUrlMap = {};
            for (const [relativePath, fileInfo] of Object.entries(includeMap)) {
              if (fileInfo.url) {
                textureUrlMap[relativePath] = fileInfo.url;
              }
            }

            console.log('[PolyHaven] Loading GLTF:', gltfUrl);
            console.log('[PolyHaven] Texture remap:', textureUrlMap);

            // Custom LoadingManager that remaps relative texture paths
            const manager = new THREE.LoadingManager();
            manager.onLoad = () => {
              console.log('[PolyHaven] All resources loaded for', itemData.polyHavenId);
              setLoadingModelId(null);
            };
            manager.onError = (url) => {
              console.error('[PolyHaven] Failed to load resource:', url);
              setLoadingModelId(null);
            };

            const gltfBaseUrl = gltfUrl.substring(0, gltfUrl.lastIndexOf('/') + 1);
            manager.resolveURL = (url) => {
              // If the URL starts with the gltf base, extract the relative part
              if (url.startsWith(gltfBaseUrl)) {
                const relativePath = url.substring(gltfBaseUrl.length);
                if (textureUrlMap[relativePath]) {
                  console.log('[PolyHaven] Remapped:', relativePath, '->', textureUrlMap[relativePath]);
                  return textureUrlMap[relativePath];
                }
              }
              // Also try matching just the relative path directly
              for (const [relPath, absUrl] of Object.entries(textureUrlMap)) {
                if (url.endsWith(relPath)) {
                  console.log('[PolyHaven] Remapped (suffix):', relPath, '->', absUrl);
                  return absUrl;
                }
              }
              console.log('[PolyHaven] No remap for:', url);
              return url;
            };

            const loader = new GLTFLoader(manager);
            loader.setCrossOrigin('anonymous');
            loader.load(
              gltfUrl,
              (gltf) => {
                // Remove loading mesh
                group.remove(loadingMesh);
                
                gltf.scene.scale.set(1, 1, 1);
                
                // Ensure children can cast/receive shadows and store original colors for highlighting
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

                group.add(gltf.scene);

                // Force a render since the smart render loop only re-renders on camera change
                if (rendererRef.current && sceneRef.current && cameraRef.current) {
                  rendererRef.current.render(sceneRef.current, cameraRef.current);
                }
              },
              (progress) => {
                if (progress.total > 0) {
                  console.log(`[PolyHaven] Loading ${itemData.polyHavenId}: ${Math.round(progress.loaded / progress.total * 100)}%`);
                }
              },
              (error) => {
                console.error('[PolyHaven] GLTF load error:', error);
                setLoadingModelId(null);
              }
            );
          } else {
            console.error('[PolyHaven] No GLTF entry found for', itemData.polyHavenId);
            setLoadingModelId(null);
          }
        })
        .catch(err => {
          console.error("Failed to load Poly Haven model:", err);
          setLoadingModelId(null);
        });

    } else if (itemData.isSketchfab) {
      const loadingGeo = new THREE.BoxGeometry(1, 1, 1);
      const loadingMat = new THREE.MeshStandardMaterial({ color: 0x888888, wireframe: true });
      const loadingMesh = new THREE.Mesh(loadingGeo, loadingMat);
      loadingMesh.position.y = 0.5;
      group.add(loadingMesh);

      setLoadingModelId(itemData.id);
      const sfToken = localStorage.getItem('sketchfab_token');

      getSketchfabDownloadUrl(itemData.id, sfToken)
        .then(zipUrl => downloadAndExtractSketchfabGltf(zipUrl))
        .then(({ gltfUrl, blobUrls, cleanup }) => {
          const manager = new THREE.LoadingManager();
          manager.onLoad = () => {
            console.log('[Sketchfab] All resources loaded');
            setLoadingModelId(null);
          };
          manager.onError = (url) => {
            console.error('[Sketchfab] Failed to load resource:', url);
            setLoadingModelId(null);
          };

          manager.resolveURL = (url) => {
            // Find if this URL matches any of our extracted blob relative paths
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
              group.remove(loadingMesh);
              
              // Cleanup memory once loaded
              cleanup();

              // Auto-scale since Sketchfab models vary wildly in scale
              const box = new THREE.Box3().setFromObject(gltf.scene);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z);
              if (maxDim > 5) {
                // If larger than 5 meters, scale down to fit roughly 2 meters
                const scale = 2.0 / maxDim;
                gltf.scene.scale.setScalar(scale);
              }

              // Ensure children can cast/receive shadows and store original colors for highlighting
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

              group.add(gltf.scene);

              if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
              }
            },
            undefined,
            (err) => {
              console.error('[Sketchfab] GLTF load error:', err);
              setLoadingModelId(null);
              cleanup();
            }
          );
        })
        .catch(err => {
          console.error("Failed to load Sketchfab model:", err);
          setLoadingModelId(null);
        });

    } else {
      const mesh = createFurniture(itemData.type, itemData.color);
      // createFurniture models might already be centered or bottom-aligned. 
      group.add(mesh);
    }
    
    stagedGroupRef.current.add(group);
    return group;
  };

  const getStagedMeshes = () => {
    return stagedGroupRef.current ? stagedGroupRef.current.children : [];
  };

  // Handle ghost mesh for placement
  useEffect(() => {
    if (placementModeItem && sceneRef.current) {
      if (ghostRef.current) {
        sceneRef.current.remove(ghostRef.current);
      }
      
      if (placementModeItem.isPolyHaven) {
        const w = (placementModeItem.dimensions?.[0] || 1000) * 0.001;
        const h = (placementModeItem.dimensions?.[1] || 1000) * 0.001;
        const d = (placementModeItem.dimensions?.[2] || 1000) * 0.001;
        const boxGeo = new THREE.BoxGeometry(w, h, d);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, wireframe: true });
        ghostRef.current = new THREE.Mesh(boxGeo, boxMat);
        // We want the bottom of the box to sit on the cursor
        ghostRef.current.geometry.translate(0, h / 2, 0); 
      } else {
        ghostRef.current = createFurniture(placementModeItem.type, placementModeItem.color);
        // Make it semi-transparent
        ghostRef.current.traverse(child => {
          if (child.isMesh) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = 0.5;
          }
        });
      }
      // Rotate the ghost mesh 90 degrees on X to stand it up in a Z-up scene
      ghostRef.current.rotation.set(Math.PI / 2, 0, 0);
      sceneRef.current.add(ghostRef.current);
    } else if (!placementModeItem && ghostRef.current && sceneRef.current) {
      sceneRef.current.remove(ghostRef.current);
      ghostRef.current = null;
    }
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
    
    stagedGroupRef.current.children.forEach(mesh => {
      const isSelected = mesh.userData.id === selectedItemId;
      if (isSelected && transformControlRef.current) {
        transformControlRef.current.attach(mesh);
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
    return () => transformControlRef.current.removeEventListener('change', onChange);
  }, []);


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
      if (modelRef.current) {
        const intersects = raycasterRef.current.intersectObject(modelRef.current, true);
        if (intersects.length > 0) {
          const newItem = {
            id: `item_${Date.now()}`,
            isPolyHaven: placementModeItem.isPolyHaven,
            polyHavenId: placementModeItem.id, // from Poly Haven JSON
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
  };
};
