import { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { useThreeScene } from '../hooks/useThreeScene';
import { useTourData } from '../hooks/useTourData';
import { executeFlightAnimation } from '../utils/tourAnimations';
import { useStaging } from '../hooks/useStaging';
import { disposeScanTextures } from '../utils/depthCubeLoader';

const ModelAndScansViewer = forwardRef(({ tourId, activeProfileId, stagingMode, measurementMode, onMeasurementClick, tagMode, onTagClick, onTagSelect, pointersMode, onPointerClick, onPointerSelect, onPointerDragStart, onPointerDragMove, onPointerDragEnd, activeFloor = 'all' }, ref) => {
  // Removed debug states

  // --- Persistent dummy texture to prevent shader recompilation lag ---
  const dummyTex = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const { mountRef, sceneRef, cameraRef, rendererRef, controlsRef, keyboardEnabledRef, scanLockPosRef, sceneReady } = useThreeScene([dummyTex], true);
  const { 
    modelRef, magicBubbleRef, projectiveMaterialRef, 
    scanSpheres, loadPanoramaTextures, isDataLoaded, scansData 
  } = useTourData(sceneRef, dummyTex, tourId, sceneReady, rendererRef, cameraRef, activeProfileId, activeFloor);

  // ─── Staging Hook ───
  const staging = useStaging(
    sceneRef, cameraRef, rendererRef, controlsRef, modelRef, isDataLoaded, tourId, activeProfileId
  );

  // Expose Three.js internals and staging methods to parent
  useImperativeHandle(ref, () => ({
    sceneRef,
    cameraRef,
    rendererRef,
    modelRef,
    controlsRef,
    scansData,
    scanSpheres,
    staging, // expose the entire staging object
  }), [sceneRef, cameraRef, rendererRef, modelRef, controlsRef, scansData, scanSpheres, staging]);

  // Track measurement mode state in a ref for the click handler
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

  // Active state trackers
  // Cache loaded panorama textures by scan ID
  const panoramaCache = useRef({});
  const activeBoxIndexRef = useRef(1);
  const activeSphereRef = useRef(null);
  const wasDraggingRef = useRef(false);
  const pointerDownPosRef = useRef({ x: 0, y: 0 });

  // Hotspot Overlay view state
  const [isInscan, setIsInscan] = useState(false);
  const [isMeshView, setIsMeshView] = useState(false);
  const [isRawMeshView, setIsRawMeshView] = useState(false);

  // Tag info popup state (for engine/read-only view)
  const [activeTagInfo, setActiveTagInfo] = useState(null);
  const [calibRotation, setCalibRotation] = useState({ x: 0, y: 0, z: 0 });

  const applyCalibration = (axis, degrees) => {
    setCalibRotation(prev => {
      const newCalib = { ...prev, [axis]: prev[axis] + degrees * (Math.PI / 180) };
      
      // Update current bubble if inside a scan
      if (isInscan && activeSphereRef.current && magicBubbleRef.current) {
        const instancedMesh = scanSpheres[0];
        const clickedData = instancedMesh.userData.metadata.find(m => m.id === activeSphereRef.current);
        if (clickedData) {
          const targetQuat = clickedData.rotation_quaternion;
          const baseQuat = new THREE.Quaternion(targetQuat[0], targetQuat[1], targetQuat[2], targetQuat[3]);
          
          const calibEulerObj = new THREE.Euler(newCalib.x, newCalib.y, newCalib.z, 'XYZ');
          const calibQ = new THREE.Quaternion().setFromEuler(calibEulerObj);
          const finalQuat = baseQuat.multiply(calibQ);
          
          magicBubbleRef.current.quaternion.copy(finalQuat);
          
          // Also update projective material's inverse quat if it's currently active
          if (projectiveMaterialRef.current) {
            projectiveMaterialRef.current.uniforms.uCurrentScanQuatInverse.value.set(-finalQuat.x, -finalQuat.y, -finalQuat.z, finalQuat.w);
          }
        }
      }
      
      return newCalib;
    });
  };

  useEffect(() => {
    if (isInscan && activeSphereRef.current && isDataLoaded && rendererRef.current) {
      const instancedMesh = scanSpheres[0];
      const clickedData = instancedMesh.userData.metadata.find(m => m.id === activeSphereRef.current);
      if (clickedData && magicBubbleRef.current) {
        // Set world position (must be optical center realPosition, not floor snappedPosition)
        magicBubbleRef.current.position.copy(clickedData.realPosition);
        if (scanLockPosRef) scanLockPosRef.current = clickedData.realPosition;

        // Set rotation quaternion aligned to scanner local orientation
        if (clickedData.rotation_quaternion) {
          const q = clickedData.rotation_quaternion;
          const baseQuat = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
          const calibEulerObj = new THREE.Euler(calibRotation.x, calibRotation.y, calibRotation.z, 'XYZ');
          const calibQ = new THREE.Quaternion().setFromEuler(calibEulerObj);
          const finalQuat = baseQuat.multiply(calibQ);
          magicBubbleRef.current.quaternion.copy(finalQuat);

          if (projectiveMaterialRef.current) {
            projectiveMaterialRef.current.uniforms.uCurrentScanQuatInverse.value.set(-finalQuat.x, -finalQuat.y, -finalQuat.z, finalQuat.w);
          }
        }

        loadPanoramaTextures(clickedData.id, rendererRef.current).then((loadedTextures) => {
          panoramaCache.current[clickedData.id] = loadedTextures;
          const uniforms = magicBubbleRef.current.material.uniforms;
          if (uniforms.uColorCube) uniforms.uColorCube.value = loadedTextures.colorCube;
          if (uniforms.uDepthCube) uniforms.uDepthCube.value = loadedTextures.depthCube;
          if (uniforms.uMinDepth) uniforms.uMinDepth.value = loadedTextures.minDepth;
          if (uniforms.uMaxDepth) uniforms.uMaxDepth.value = loadedTextures.maxDepth;
        });
      }
    } else {
      if (scanLockPosRef) scanLockPosRef.current = null;
    }
  }, [isInscan, isDataLoaded, scanSpheres, calibRotation]);


  const handleToggleMeshView = (useRaw = false) => {
    if (isMeshView || isRawMeshView) {
      // Switch back to bubble
      magicBubbleRef.current.visible = true;
      if (isMeshView) {
        gsap.to(projectiveMaterialRef.current.uniforms.uOpacity, { value: 0, duration: 1.0, onComplete: () => {
          modelRef.current.traverse((child) => {
            if (child.isMesh && child.userData.originalBasicMaterial) {
              child.material = child.userData.originalBasicMaterial;
            }
          });
          modelRef.current.visible = false;
        }});
      } else {
        modelRef.current.visible = false;
      }
      gsap.to(magicBubbleRef.current.material.uniforms.uOpacity, { value: 1, duration: 1.0 });
      setIsMeshView(false);
      setIsRawMeshView(false);
    } else {
      // Switch to global mesh
      if (useRaw) {
        modelRef.current.traverse((child) => {
          if (child.isMesh && child.userData.originalBasicMaterial) {
            child.material = child.userData.originalBasicMaterial;
          }
        });
        setIsRawMeshView(true);
      } else {
        modelRef.current.traverse((child) => {
          if (child.isMesh && child.userData.projectiveMaterial) {
            child.material = child.userData.projectiveMaterial;
          }
        });
        // Setup projective map for current scan
        // NOTE: the magic bubble now carries color as a CubeTexture (uColorCube),
        // while the projective MESH shader still expects an equirect color map.
        // Guard against the old equirect uniform being absent so the mesh-inspect
        // toggle does not throw; the projective mesh color path is handled
        // separately and is not required for the inside-scan parallax test.
        const currentScanEquirect = panoramaCache.current[activeSphereRef.current]?.equirectTexture;
        if (currentScanEquirect && projectiveMaterialRef.current.uniforms.uCurrentColorMap) {
          projectiveMaterialRef.current.uniforms.uCurrentColorMap.value = currentScanEquirect;
        }
        projectiveMaterialRef.current.uniforms.uCurrentScanPos.value.copy(magicBubbleRef.current.position);
        if (magicBubbleRef.current && projectiveMaterialRef.current) {
          const q = magicBubbleRef.current.quaternion;
          projectiveMaterialRef.current.uniforms.uCurrentScanQuatInverse.value.set(-q.x, -q.y, -q.z, q.w);
        }
        projectiveMaterialRef.current.uniforms.uTransitionProgress.value = 0.0;
        
        gsap.to(projectiveMaterialRef.current.uniforms.uOpacity, { value: 1, duration: 1.0 });
        setIsMeshView(true);
      }
      
      modelRef.current.visible = true;
      gsap.to(magicBubbleRef.current.material.uniforms.uOpacity, { value: 0, duration: 1.0, onComplete: () => { magicBubbleRef.current.visible = false; }});
    }
  };

  const handleFloorPlanView = () => {
    if (!modelRef.current || !cameraRef.current || !controlsRef.current) return;
    if (scanLockPosRef) scanLockPosRef.current = null;

    // Force Mesh View if inside a panorama
    if (isInscan && !isMeshView) {
      handleToggleMeshView();
    }

    const bbox = new THREE.Box3().setFromObject(modelRef.current);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const maxDim = Math.max(size.x, size.y);
    const topZ = bbox.max.z + maxDim * 1.2;

    // Kill any existing Tweens
    gsap.killTweensOf(cameraRef.current.position);
    gsap.killTweensOf(controlsRef.current.target);

    // Offset camera slightly to prevent OrbitControls gimbal lock when looking straight down Z axis
    gsap.to(cameraRef.current.position, {
      x: center.x + 0.1,
      y: center.y + 0.1,
      z: topZ,
      duration: 1.5,
      ease: "power3.inOut",
      onUpdate: () => controlsRef.current.update()
    });

    gsap.to(controlsRef.current.target, {
      x: center.x,
      y: center.y,
      z: bbox.min.z,
      duration: 1.5,
      ease: "power3.inOut",
      onUpdate: () => controlsRef.current.update()
    });
  };

  // Synchronize Area Pointers visibility (Only display in Dollhouse mode)
  // Also toggle keyboard movement and OrbitControls distance constraints
  useEffect(() => {
    const group = sceneRef.current?.getObjectByName('areaPointers');
    if (group) {
      group.visible = !isInscan || isMeshView;
    }
    // Enable keyboard in dollhouse view, disable in panorama
    keyboardEnabledRef.current = !isInscan || isMeshView;

    // Lock/unlock OrbitControls distance based on view mode
    const controls = controlsRef.current;
    if (controls) {
      if (isInscan && !isMeshView) {
        // Panorama mode: lock camera at scan position, disable zoom
        controls.enableZoom = false;
        controls.minDistance = 0;
        controls.maxDistance = 0.2;
      } else {
        // Dollhouse / Mesh view: restore free camera movement
        controls.enableZoom = true;
        controls.minDistance = 0;
        controls.maxDistance = Infinity;
      }
    }
  }, [isInscan, isMeshView, sceneRef, keyboardEnabledRef, controlsRef]);

  // Hotspot Distance Culling (Reduce visual clutter in panorama mode)
  useEffect(() => {
    if (!isDataLoaded || scanSpheres.length === 0 || !cameraRef.current) return;
    const instancedMesh = scanSpheres[0];
    if (!instancedMesh || !instancedMesh.isInstancedMesh) return;

    let rafId;
    const dummy = new THREE.Object3D();
    
    const updateVisibility = () => {
      rafId = requestAnimationFrame(updateVisibility);
      
      const cameraPos = cameraRef.current.position;
      let needsUpdate = false;
      
      // If we are in Dollhouse mode (!isInscan or isMeshView), show all rings
      // If we are in Panorama mode, use 18m threshold to reduce visual clutter
      const showAll = !isInscan || isMeshView;
      const threshold = 18.0; 
      
      instancedMesh.userData.metadata.forEach((data) => {
        if (data.id === activeSphereRef.current) return; // Always hidden when active
        
        let shouldBeVisible = true;
        
        // Active Floor filtering
        if (activeFloor !== 'all' && data.floor_level !== activeFloor) {
          shouldBeVisible = false;
        } else if (!showAll) {
           const dist = cameraPos.distanceTo(data.realPosition);
           shouldBeVisible = dist < threshold;
        }
        
        if (data.isVisible !== shouldBeVisible) {
           data.isVisible = shouldBeVisible;
           dummy.position.copy(data.snappedPosition || data.realPosition);
           dummy.scale.setScalar(shouldBeVisible ? 1 : 0);
           dummy.updateMatrix();
           instancedMesh.setMatrixAt(data.instanceId, dummy.matrix);
           needsUpdate = true;
        }
      });
      
      if (needsUpdate) {
        instancedMesh.instanceMatrix.needsUpdate = true;
      }
    };
    
    updateVisibility();
    return () => cancelAnimationFrame(rafId);
  }, [isDataLoaded, scanSpheres, cameraRef, isInscan, isMeshView, activeFloor]);

  // --- Active Floor Model Clipping ---
  useEffect(() => {
    if (!modelRef.current || !rendererRef.current || !isDataLoaded) return;
    
    // Enable WebGL local clipping
    rendererRef.current.localClippingEnabled = true;
    
    // We only need clipping when viewing the Ground Floor (0) to hide the Upper Floor (1)
    if (activeFloor === 0) {
      // Plane normal points OUTWARD from the kept geometry.
      // Normal (0,0,-1) keeps things where (-z + constant > 0) -> z < constant
      // Cut off everything above Z = 3.0 meters
      const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 3.0);
      
      modelRef.current.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            m.clippingPlanes = [clipPlane];
            m.needsUpdate = true;
          });
        }
      });
    } else {
      // Remove clipping plane for 'all' or '1'
      modelRef.current.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            m.clippingPlanes = [];
            m.needsUpdate = true;
          });
        }
      });
    }
  }, [activeFloor, isDataLoaded, modelRef, rendererRef]);

  // --- Click Event & Raycasting ---
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!renderer || !camera || !controls || !isDataLoaded) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const disposeCachedPanorama = (id) => {
      if (!id) return;
      if (panoramaCache.current[id]) {
        const p = panoramaCache.current[id];
        if (p.colorCube) p.colorCube.dispose();
        if (p.depthCube) p.depthCube.dispose();
        if (p.equirectTexture) p.equirectTexture.dispose();
        delete panoramaCache.current[id];
      }
      disposeScanTextures(id);
    };

    const transitionToScan = (clickedData, instancedMesh) => {
      if (activeSphereRef.current === clickedData.id) return;

      const targetPos = clickedData.realPosition;
      
      const baseQuat = new THREE.Quaternion(clickedData.rotation_quaternion[0], clickedData.rotation_quaternion[1], clickedData.rotation_quaternion[2], clickedData.rotation_quaternion[3]);
      
      const calibEulerObj = new THREE.Euler(calibRotation.x, calibRotation.y, calibRotation.z, 'XYZ');
      const calibQ = new THREE.Quaternion().setFromEuler(calibEulerObj);
      const finalQuat = baseQuat.multiply(calibQ);
      const targetQuat = [finalQuat.x, finalQuat.y, finalQuat.z, finalQuat.w];
      const scanId = clickedData.id;

      document.body.style.cursor = 'wait';
      const currentScanId = activeSphereRef.current;

      // Immediately dispose any old scans except currentScanId (needed for transition) and new scanId
      Object.keys(panoramaCache.current).forEach(id => {
        if (id !== currentScanId && id !== scanId) {
          disposeCachedPanorama(id);
        }
      });

      loadPanoramaTextures(scanId, renderer, staging.bakedTexturesMap).then((loadedTextures) => {
        panoramaCache.current[scanId] = loadedTextures;
        const currentEquirect = currentScanId ? panoramaCache.current[currentScanId]?.equirectTexture : null;
        const nextEquirect = loadedTextures.equirectTexture;

        document.body.style.cursor = 'default';
        controls.enabled = false;

        const lookAtDirection = new THREE.Vector3();
        camera.getWorldDirection(lookAtDirection);

        const isFirstClick = activeSphereRef.current === null;

        // Wrap in RAF to prevent GSAP/WebGL start-of-frame lag
        requestAnimationFrame(() => {
          executeFlightAnimation({
            camera,
            controls,
            targetPos,
            lookAtDirection,
            magicBubble: magicBubbleRef.current,
            projectiveMaterial: projectiveMaterialRef.current,
            model: modelRef.current,
            loadedTextures,
            currentEquirect,
            nextEquirect,
            targetQuat,
            isFirstClick,
            onComplete: () => {
              // Final State cleanup
              setIsInscan(true);
              setIsMeshView(false);

              if (scanLockPosRef) scanLockPosRef.current = targetPos;
              controls.enabled = true;

              // Lock OrbitControls distance to keep camera fixed at the scan position.
              // This prevents the user from zooming out of the panorama bubble.
              controls.enableZoom = false;
              controls.minDistance = 0;
              controls.maxDistance = 0.2;

              // Set the orbit target slightly ahead of the camera along its current
              // look direction. This gives OrbitControls a non-zero orbit radius,
              // preventing gimbal lock and erratic rotation behavior.
              if (targetPos) {
                const forward = new THREE.Vector3();
                camera.getWorldDirection(forward);
                controls.target.copy(targetPos).add(forward.multiplyScalar(0.1));
                controls.update();
              }

              // Dispose previous scan's heavy 4K textures now that arrival animation is complete
              if (currentScanId && currentScanId !== scanId) {
                disposeCachedPanorama(currentScanId);
              }

              // Background preload 2 nearest neighbor scans for instant click transitions
              if (instancedMesh && instancedMesh.userData?.metadata) {
                const neighbors = instancedMesh.userData.metadata
                  .filter(m => m.id !== scanId)
                  .map(m => ({ id: m.id, dist: m.realPosition.distanceTo(targetPos) }))
                  .sort((a, b) => a.dist - b.dist)
                  .slice(0, 2);

                neighbors.forEach(n => {
                  if (!panoramaCache.current[n.id]) {
                    loadPanoramaTextures(n.id, renderer).then(tex => {
                      panoramaCache.current[n.id] = tex;
                    }).catch(() => {});
                  }
                });
              }

              if (activeSphereRef.current) {
                const oldData = instancedMesh.userData.metadata.find(m => m.id === activeSphereRef.current);
                if (oldData) {
                  const dummy = new THREE.Object3D();
                  dummy.position.copy(oldData.snappedPosition || oldData.realPosition);
                  dummy.scale.set(1, 1, 1);
                  dummy.updateMatrix();
                  instancedMesh.setMatrixAt(oldData.instanceId, dummy.matrix);
                }
              }
              
              const dummy = new THREE.Object3D();
              dummy.position.copy(clickedData.snappedPosition || clickedData.realPosition);
              dummy.scale.set(0, 0, 0);
              dummy.updateMatrix();
              instancedMesh.setMatrixAt(clickedData.instanceId, dummy.matrix);
              instancedMesh.instanceMatrix.needsUpdate = true;

              activeSphereRef.current = clickedData.id;
            }
          });
        });
      });
    };

    const onClick = (event) => {
      // Suppress click if it's the tail-end of a handle drag
      if (wasDraggingRef.current) {
        wasDraggingRef.current = false;
        return;
      }

      // Suppress click if the mouse moved significantly (orbit drag over a wall)
      const dx = event.clientX - pointerDownPosRef.current.x;
      const dy = event.clientY - pointerDownPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) return;

      // Unconditionally try to click/select a pointer first (studio mode)
      if (onPointerSelectRef.current) {
        const didHitPointer = onPointerSelectRef.current(event);
        if (didHitPointer) return;
      }

      // Unconditionally try to click/select a tag (studio mode)
      if (onTagSelectRef.current) {
        const didHitTag = onTagSelectRef.current(event);
        if (didHitTag) return; // intercepted click, don't trigger anything else
      }

      // Engine mode: detect tag clicks and show info popup
      if (!onTagSelectRef.current) {
        const tagGroup = sceneRef.current?.getObjectByName('tagMarkers');
        if (tagGroup && tagGroup.children.length > 0) {
          const rect = renderer.domElement.getBoundingClientRect();
          const tagMouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
          );
          const tagRaycaster = new THREE.Raycaster();
          tagRaycaster.setFromCamera(tagMouse, camera);
          const tagHits = tagRaycaster.intersectObjects(tagGroup.children, false);
          if (tagHits.length > 0) {
            const hitSprite = tagHits[0].object;
            const tagId = hitSprite.userData.tagId;
            // Using static tag info instead of backend fetch
            setActiveTagInfo({
              id: tagId,
              title: "Static Tag " + tagId,
              description: "This is a statically loaded tag because the backend is disabled.",
              type: "info"
            });
            return;
          }
        }
        // Clicking empty space dismisses the popup
        setActiveTagInfo(null);
      }

      // If staging mode is active, check if staging handles the click (placement/selection)
      if (stagingMode && staging.handleCanvasClick) {
        const handled = staging.handleCanvasClick(event);
        if (handled) return;
      }

      // If measurement mode is active, delegate to measurement handler
      if (measurementModeRef.current && onMeasurementClickRef.current) {
        onMeasurementClickRef.current(event);
        return;
      }

      // If tag mode is active, delegate to tag handler
      if (tagModeRef.current && onTagClickRef.current) {
        onTagClickRef.current(event);
        return;
      }

      // If pointer mode is active, delegate to pointer handler
      if (pointersModeRef.current && onPointerClickRef.current) {
        onPointerClickRef.current(event);
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scanSpheres);

      if (intersects.length > 0) {
        const instancedMesh = intersects[0].object;
        if (instancedMesh.isInstancedMesh && intersects[0].instanceId !== undefined) {
          const instanceId = intersects[0].instanceId;
          const clickedData = instancedMesh.userData.metadata[instanceId];
          transitionToScan(clickedData, instancedMesh);
        }
      }
    };

    const onKeyDown = (e) => {
      // Only navigate hotspots when keyboard movement is disabled (pure panorama mode)
      if (keyboardEnabledRef.current) return;
      if (!activeSphereRef.current) return;
      
      const instancedMesh = scanSpheres[0];
      if (!instancedMesh || !instancedMesh.isInstancedMesh) return;

      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'];
      if (!keys.includes(e.code)) return;

      // Prevent spamming
      if (document.body.style.cursor === 'wait') return;

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.z = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, camera.up).normalize();

      const moveDir = new THREE.Vector3();

      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        moveDir.copy(forward);
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        moveDir.copy(forward).negate();
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        // Handled smoothly in useThreeScene.js animate loop
        return;
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        // Handled smoothly in useThreeScene.js animate loop
        return;
      }

      moveDir.normalize();

      const currentData = instancedMesh.userData.metadata.find(m => m.id === activeSphereRef.current);
      if (!currentData) return;
      const currentPos = currentData.realPosition;

      let bestMatch = null;
      let bestScore = -Infinity;

      instancedMesh.userData.metadata.forEach(data => {
        if (data.id === activeSphereRef.current) return;

        const spherePos = data.realPosition;
        const dirToSphere = new THREE.Vector3().subVectors(spherePos, currentPos);
        
        dirToSphere.z = 0;
        const dist = dirToSphere.length();
        
        if (dist < 0.1 || dist > 15.0) return;
        
        dirToSphere.normalize();
        
        const dot = moveDir.dot(dirToSphere);
        
        // Tolerance: dot > 0.6 is ~53 degrees
        if (dot > 0.6) { 
           // score based heavily on alignment, penalize by distance to prefer closer rings
           const score = dot - (dist * 0.15); 
           if (score > bestScore) {
              bestScore = score;
              bestMatch = data;
           }
        }
      });

      if (bestMatch) {
        transitionToScan(bestMatch, instancedMesh);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('click', onClick);

    // Drag events for area pointer wall resizing
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
      } else if (scanSpheres.length > 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scanSpheres);
        if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
          const instancedMesh = intersects[0].object;
          const hoverData = instancedMesh.userData?.metadata?.[intersects[0].instanceId];
          if (hoverData?.id && !panoramaCache.current[hoverData.id]) {
            loadPanoramaTextures(hoverData.id, renderer).then((tex) => {
              panoramaCache.current[hoverData.id] = tex;
            }).catch(() => {});
          }
        }
      }
    };
    const onUp = (e) => {
      if (wasDraggingRef.current && onPointerDragEndRef.current) {
        onPointerDragEndRef.current(e);
        // wasDraggingRef stays true — will be cleared by the next click event
      }
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
    };
  }, [isDataLoaded, scanSpheres, cameraRef, rendererRef, controlsRef, sceneRef, modelRef, magicBubbleRef, projectiveMaterialRef, loadPanoramaTextures, dummyTex, staging]);


  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {isInscan && (
        <>
          <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', gap: '10px' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); handleToggleMeshView(false); }}
              style={{
                padding: '12px 24px',
                background: 'rgba(15, 15, 15, 0.85)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '30px',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(40, 40, 40, 0.95)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(15, 15, 15, 0.85)'}
            >
              {(isMeshView || isRawMeshView) ? 'Return to 360 View' : 'Inspect 3D Mesh'}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleToggleMeshView(true); }}
              style={{
                padding: '12px 24px',
                background: 'rgba(15, 15, 15, 0.85)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '30px',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                transition: 'background 0.2s ease',
                display: (isMeshView || isRawMeshView) ? 'none' : 'block'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(40, 40, 40, 0.95)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(15, 15, 15, 0.85)'}
            >
              Inspect Raw Mesh
            </button>
          </div>
          
          <div style={{
            position: 'absolute',
            top: 20,
            left: 20,
            zIndex: 1000,
            background: 'rgba(15, 15, 15, 0.85)',
            padding: '16px',
            borderRadius: '12px',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}>
            <h4 style={{ margin: 0, fontSize: '14px' }}>Manual Calibration (90°)</h4>
            {['x', 'y', 'z'].map(axis => (
              <div key={axis} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{axis} Axis</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); applyCalibration(axis, -90); }}
                    style={{ padding: '4px 12px', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px' }}
                  >-90</button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); applyCalibration(axis, 90); }}
                    style={{ padding: '4px 12px', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px' }}
                  >+90</button>
                </div>
              </div>
            ))}
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
              X: {(calibRotation.x * 180 / Math.PI).toFixed(0)}°, Y: {(calibRotation.y * 180 / Math.PI).toFixed(0)}°, Z: {(calibRotation.z * 180 / Math.PI).toFixed(0)}°
            </div>
          </div>

        </>
      )}

      {/* Floor Plan Button */}
      <button 
        onClick={(e) => { e.stopPropagation(); handleFloorPlanView(); }}
        style={{
          position: 'absolute',
          bottom: 30,
          right: 30,
          zIndex: 1000,
          padding: '12px 24px',
          background: 'rgba(15, 15, 15, 0.85)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '30px',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          fontWeight: 'bold',
          fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          transition: 'background 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(40, 40, 40, 0.95)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(15, 15, 15, 0.85)'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
        Floor Plan View
      </button>

      {/* Model Loading Overlay */}
      {staging?.loadingModelId && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2000,
          background: 'rgba(15, 15, 15, 0.9)',
          padding: '24px 32px',
          borderRadius: '16px',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          color: '#fff',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 229, 255, 0.1)',
          backdropFilter: 'blur(12px)',
          fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#00e5ff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>Loading 3D Model...</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Downloading and processing assets</div>
          </div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Staging Transform Toolbar */}
      {stagingMode && staging?.selectedItemId && (
        <div style={{
          position: 'absolute',
          bottom: '120px', /* Above the timeline/bottom bar */
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Tag Info Popup (Engine/Read-only mode) */}
      {activeTagInfo && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1100,
            background: 'rgba(12, 12, 20, 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 229, 255, 0.25)',
            borderRadius: '16px',
            padding: '24px',
            minWidth: '300px',
            maxWidth: '420px',
            color: '#fff',
            boxShadow: '0 12px 48px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 229, 255, 0.08)',
            animation: 'tagInfoSlideUp 0.3s ease-out',
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setActiveTagInfo(null)}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.6)',
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            ✕
          </button>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(0, 150, 200, 0.6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 0 16px rgba(0, 229, 255, 0.3)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </div>
            <div style={{ paddingRight: 20 }}>
              <h3 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: '#fff',
              }}>
                {activeTagInfo.title}
              </h3>
              <span style={{ fontSize: '11px', color: 'rgba(0, 229, 255, 0.7)', fontWeight: 500 }}>Annotation Point</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3), transparent)', marginBottom: 14 }} />

          {/* Description */}
          {activeTagInfo.description ? (
            <p style={{
              margin: '0 0 16px 0',
              fontSize: '13px',
              lineHeight: 1.6,
              color: 'rgba(255,255,255,0.75)',
            }}>
              {activeTagInfo.description}
            </p>
          ) : (
            <p style={{
              margin: '0 0 16px 0',
              fontSize: '13px',
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.35)',
            }}>
              No description provided.
            </p>
          )}

          {/* Documents */}
          {activeTagInfo.documents && activeTagInfo.documents.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attached Documents</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeTagInfo.documents.map(doc => (
                  <a
                    key={doc.id}
                    href={`/documents/${doc.fileUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: '8px',
                      color: 'rgba(0, 229, 255, 0.95)',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 500,
                      border: '1px solid rgba(255,255,255,0.08)',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.title}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Animation keyframes for tag info popup */}
      <style>{`
        @keyframes tagInfoSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
});

ModelAndScansViewer.displayName = 'ModelAndScansViewer';

export default ModelAndScansViewer;
