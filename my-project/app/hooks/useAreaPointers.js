import { useRef, useCallback, useState, useEffect } from 'react';
import * as THREE from 'three';
import { createAreaPointerGroup } from '../utils/createAreaPointerGraphics';

const API = 'http://localhost:3000';

export const useAreaPointers = (viewerRef, tourId) => {
  const [areaPointers, setAreaPointers] = useState([]);
  const [selectedPointerId, setSelectedPointerId] = useState(null);
  const groupRef = useRef(null);

  const getToken = () => localStorage.getItem('access_token');

  const ensurePointersGroup = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (!groupRef.current && scene) {
      const existing = scene.getObjectByName('areaPointers');
      if (existing) {
        // Take ownership: clear the read-only pointers so we can manage interactive ones
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

  const addPointerMesh = useCallback((pointer) => {
    const group = ensurePointersGroup();
    if (!group) return null;

    const ptr = createAreaPointerGroup(
      pointer.name,
      pointer.color || '#ff0000',
      pointer.posX,
      pointer.posY,
      pointer.posZ,
      pointer.height ?? 15.0,
      pointer.thickness ?? 0.04,
      pointer.labelSize ?? 1.0
    );
    ptr.userData = { pointerId: pointer.id };
    group.add(ptr);
    return ptr;
  }, [ensurePointersGroup]);

  // Load existing area pointers
  useEffect(() => {
    if (!tourId) return;
    const token = getToken();
    if (!token) return;

    fetch(`${API}/tours/${tourId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(tour => {
        if (tour.areaPointers && tour.areaPointers.length > 0) {
          const loaded = tour.areaPointers.map(p => ({
            ...p,
            mesh: null,
          }));
          setAreaPointers(loaded);
        }
      })
      .catch(err => console.error('Failed to load area pointers:', err));
  }, [tourId]);

  // Materialize meshes once Three.js scene + data are both ready
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

      if (changed) {
        setAreaPointers(nextPointers);
      }
      return true;
    };

    if (!tryInitMeshes()) {
      const interval = setInterval(() => {
        if (tryInitMeshes()) {
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [areaPointers, ensurePointersGroup, addPointerMesh, viewerRef]);

  const trySelectPointer = useCallback((event) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    if (!renderer || !camera) return false;

    const group = ensurePointersGroup();
    if (group && group.children.length > 0) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // We intersect against child meshes recursively
      const intersects = raycaster.intersectObjects(group.children, true);
      if (intersects.length > 0) {
        // Find top level group (which has userData.pointerId)
        let clickedObj = intersects[0].object;
        while (clickedObj.parent && !clickedObj.userData.pointerId) {
          clickedObj = clickedObj.parent;
        }
        if (clickedObj.userData.pointerId) {
          const clickedPointerId = clickedObj.userData.pointerId;
          setSelectedPointerId(clickedPointerId);
          return true;
        }
      }
    }
    return false;
  }, [viewerRef, ensurePointersGroup]);

  // Handle placement click
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

    if (onPromptDetails) {
      onPromptDetails(hitPoint);
    }
  }, [viewerRef, trySelectPointer]);

  // Create Pointer
  const createPointer = useCallback(async (name, color, position) => {
    const token = getToken();
    if (!token || !tourId) return;

    try {
      const res = await fetch(`${API}/tours/${tourId}/area-pointers`, {
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
      const res = await fetch(`${API}/tours/${tourId}/area-pointers/${pointerId}`, {
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
          // Re-create mesh if appearance properties changed
          if (p.mesh && (
            data.name !== undefined || 
            data.color !== undefined ||
            data.height !== undefined ||
            data.thickness !== undefined ||
            data.labelSize !== undefined
          )) {
            const group = ensurePointersGroup();
            if (group) {
              group.remove(p.mesh);
            }
            const nameToUse = data.name !== undefined ? data.name : p.name;
            const colorToUse = data.color !== undefined ? data.color : (p.color || '#ff0000');
            const heightToUse = data.height !== undefined ? data.height : (p.height ?? 15.0);
            const thicknessToUse = data.thickness !== undefined ? data.thickness : (p.thickness ?? 0.04);
            const labelSizeToUse = data.labelSize !== undefined ? data.labelSize : (p.labelSize ?? 1.0);
            
            const newMesh = createAreaPointerGroup(nameToUse, colorToUse, p.posX, p.posY, p.posZ, heightToUse, thicknessToUse, labelSizeToUse);
            newMesh.userData = { pointerId: p.id };
            group.add(newMesh);
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
      const res = await fetch(`${API}/tours/${tourId}/area-pointers/${pointerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to delete area pointer');

      setAreaPointers(prev => {
        const target = prev.find(p => p.id === pointerId);
        if (target?.mesh && groupRef.current) {
          groupRef.current.remove(target.mesh);
        }
        return prev.filter(p => p.id !== pointerId);
      });

      if (selectedPointerId === pointerId) setSelectedPointerId(null);
    } catch (err) {
      console.error('Area pointer deletion failed:', err);
    }
  }, [tourId, selectedPointerId]);

  const selectPointer = useCallback((pointerId) => {
    setSelectedPointerId(pointerId);
  }, []);

  const deselectPointer = useCallback(() => {
    setSelectedPointerId(null);
  }, []);

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
  };
};
