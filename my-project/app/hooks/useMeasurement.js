import { useRef, useCallback, useState } from 'react';
import * as THREE from 'three';

/**
 * Measurement tool hook for the Studio editor.
 * Raycasts against the GLB model mesh to place measurement markers and calculate distances.
 * 
 * @param {React.MutableRefObject} viewerRef - Ref to the ModelAndScansViewer imperative handle
 */
export const useMeasurement = (viewerRef) => {
  const [measurements, setMeasurements] = useState([]);
  const [hasPendingPoint, setHasPendingPoint] = useState(false);
  const pendingPointRef = useRef(null);           // First point waiting for a pair
  const markersGroupRef = useRef(null);           // THREE.Group holding all visual markers
  const activeMeasurementIdRef = useRef(0);

  // Ensure the markers group exists in the scene
  const ensureMarkersGroup = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (!markersGroupRef.current && scene) {
      const group = new THREE.Group();
      group.name = 'measurementMarkers';
      group.renderOrder = 999;
      scene.add(group);
      markersGroupRef.current = group;
    }
    return markersGroupRef.current;
  }, [viewerRef]);

  // Create a visible marker sphere at a world position
  const createMarker = useCallback((position, color = 0x00e5ff) => {
    const geo = new THREE.SphereGeometry(0.03, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ 
      color, 
      depthTest: false,
      transparent: true,
      opacity: 0.9 
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.copy(position);
    sphere.renderOrder = 1000;
    return sphere;
  }, []);

  // Create a line between two points
  const createLine = useCallback((p1, p2) => {
    const points = [p1.clone(), p2.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
      linewidth: 2
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 999;
    return line;
  }, []);

  // Create a midpoint label sprite
  const createDistanceLabel = useCallback((midpoint, distance) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 64, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, 254, 62, 10);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 28px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${distance.toFixed(2)} m`, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({ 
      map: texture, 
      depthTest: false,
      transparent: true 
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(midpoint);
    sprite.position.z += 0.12;
    sprite.scale.set(0.5, 0.125, 1);
    sprite.renderOrder = 1001;
    return sprite;
  }, []);

  // Handle a measurement click on the 3D canvas
  const handleMeasurementClick = useCallback((event) => {
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

    // Collect only GLB model meshes for raycasting
    const meshes = [];
    model.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });

    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) return;

    const hitPoint = intersects[0].point.clone();
    const group = ensureMarkersGroup();
    if (!group) return;

    if (!pendingPointRef.current) {
      // First point of the measurement
      const marker = createMarker(hitPoint, 0x00e5ff);
      group.add(marker);
      pendingPointRef.current = { point: hitPoint, marker };
      setHasPendingPoint(true);
    } else {
      // Second point — complete the measurement
      const startPoint = pendingPointRef.current.point;
      const startMarker = pendingPointRef.current.marker;  // capture before nullifying ref
      const distance = startPoint.distanceTo(hitPoint);
      const midpoint = startPoint.clone().add(hitPoint).multiplyScalar(0.5);
      const id = ++activeMeasurementIdRef.current;

      const endMarker = createMarker(hitPoint, 0xff6b6b);
      const line = createLine(startPoint, hitPoint);
      const label = createDistanceLabel(midpoint, distance);

      group.add(endMarker);
      group.add(line);
      group.add(label);

      // Clear the pending ref BEFORE the state update so it's safe
      pendingPointRef.current = null;
      setHasPendingPoint(false);

      setMeasurements(prev => [...prev, {
        id,
        distance,
        from: { x: startPoint.x, y: startPoint.y, z: startPoint.z },
        to: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
        objects: [startMarker, endMarker, line, label]
      }]);
    }
  }, [viewerRef, ensureMarkersGroup, createMarker, createLine, createDistanceLabel]);

  // Remove a specific measurement by id
  const removeMeasurement = useCallback((measurementId) => {
    setMeasurements(prev => {
      const target = prev.find(m => m.id === measurementId);
      if (target && markersGroupRef.current) {
        target.objects.forEach(obj => {
          markersGroupRef.current.remove(obj);
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        });
      }
      return prev.filter(m => m.id !== measurementId);
    });
  }, []);

  // Clear all measurements
  const clearAllMeasurements = useCallback(() => {
    if (markersGroupRef.current) {
      markersGroupRef.current.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      markersGroupRef.current.clear();
    }
    pendingPointRef.current = null;
    setHasPendingPoint(false);
    setMeasurements([]);
  }, []);

  // Cancel a pending first point
  const cancelPending = useCallback(() => {
    if (pendingPointRef.current && markersGroupRef.current) {
      const marker = pendingPointRef.current.marker;
      markersGroupRef.current.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material) marker.material.dispose();
      pendingPointRef.current = null;
      setHasPendingPoint(false);
    }
  }, []);

  return {
    measurements,
    hasPendingPoint,
    handleMeasurementClick,
    removeMeasurement,
    clearAllMeasurements,
    cancelPending
  };
};
