import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * Draw a clean cross-section label on canvas
 */
const drawSectionLabel = (canvas, title, length, isSelected = false) => {
  const ctx = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  ctx.clearRect(0, 0, 256, 64);

  // Background
  ctx.fillStyle = isSelected ? 'rgba(15, 23, 42, 0.96)' : 'rgba(7, 9, 14, 0.88)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 64, 12);
  ctx.fill();

  // Border: Gold (#facc15) when selected, cyan (#06b6d4) when inactive
  ctx.strokeStyle = isSelected ? '#facc15' : '#06b6d4';
  ctx.lineWidth = isSelected ? 4 : 2.5;
  ctx.beginPath();
  ctx.roundRect(1, 1, 254, 62, 12);
  ctx.stroke();

  // Title & Distance
  ctx.fillStyle = isSelected ? '#fef08a' : '#38bdf8';
  ctx.font = 'bold 20px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 128, 26);

  ctx.fillStyle = '#ffffff';
  ctx.font = '16px monospace';
  ctx.fillText(`${Number(length).toFixed(1)} m`, 128, 48);
};

/**
 * Custom Hook: Cross-Section Topographic Profiler & 3D Contour Visualizer
 * Supports:
 * - 3D terrain profile contour rendering on mesh
 * - Real-time synchronized 3D beacon tracking cursor over the elevation graph
 * - Managing multiple slices (list, selection, 3D highlight, deletion)
 * - Orbit/drag-safe click handling
 */
export function useCrossSection(viewerRef) {
  const [crossSections, setCrossSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [pendingPoints, setPendingPoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(true);

  const groupRef = useRef(null);
  const hoverBeaconRef = useRef(null);
  const nextIdRef = useRef(1);

  // Derive active selected slice
  const selectedSection = useMemo(() => {
    if (crossSections.length === 0) return null;
    return crossSections.find(s => s.id === selectedSectionId) || crossSections[crossSections.length - 1];
  }, [crossSections, selectedSectionId]);

  // Ensure visuals group in 3D scene
  const ensureVisualsGroup = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (!groupRef.current && scene) {
      const group = new THREE.Group();
      group.name = 'crossSectionVisualsGroup';
      group.renderOrder = 998;
      scene.add(group);
      groupRef.current = group;

      // Create Synchronized 3D Hover Beacon
      const beaconGroup = new THREE.Group();
      beaconGroup.name = 'crossSectionHoverBeacon';
      beaconGroup.visible = false;
      beaconGroup.renderOrder = 1010;

      // Glowing sphere
      const sphereGeo = new THREE.SphereGeometry(0.55, 24, 24);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      beaconGroup.add(sphere);

      // Vertical guide line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -10, 0),
        new THREE.Vector3(0, 10, 0)
      ]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xfacc15,
        dashSize: 0.6,
        gapSize: 0.4,
        depthTest: false,
        transparent: true,
        opacity: 0.85
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      beaconGroup.add(line);

      // Pulsing outer ring
      const ringGeo = new THREE.RingGeometry(0.7, 0.9, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true,
        opacity: 0.9
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      beaconGroup.add(ring);

      group.add(beaconGroup);
      hoverBeaconRef.current = beaconGroup;
    }
    return groupRef.current;
  }, [viewerRef]);

  // Update 3D Highlights for selected cross-section
  const update3DHighlights = useCallback((activeId) => {
    crossSections.forEach(section => {
      const isSelected = section.id === activeId;
      
      // Topographic Contour Line
      if (section.contourLine?.material) {
        section.contourLine.material.color.set(isSelected ? 0xfacc15 : 0x06b6d4);
        section.contourLine.material.opacity = isSelected ? 1.0 : 0.6;
        section.contourLine.renderOrder = isSelected ? 1005 : 999;
      }

      // Straight baseline
      if (section.baseLine?.material) {
        section.baseLine.material.color.set(isSelected ? 0xfacc15 : 0x0284c7);
        section.baseLine.material.opacity = isSelected ? 0.9 : 0.4;
      }

      // Markers A & B
      if (section.startMarker?.material) {
        section.startMarker.scale.setScalar(isSelected ? 1.4 : 1.0);
        section.startMarker.renderOrder = isSelected ? 1006 : 1000;
      }
      if (section.endMarker?.material) {
        section.endMarker.scale.setScalar(isSelected ? 1.4 : 1.0);
        section.endMarker.renderOrder = isSelected ? 1006 : 1000;
      }

      // Midpoint Label Sprite
      if (section.label?.material) {
        section.label.scale.set(isSelected ? 4.2 : 3.5, isSelected ? 1.05 : 0.88, 1);
        if (section.label.userData?.canvas) {
          drawSectionLabel(section.label.userData.canvas, section.name, section.length, isSelected);
          if (section.label.material.map) section.label.material.map.needsUpdate = true;
        }
      }
    });
  }, [crossSections]);

  // Sync 3D highlights when selection or slice array changes
  useEffect(() => {
    const activeId = selectedSectionId ?? (crossSections.length > 0 ? crossSections[crossSections.length - 1].id : null);
    update3DHighlights(activeId);
  }, [selectedSectionId, crossSections, update3DHighlights]);

  // Select a slice
  const selectSection = useCallback((id) => {
    setSelectedSectionId(id);
    update3DHighlights(id);
  }, [update3DHighlights]);

  // Real-time 3D Hover Indicator update (from graph hover)
  const setHoveredSample = useCallback((sample) => {
    const beacon = hoverBeaconRef.current;
    if (!beacon) return;

    if (sample && sample.x !== undefined && sample.y !== undefined && sample.z !== undefined) {
      beacon.position.set(sample.x, sample.y + 0.15, sample.z);
      beacon.visible = true;
    } else {
      beacon.visible = false;
    }
  }, []);

  // Handle Deliberate Click from 3D Viewport
  const handleCrossSectionClick = useCallback((hitPoint) => {
    // If drawing is locked (e.g. section completed and user hasn't clicked "+ New Slice")
    if (!isDrawing) return;

    const group = ensureVisualsGroup();
    if (!group) return;

    if (pendingPoints.length === 0) {
      // ─── First Point (A) ───
      const p1 = hitPoint.clone();
      const startMarkerGeo = new THREE.SphereGeometry(0.4, 20, 20);
      const startMarkerMat = new THREE.MeshBasicMaterial({
        color: 0x10b981, // Emerald Green for Point A
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const startMarker = new THREE.Mesh(startMarkerGeo, startMarkerMat);
      startMarker.position.copy(p1);
      startMarker.renderOrder = 1002;
      group.add(startMarker);

      setPendingPoints([p1]);
    } else if (pendingPoints.length === 1) {
      // ─── Second Point (B) — Complete Cross-Section ───
      const p1 = pendingPoints[0];
      const p2 = hitPoint.clone();

      if (!viewerRef.current?.sampleCrossSection) return;

      const profile = viewerRef.current.sampleCrossSection(p1, p2, 80);
      if (!profile) return;

      const id = nextIdRef.current++;
      const name = `Profile A-B #${id}`;

      // End Marker (Point B)
      const endMarkerGeo = new THREE.SphereGeometry(0.4, 20, 20);
      const endMarkerMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e, // Rose Red for Point B
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const endMarker = new THREE.Mesh(endMarkerGeo, endMarkerMat);
      endMarker.position.copy(p2);
      endMarker.renderOrder = 1002;
      endMarker.userData = { sectionId: id, type: 'cross_section_marker' };

      // Straight Baseline
      const baseLineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const baseLineMat = new THREE.LineDashedMaterial({
        color: 0x0284c7,
        dashSize: 1.0,
        gapSize: 0.6,
        depthTest: false,
        transparent: true,
        opacity: 0.5,
        linewidth: 2
      });
      const baseLine = new THREE.Line(baseLineGeo, baseLineMat);
      baseLine.computeLineDistances();
      baseLine.renderOrder = 998;
      baseLine.userData = { sectionId: id, type: 'cross_section_baseline' };

      // Topographic 3D Surface Contour Polyline (Elevated 0.12m to prevent z-fighting with terrain)
      const contourPoints = profile.samples.map(s => new THREE.Vector3(s.x, s.y + 0.12, s.z));
      const contourGeo = new THREE.BufferGeometry().setFromPoints(contourPoints);
      const contourMat = new THREE.LineBasicMaterial({
        color: 0x06b6d4, // Cyan Neon Topographic Slice
        linewidth: 3,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const contourLine = new THREE.Line(contourGeo, contourMat);
      contourLine.renderOrder = 1000;
      contourLine.userData = { sectionId: id, type: 'cross_section_contour' };

      // Midpoint Title & Distance Sprite Label
      const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const canvas = document.createElement('canvas');
      drawSectionLabel(canvas, name, profile.length, true);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const labelMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
      const label = new THREE.Sprite(labelMat);
      label.position.copy(midpoint);
      label.position.y += 1.2;
      label.scale.set(4.0, 1.0, 1);
      label.renderOrder = 1003;
      label.userData = { sectionId: id, type: 'cross_section_label', canvas, name, length: profile.length };

      group.add(endMarker);
      group.add(baseLine);
      group.add(contourLine);
      group.add(label);

      // Lock drawing until "+ New Slice" is clicked
      setIsDrawing(false);
      setPendingPoints([]);

      const newSection = {
        id,
        name,
        p1,
        p2,
        length: profile.length,
        minElev: profile.minElev,
        maxElev: profile.maxElev,
        deltaElev: profile.deltaElev,
        slope: profile.slope,
        profile,
        startMarker: group.children.find(c => c.position.equals(p1)),
        endMarker,
        baseLine,
        contourLine,
        label,
        objects: [endMarker, baseLine, contourLine, label]
      };

      setCrossSections(prev => [...prev, newSection]);
      setSelectedSectionId(id);
    }
  }, [isDrawing, pendingPoints, viewerRef, ensureVisualsGroup]);

  // Start a new slice (unlocks drawing mode)
  const startNewSlice = useCallback(() => {
    setIsDrawing(true);
    setPendingPoints([]);
  }, []);

  // Delete a specific cross-section
  const deleteSection = useCallback((sectionId) => {
    setCrossSections(prev => {
      const target = prev.find(s => s.id === sectionId);
      if (target && groupRef.current) {
        target.objects.forEach(obj => {
          groupRef.current.remove(obj);
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        });
        if (target.startMarker) {
          groupRef.current.remove(target.startMarker);
          if (target.startMarker.geometry) target.startMarker.geometry.dispose();
          if (target.startMarker.material) target.startMarker.material.dispose();
        }
      }
      const remaining = prev.filter(s => s.id !== sectionId);
      setSelectedSectionId(curr => {
        if (curr === sectionId) {
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        }
        return curr;
      });
      return remaining;
    });

    if (hoverBeaconRef.current) {
      hoverBeaconRef.current.visible = false;
    }
  }, []);

  // Clear all cross-sections
  const clearAllSections = useCallback(() => {
    if (groupRef.current) {
      while (groupRef.current.children.length > 0) {
        const child = groupRef.current.children[0];
        groupRef.current.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    }
    setPendingPoints([]);
    setCrossSections([]);
    setSelectedSectionId(null);
    setIsDrawing(true);
    if (hoverBeaconRef.current) {
      hoverBeaconRef.current.visible = false;
    }
  }, []);

  // Cancel pending first point
  const cancelPending = useCallback(() => {
    if (pendingPoints.length > 0 && groupRef.current) {
      const p1 = pendingPoints[0];
      const startMarker = groupRef.current.children.find(c => c.position.equals(p1));
      if (startMarker) {
        groupRef.current.remove(startMarker);
        if (startMarker.geometry) startMarker.geometry.dispose();
        if (startMarker.material) startMarker.material.dispose();
      }
      setPendingPoints([]);
      setIsDrawing(true);
    }
  }, [pendingPoints]);

  // Raycast checker to select cross-section from 3D scene
  const checkCrossSectionHit = useCallback((raycaster) => {
    if (!groupRef.current || crossSections.length === 0) return null;

    const prevThresh = raycaster.params?.Line?.threshold;
    if (raycaster.params) {
      if (!raycaster.params.Line) raycaster.params.Line = {};
      raycaster.params.Line.threshold = 1.0;
    }

    const hits = raycaster.intersectObjects(groupRef.current.children, true);
    if (raycaster.params?.Line) {
      raycaster.params.Line.threshold = prevThresh ?? 1;
    }

    if (hits.length > 0) {
      for (const hit of hits) {
        let cur = hit.object;
        while (cur && cur !== groupRef.current) {
          if (cur.userData?.sectionId) {
            return cur.userData.sectionId;
          }
          cur = cur.parent;
        }
      }
    }
    return null;
  }, [crossSections]);

  return {
    crossSections,
    selectedSectionId,
    selectedSection,
    pendingPoints,
    isDrawing,
    handleCrossSectionClick,
    startNewSlice,
    selectSection,
    deleteSection,
    clearAllSections,
    cancelPending,
    setHoveredSample,
    checkCrossSectionHit,
    groupRef
  };
}
