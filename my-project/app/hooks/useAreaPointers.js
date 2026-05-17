import { useRef, useCallback, useState, useEffect } from 'react';
import * as THREE from 'three';
import { createAreaPointerGroup, updateAreaWalls } from '../utils/createAreaPointerGraphics';

const API = 'http://app.alpha.openscaler.net:9251';

export const useAreaPointers = (viewerRef, tourId) => {
  const [areaPointers, setAreaPointers] = useState([]);
  const [selectedPointerId, setSelectedPointerId] = useState(null);
  const groupRef = useRef(null);

  // Drag state refs (not React state — avoids re-renders during drag)
  const dragRef = useRef({
    active: false,
    handleName: null,   // 'north' | 'south' | 'east' | 'west'
    pointerId: null,
    pointerGroup: null, // the THREE.Group being dragged
    startMouse: null,
    startSizeX: 0,
    startSizeY: 0,
    currentSizeX: 0,
    currentSizeY: 0,
    groundPlaneZ: 0,
  });

  const getToken = () => localStorage.getItem('access_token');

  const ensurePointersGroup = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (!groupRef.current && scene) {
      const existing = scene.getObjectByName('areaPointers');
      if (existing) {
        while (existing.children.length > 0) {
          const child = existing.children[0];
          existing.remove(child);
        }
        groupRef.current = existing;
      } else {
        const group = new THREE.Group();
        group.name = 'areaPointers';
        group.renderOrder = 997;
        scene.add(group);
        groupRef.current = group;
      }
    }
    return groupRef.current;
  }, [viewerRef]);

  /**
   * Removes ALL Three.js objects with the given pointerId from the scene.
   * This catches read-only duplicates created by useTourData and any stale meshes.
   */
  const purgePointerId = useCallback((pointerId) => {
    const group = groupRef.current;
    if (!group) return;
    const toRemove = [];
    group.traverse(child => {
      if (child.userData.pointerId === pointerId) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(obj => {
      obj.traverse(desc => {
        if (desc.geometry) desc.geometry.dispose();
        if (desc.material) {
          const mats = Array.isArray(desc.material) ? desc.material : [desc.material];
          mats.forEach(m => m.dispose());
        }
      });
      if (obj.parent) obj.parent.remove(obj);
    });
  }, []);

  const addPointerMesh = useCallback((pointer) => {
    const group = ensurePointersGroup();
    if (!group) return null;

    // Remove any existing objects with this pointerId (e.g. read-only from useTourData)
    purgePointerId(pointer.id);

    const ptr = createAreaPointerGroup(
      pointer.name,
      pointer.color || '#ff0000',
      pointer.posX,
      pointer.posY,
      pointer.posZ,
      pointer.height ?? 15.0,
      pointer.thickness ?? 0.04,
      pointer.labelSize ?? 1.0,
      pointer.sizeX ?? 3.0,
      pointer.sizeY ?? 3.0,
      pointer.wallHeight ?? 3.0
    );
    ptr.userData = { pointerId: pointer.id };
    group.add(ptr);
    return ptr;
  }, [ensurePointersGroup, purgePointerId]);

  // Load existing area pointers
  useEffect(() => {
    if (!tourId) return;
    const token = getToken();
    if (!token) return;

    fetch(`${API}/inspections/${tourId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(tour => {
        if (tour.areaPointers && tour.areaPointers.length > 0) {
          const loaded = tour.areaPointers.map(p => ({ ...p, mesh: null }));
          setAreaPointers(loaded);
        }
      })
      .catch(err => console.error('Failed to load area pointers:', err));
  }, [tourId]);

  // Materialize meshes
  useEffect(() => {
    if (areaPointers.length === 0) return;

    const tryInitMeshes = () => {
      const scene = viewerRef.current?.sceneRef?.current;
      if (!scene) return false;
      
      const group = ensurePointersGroup();
      if (!group) return false;

      let changed = false;
      const nextPointers = areaPointers.map((p) => {
        if (!p.mesh) {
          const mesh = addPointerMesh(p);
          if (mesh) {
            changed = true;
            return { ...p, mesh };
          }
        }
        return p;
      });

      if (changed) setAreaPointers(nextPointers);
      return true;
    };

    if (!tryInitMeshes()) {
      const interval = setInterval(() => {
        if (tryInitMeshes()) clearInterval(interval);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [areaPointers, ensurePointersGroup, addPointerMesh, viewerRef]);

  // ─── Drag Interaction ─────────────────────────────────────────

  /**
   * Try to start a drag on a handle sphere. Returns true if drag started.
   */
  const tryStartDrag = useCallback((event) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    if (!renderer || !camera) { console.log('[DRAG] No renderer/camera'); return false; }

    const handleGroup = groupRef.current;
    if (!handleGroup) { console.log('[DRAG] No handleGroup'); return false; }

    // Collect all handle meshes
    const handles = [];
    handleGroup.traverse(child => {
      if (child.userData.dragHandle) handles.push(child);
    });
    console.log('[DRAG] Found handles:', handles.length);
    if (handles.length === 0) return false;

    // Force world matrix update for accurate raycasting
    handleGroup.updateMatrixWorld(true);

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(handles, false);

    console.log('[DRAG] Raycast hits:', hits.length);
    if (hits.length === 0) return false;

    const hitHandle = hits[0].object;
    const handleName = hitHandle.userData.dragHandle;

    // Walk up to find the area pointer group (with userData.pointerId)
    let pointerGroup = hitHandle;
    while (pointerGroup.parent && !pointerGroup.userData.pointerId) {
      pointerGroup = pointerGroup.parent;
    }
    if (!pointerGroup.userData.pointerId) return false;

    // Find the pointer data
    const pid = pointerGroup.userData.pointerId;
    const pointerData = areaPointers.find(p => p.id === pid);
    if (!pointerData) return false;

    // Remove any OTHER groups with the same pointerId (safety net)
    const parentGroup = groupRef.current;
    if (parentGroup) {
      const dupes = parentGroup.children.filter(
        c => c !== pointerGroup && c.userData.pointerId === pid
      );
      dupes.forEach(d => { if (d.parent) d.parent.remove(d); });
    }

    const sx = pointerData.sizeX ?? 3.0;
    const sy = pointerData.sizeY ?? 3.0;

    dragRef.current = {
      active: true,
      handleName,
      pointerId: pid,
      pointerGroup,
      startMouse: mouse.clone(),
      startSizeX: sx,
      startSizeY: sy,
      currentSizeX: sx,
      currentSizeY: sy,
      groundPlaneZ: pointerGroup.position.z,
      // Store starting world position to anchor the opposite wall
      startGroupX: pointerGroup.position.x,
      startGroupY: pointerGroup.position.y,
    };

    // Disable orbit controls during drag
    const controls = viewerRef.current?.controlsRef?.current;
    if (controls) controls.enabled = false;

    console.log('[DRAG] Started drag on handle:', handleName);
    return true;
  }, [viewerRef, areaPointers]);

  /**
   * Handle mouse move during drag — update walls in real-time.
   */
  const handleDragMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    if (!renderer || !camera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    // Project mouse ray onto the horizontal plane at the pointer's Z
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -drag.groundPlaneZ);
    const worldPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, worldPoint);
    if (!worldPoint) return;

    const MIN_SIZE = 0.5;
    let newSizeX = drag.currentSizeX;
    let newSizeY = drag.currentSizeY;
    let newGroupX = drag.pointerGroup.position.x;
    let newGroupY = drag.pointerGroup.position.y;

    // Each handle only moves its own wall; the opposite wall stays fixed in world space.
    if (drag.handleName === 'north') {
      const fixedSouth = drag.startGroupY - drag.startSizeY / 2;
      const movingNorth = worldPoint.y;
      newSizeY = Math.max(MIN_SIZE, movingNorth - fixedSouth);
      newGroupY = fixedSouth + newSizeY / 2;
    } else if (drag.handleName === 'south') {
      const fixedNorth = drag.startGroupY + drag.startSizeY / 2;
      const movingSouth = worldPoint.y;
      newSizeY = Math.max(MIN_SIZE, fixedNorth - movingSouth);
      newGroupY = fixedNorth - newSizeY / 2;
    } else if (drag.handleName === 'east') {
      const fixedWest = drag.startGroupX - drag.startSizeX / 2;
      const movingEast = worldPoint.x;
      newSizeX = Math.max(MIN_SIZE, movingEast - fixedWest);
      newGroupX = fixedWest + newSizeX / 2;
    } else if (drag.handleName === 'west') {
      const fixedEast = drag.startGroupX + drag.startSizeX / 2;
      const movingWest = worldPoint.x;
      newSizeX = Math.max(MIN_SIZE, fixedEast - movingWest);
      newGroupX = fixedEast - newSizeX / 2;
    }

    // Move group center so opposite wall stays fixed
    drag.pointerGroup.position.x = newGroupX;
    drag.pointerGroup.position.y = newGroupY;
    drag.currentSizeX = newSizeX;
    drag.currentSizeY = newSizeY;

    // GPU-only update — no React state, no API calls
    const pointerData = areaPointers.find(p => p.id === drag.pointerId);
    const wh = pointerData?.wallHeight ?? 3.0;
    updateAreaWalls(drag.pointerGroup, newSizeX, newSizeY, wh);
  }, [viewerRef, areaPointers]);

  /**
   * Finalize drag — persist to backend.
   */
  const handleDragEnd = useCallback(async () => {
    const drag = dragRef.current;
    if (!drag.active) return;

    // Re-enable orbit controls
    const controls = viewerRef.current?.controlsRef?.current;
    if (controls) controls.enabled = true;

    const { pointerId, currentSizeX, currentSizeY, pointerGroup } = drag;
    drag.active = false;

    // Get the final group position (shifted during asymmetric drag)
    const finalPosX = pointerGroup.position.x;
    const finalPosY = pointerGroup.position.y;

    // Persist to backend
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/inspections/${tourId}/area-pointers/${pointerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sizeX: Math.round(currentSizeX * 100) / 100,
          sizeY: Math.round(currentSizeY * 100) / 100,
          posX: Math.round(finalPosX * 1000) / 1000,
          posY: Math.round(finalPosY * 1000) / 1000,
        }),
      });

      if (!res.ok) throw new Error('Failed to persist area resize');
      const updated = await res.json();

      // Remove the old mesh and any duplicates, then create a clean replacement
      setAreaPointers(prev => prev.map(p => {
        if (p.id === pointerId) {
          purgePointerId(pointerId);
          // Create fresh mesh with server-confirmed dimensions
          const freshData = { ...p, ...updated };
          const newMesh = createAreaPointerGroup(
            freshData.name,
            freshData.color || '#ff0000',
            freshData.posX, freshData.posY, freshData.posZ,
            freshData.height ?? 15.0,
            freshData.thickness ?? 0.04,
            freshData.labelSize ?? 1.0,
            freshData.sizeX ?? 3.0,
            freshData.sizeY ?? 3.0,
            freshData.wallHeight ?? 3.0
          );
          newMesh.userData = { pointerId: p.id };
          const grp = ensurePointersGroup();
          if (grp) grp.add(newMesh);
          return { ...freshData, mesh: newMesh };
        }
        return p;
      }));
    } catch (err) {
      console.error('Area resize persist failed:', err);
    }
  }, [tourId, viewerRef]);

  /**
   * Returns true if currently dragging (used to suppress other click handlers).
   */
  const isDragging = useCallback(() => dragRef.current.active, []);

  // ─── Existing Logic ───────────────────────────────────────────

  const trySelectPointer = useCallback((event) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    const scene = viewerRef.current?.sceneRef?.current;
    if (!renderer || !camera || !scene) return false;

    const group = ensurePointersGroup();
    if (group && group.children.length > 0) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      const pointerHits = raycaster.intersectObjects(group.children, true);
      if (pointerHits.length > 0) {
        const pointerHit = pointerHits[0];

        // 1. Check if model is closer
        const model = viewerRef.current?.modelRef?.current;
        if (model) {
          const modelHits = raycaster.intersectObject(model, true);
          if (modelHits.length > 0 && modelHits[0].distance < pointerHit.distance) {
            return false; // Model is in front
          }
        }

        // 2. Check if a tag is closer
        const tagGroup = scene.getObjectByName('tagMarkers');
        if (tagGroup && tagGroup.children.length > 0) {
          const tagHits = raycaster.intersectObjects(tagGroup.children, true);
          if (tagHits.length > 0 && tagHits[0].distance < pointerHit.distance) {
            return false; // Tag is in front
          }
        }

        let clickedObj = pointerHit.object;
        while (clickedObj.parent && !clickedObj.userData.pointerId) {
          clickedObj = clickedObj.parent;
        }
        if (clickedObj.userData.pointerId) {
          setSelectedPointerId(clickedObj.userData.pointerId);
          return true;
        }
      }
    }
    return false;
  }, [viewerRef, ensurePointersGroup]);

  const handlePointerClick = useCallback((event, onPromptDetails) => {
    if (trySelectPointer(event)) return;

    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    const model = viewerRef.current?.modelRef?.current;
    if (!renderer || !camera || !model) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const meshes = [];
    model.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });

    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) return;

    const hitPoint = intersects[0].point.clone();
    if (onPromptDetails) onPromptDetails(hitPoint);
  }, [viewerRef, trySelectPointer]);

  const createPointer = useCallback(async (name, color, position) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/inspections/${tourId}/area-pointers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          color,
          posX: position.x,
          posY: position.y,
          posZ: position.z,
        }),
      });

      if (!res.ok) throw new Error('Failed to create area pointer');
      const newPointer = await res.json();

      const mesh = addPointerMesh(newPointer);
      setAreaPointers(prev => [...prev, { ...newPointer, mesh }]);
      setSelectedPointerId(newPointer.id);

      return newPointer;
    } catch (err) {
      console.error('Area Pointer creation failed:', err);
    }
  }, [tourId, addPointerMesh]);

  const updatePointer = useCallback(async (pointerId, data) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/inspections/${tourId}/area-pointers/${pointerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to update area pointer');
      const updated = await res.json();

      setAreaPointers(prev => prev.map(p => {
        if (p.id === pointerId) {
          if (p.mesh && (
            data.name !== undefined || 
            data.color !== undefined ||
            data.height !== undefined ||
            data.thickness !== undefined ||
            data.labelSize !== undefined ||
            data.sizeX !== undefined ||
            data.sizeY !== undefined ||
            data.wallHeight !== undefined
          )) {
            // Remove ALL objects with this pointerId (including useTourData duplicates)
            purgePointerId(pointerId);

            const nameToUse = data.name !== undefined ? data.name : p.name;
            const colorToUse = data.color !== undefined ? data.color : (p.color || '#ff0000');
            const heightToUse = data.height !== undefined ? data.height : (p.height ?? 15.0);
            const thicknessToUse = data.thickness !== undefined ? data.thickness : (p.thickness ?? 0.04);
            const labelSizeToUse = data.labelSize !== undefined ? data.labelSize : (p.labelSize ?? 1.0);
            const sizeXToUse = data.sizeX !== undefined ? data.sizeX : (p.sizeX ?? 3.0);
            const sizeYToUse = data.sizeY !== undefined ? data.sizeY : (p.sizeY ?? 3.0);
            const wallHeightToUse = data.wallHeight !== undefined ? data.wallHeight : (p.wallHeight ?? 3.0);
            
            const newMesh = createAreaPointerGroup(
              nameToUse, colorToUse, p.posX, p.posY, p.posZ,
              heightToUse, thicknessToUse, labelSizeToUse, sizeXToUse, sizeYToUse, wallHeightToUse
            );
            newMesh.userData = { pointerId: p.id };
            const grp = ensurePointersGroup();
            if (grp) grp.add(newMesh);
            return { ...p, ...updated, mesh: newMesh };
          }
          return { ...p, ...updated };
        }
        return p;
      }));
    } catch (err) {
      console.error('Area pointer update failed:', err);
    }
  }, [tourId, ensurePointersGroup]);

  const deletePointer = useCallback(async (pointerId) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/inspections/${tourId}/area-pointers/${pointerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to delete area pointer');

      setAreaPointers(prev => {
        purgePointerId(pointerId);
        return prev.filter(p => p.id !== pointerId);
      });

      if (selectedPointerId === pointerId) setSelectedPointerId(null);
    } catch (err) {
      console.error('Area pointer deletion failed:', err);
    }
  }, [tourId, selectedPointerId]);

  const selectPointer = useCallback((pointerId) => setSelectedPointerId(pointerId), []);
  const deselectPointer = useCallback(() => setSelectedPointerId(null), []);

  const selectedPointer = areaPointers.find(p => p.id === selectedPointerId) || null;

  return {
    areaPointers,
    selectedPointer,
    selectedPointerId,
    trySelectPointer,
    handlePointerClick,
    createPointer,
    updatePointer,
    deletePointer,
    selectPointer,
    deselectPointer,
    // Drag API
    tryStartDrag,
    handleDragMove,
    handleDragEnd,
    isDragging,
  };
};
