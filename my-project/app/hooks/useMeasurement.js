import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * Draw a high-contrast survey distance label on canvas
 */
const drawLabelCanvas = (canvas, distance, isSelected = false) => {
  const ctx = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  ctx.clearRect(0, 0, 256, 64);

  // Background
  ctx.fillStyle = isSelected ? 'rgba(15, 23, 42, 0.96)' : 'rgba(7, 9, 14, 0.88)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 64, 12);
  ctx.fill();

  // Border: Glowing gold (#facc15) when selected, precision cyan (#00e5ff) when unselected
  ctx.strokeStyle = isSelected ? '#facc15' : '#00e5ff';
  ctx.lineWidth = isSelected ? 4 : 2.5;
  ctx.beginPath();
  ctx.roundRect(1, 1, 254, 62, 12);
  ctx.stroke();

  // Highlight pill accent on the left
  if (isSelected) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(4, 4, 8, 56, 4);
    ctx.fill();
  }

  // Text
  ctx.fillStyle = isSelected ? '#fef08a' : '#ffffff';
  ctx.font = 'bold 27px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${distance.toFixed(2)} m`, isSelected ? 134 : 128, 32);
};

/**
 * Measurement tool hook for 3D Viewers (Drone Survey & Virtual Tour).
 * Raycasts against the GLB model mesh / 3D Tileset to place measurement markers and calculate distances.
 * 
 * Supports:
 * - Differentiating deliberate clicks from camera orbit drag / hover
 * - Selecting measurements from 3D scene or from UI list
 * - Highlighting selected measurement in both 3D scene and UI
 * - Deleting individual or all measurements with complete Three.js resource cleanup
 * 
 * @param {React.MutableRefObject} viewerRef - Ref to viewer imperative handle
 */
export const useMeasurement = (viewerRef) => {
  const [measurements, setMeasurements] = useState([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState(null);
  const [hasPendingPoint, setHasPendingPoint] = useState(false);
  const pendingPointRef = useRef(null);           // First point waiting for a pair
  const markersGroupRef = useRef(null);           // THREE.Group holding all visual markers
  const activeMeasurementIdRef = useRef(0);

  // Derive the active selected measurement
  const selectedMeasurement = useMemo(() => {
    if (measurements.length === 0) return null;
    return measurements.find(m => m.id === selectedMeasurementId) || measurements[measurements.length - 1];
  }, [measurements, selectedMeasurementId]);

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
  const createMarker = useCallback((position, color = 0x00e5ff, measurementId = null) => {
    const geo = new THREE.SphereGeometry(0.35, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ 
      color, 
      depthTest: false,
      transparent: true,
      opacity: 0.95 
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.copy(position);
    sphere.renderOrder = 1000;
    sphere.userData = { type: 'measurement_marker', measurementId };
    return sphere;
  }, []);

  // Create a line between two points
  const createLine = useCallback((p1, p2, measurementId = null) => {
    const points = [p1.clone(), p2.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
      linewidth: 3
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 999;
    line.userData = { type: 'measurement_line', measurementId };
    return line;
  }, []);

  // Create a midpoint label sprite
  const createDistanceLabel = useCallback((midpoint, distance, measurementId = null) => {
    const canvas = document.createElement('canvas');
    drawLabelCanvas(canvas, distance, false);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({ 
      map: texture, 
      depthTest: false,
      transparent: true 
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(midpoint);
    sprite.position.y += 0.8;
    sprite.scale.set(3.5, 0.88, 1);
    sprite.renderOrder = 1001;
    sprite.userData = { 
      type: 'measurement_label', 
      measurementId,
      canvas,
      distance 
    };
    return sprite;
  }, []);

  // Visual Highlighting: Update 3D colors and scales based on active selection
  const update3DHighlights = useCallback((activeId) => {
    measurements.forEach(m => {
      const isSelected = m.id === activeId;
      
      // 1. Line highlight: Vibrant gold when selected, calm cyan when inactive
      if (m.line?.material) {
        m.line.material.color.set(isSelected ? 0xfacc15 : 0x0284c7);
        m.line.material.opacity = isSelected ? 1.0 : 0.55;
        m.line.renderOrder = isSelected ? 1005 : 999;
      }
      
      // 2. Start Marker: Gold when selected, cyan when inactive
      if (m.startMarker?.material) {
        m.startMarker.material.color.set(isSelected ? 0xfacc15 : 0x00e5ff);
        m.startMarker.scale.setScalar(isSelected ? 1.35 : 1.0);
        m.startMarker.renderOrder = isSelected ? 1006 : 1000;
      }
      
      // 3. End Marker: Crimson when selected, soft red when inactive
      if (m.endMarker?.material) {
        m.endMarker.material.color.set(isSelected ? 0xef4444 : 0xf87171);
        m.endMarker.scale.setScalar(isSelected ? 1.35 : 1.0);
        m.endMarker.renderOrder = isSelected ? 1006 : 1000;
      }
      
      // 4. Label Sprite: Enlarged with gold border
      if (m.label?.material) {
        m.label.scale.set(isSelected ? 4.1 : 3.5, isSelected ? 1.02 : 0.88, 1);
        m.label.renderOrder = isSelected ? 1007 : 1001;
        if (m.label.userData?.canvas) {
          drawLabelCanvas(m.label.userData.canvas, m.label.userData.distance, isSelected);
          if (m.label.material.map) {
            m.label.material.map.needsUpdate = true;
          }
        }
      }
    });
  }, [measurements]);

  // Keep 3D highlights in sync whenever selected ID or measurements array changes
  useEffect(() => {
    const activeId = selectedMeasurementId ?? (measurements.length > 0 ? measurements[measurements.length - 1].id : null);
    update3DHighlights(activeId);
  }, [selectedMeasurementId, measurements, update3DHighlights]);

  // Select a specific measurement by ID
  const selectMeasurement = useCallback((id) => {
    setSelectedMeasurementId(id);
    update3DHighlights(id);
  }, [update3DHighlights]);

  // Raycast Hit Detection: Check if click intersects any 3D measurement objects
  const checkMeasurementHit = useCallback((raycaster) => {
    if (!markersGroupRef.current || measurements.length === 0) return null;

    const prevLineThreshold = raycaster.params?.Line?.threshold;
    if (raycaster.params) {
      if (!raycaster.params.Line) raycaster.params.Line = {};
      raycaster.params.Line.threshold = 0.8; // Generous threshold for clicking measurement lines
    }

    const hits = raycaster.intersectObjects(markersGroupRef.current.children, true);

    if (raycaster.params?.Line) {
      raycaster.params.Line.threshold = prevLineThreshold ?? 1;
    }

    if (hits.length > 0) {
      for (const hit of hits) {
        let cur = hit.object;
        while (cur && cur !== markersGroupRef.current) {
          if (cur.userData?.measurementId) {
            return cur.userData.measurementId;
          }
          cur = cur.parent;
        }
      }
    }
    return null;
  }, [measurements]);

  // Handle a measurement click on the 3D canvas (Stationary deliberate click)
  const handleMeasurementClick = useCallback((event) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    const model = viewerRef.current?.modelRef?.current;
    const tilesGroup = viewerRef.current?.tilesetEngine?.getGroup?.() || viewerRef.current?.tilesetEngineRef?.current?.getGroup?.();
    
    if (!renderer || !camera) return;

    // Check if the click hit an existing measurement in 3D to select it
    if (event?.clientX !== undefined) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, camera);
      const hitMeasurementId = checkMeasurementHit(ray);
      if (hitMeasurementId) {
        selectMeasurement(hitMeasurementId);
        return; // Selection handled, do not drop point
      }
    }

    let hitPoint = null;
    if (event?.isVector3) {
      hitPoint = event.clone();
    } else if (event?.clientX !== undefined) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // Collect meshes from GLB model or 3D Tileset group
      const meshes = [];
      if (model) {
        model.traverse((child) => {
          if (child.isMesh) meshes.push(child);
        });
      }
      if (tilesGroup) {
        tilesGroup.traverse((child) => {
          if (child.isMesh) meshes.push(child);
        });
      }

      if (meshes.length === 0) return;

      const intersects = raycaster.intersectObjects(meshes, true);
      if (intersects.length === 0) return;

      hitPoint = intersects[0].point.clone();
    }

    if (!hitPoint) return;

    const group = ensureMarkersGroup();
    if (!group) return;

    if (!pendingPointRef.current) {
      // First point of the measurement
      const marker = createMarker(hitPoint, 0x00e5ff, null);
      group.add(marker);
      pendingPointRef.current = { point: hitPoint, marker };
      setHasPendingPoint(true);
    } else {
      // Second point — complete the measurement
      const startPoint = pendingPointRef.current.point;
      const startMarker = pendingPointRef.current.marker;
      
      const dist3D = startPoint.distanceTo(hitPoint);
      const dist2D = Math.sqrt(Math.pow(startPoint.x - hitPoint.x, 2) + Math.pow(startPoint.z - hitPoint.z, 2));
      const distZ = Math.abs(startPoint.y - hitPoint.y);
      const slope = dist2D > 0 ? (distZ / dist2D) * 100 : 0;

      const midpoint = startPoint.clone().add(hitPoint).multiplyScalar(0.5);
      const id = ++activeMeasurementIdRef.current;

      // Tag the first marker now that measurement has an ID
      startMarker.userData.measurementId = id;

      const endMarker = createMarker(hitPoint, 0xff6b6b, id);
      const line = createLine(startPoint, hitPoint, id);
      const label = createDistanceLabel(midpoint, dist3D, id);

      group.add(endMarker);
      group.add(line);
      group.add(label);

      // Clear the pending ref BEFORE the state update so it's safe
      pendingPointRef.current = null;
      setHasPendingPoint(false);

      const newMeasurement = {
        id,
        distance: Number(dist3D.toFixed(2)),
        dist3D: Number(dist3D.toFixed(2)),
        dist2D: Number(dist2D.toFixed(2)),
        distZ: Number(distZ.toFixed(2)),
        slope: Number(slope.toFixed(1)),
        from: { x: startPoint.x, y: startPoint.y, z: startPoint.z },
        to: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
        startMarker,
        endMarker,
        line,
        label,
        objects: [startMarker, endMarker, line, label]
      };

      setMeasurements(prev => [...prev, newMeasurement]);
      setSelectedMeasurementId(id);
    }
  }, [viewerRef, ensureMarkersGroup, createMarker, createLine, createDistanceLabel, checkMeasurementHit, selectMeasurement]);

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
      const remaining = prev.filter(m => m.id !== measurementId);
      
      // Shift selection to the last remaining measurement if current was deleted
      setSelectedMeasurementId(curr => {
        if (curr === measurementId) {
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        }
        return curr;
      });
      
      return remaining;
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
    setSelectedMeasurementId(null);
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
    selectedMeasurementId,
    setSelectedMeasurementId,
    selectedMeasurement,
    selectMeasurement,
    hasPendingPoint,
    handleMeasurementClick,
    removeMeasurement,
    clearAllMeasurements,
    cancelPending,
    checkMeasurementHit,
    markersGroupRef,
  };
};
