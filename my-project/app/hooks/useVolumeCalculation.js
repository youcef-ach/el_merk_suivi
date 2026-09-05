import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

const DSM_DATUM_OFFSET = 99.31;

/**
 * 2D Polygon Shoelace Area Calculation
 */
function computePolygon2DArea(points) {
  let area = 0;
  const n = points.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].z;
    area -= points[j].x * points[i].z;
  }
  return Math.abs(area) / 2.0;
}

/**
 * 2D Point-in-Polygon Test (Ray Casting)
 */
function isPointInPolygon2D(px, pz, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    const intersect = ((zi > pz) !== (zj > pz)) &&
      (px < ((xj - xi) * (pz - zi)) / (zj - zi + 0.0000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Triangulate 2D Polygon using Centroid Fan Triangulation
 */
function triangulatePolygon(polygonPoints) {
  if (polygonPoints.length < 3) return [];
  const centroid = new THREE.Vector3();
  polygonPoints.forEach(p => centroid.add(p));
  centroid.divideScalar(polygonPoints.length);

  const triangles = [];
  const n = polygonPoints.length;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    triangles.push([polygonPoints[i], polygonPoints[next], centroid]);
  }
  return triangles;
}

/**
 * Interpolate Base Height from Triangles using Barycentric Coordinates
 */
function interpolateBaseHeight(px, pz, triangles, fallbackMeanY) {
  for (const tri of triangles) {
    const [A, B, C] = tri;
    const v0x = C.x - A.x, v0z = C.z - A.z;
    const v1x = B.x - A.x, v1z = B.z - A.z;
    const v2x = px - A.x, v2z = pz - A.z;

    const dot00 = v0x * v0x + v0z * v0z;
    const dot01 = v0x * v1x + v0z * v1z;
    const dot02 = v0x * v2x + v0z * v2z;
    const dot11 = v1x * v1x + v1z * v1z;
    const dot12 = v1x * v2x + v1z * v2z;

    const invDenom = 1.0 / (dot00 * dot11 - dot01 * dot01 + 0.0000001);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    if (u >= -0.01 && v >= -0.01 && (u + v) <= 1.01) {
      return A.y + u * (C.y - A.y) + v * (B.y - A.y);
    }
  }
  return fallbackMeanY;
}

/**
 * Compute Best-Fit Plane Equation (A, B, C, D) for Cut Plane where A*x + B*y + C*z + D = 0
 * y_plane = (-A*x - C*z - D) / B
 * Per requirement: Pinned horizontally to the lowest perimeter point of the stockpile
 */
function computeReferencePlaneEquation(points, method = 'lowest', customAsl, groundOffset) {
  if (!points || points.length === 0) return new THREE.Vector4(0, 1, 0, 0);

  let minY = Infinity;
  points.forEach(p => {
    if (p.y < minY) minY = p.y;
  });

  // Locked to lowest perimeter point
  return new THREE.Vector4(0, 1, 0, -minY);
}


/**
 * Custom Hook: Multi-Stockpile Cut & Fill Volumetric Engine
 * Features:
 *  - Interactive 3D polygon drawing directly on RealityScan 3D mesh
 *  - Closed perimeter with live vertex handles
 *  - Volumetric integration (Cut & Fill) relative to lowest perimeter point
 *  - Live recalculation upon vertex dragging
 *  - Multi-stockpile accumulation and per-stockpile isolation
 */
export function useVolumeCalculation(viewerRef) {
  const [stockpiles, setStockpiles] = useState([]);
  const [selectedStockpileId, setSelectedStockpileId] = useState(null);
  const [accumulatedStockpileIds, setAccumulatedStockpileIds] = useState([]);
  
  // Current active drawing polygon state
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Calculation parameters: Locked to lowest point
  const [baseMethod, setBaseMethod] = useState('lowest');
  const [customBaseAsl, setCustomBaseAsl] = useState(99.0);
  const [density, setDensity] = useState(1.65);

  const rootGroupRef = useRef(null);
  const activeDrawingGroupRef = useRef(null);
  const nextIdRef = useRef(1);

  // Active selected stockpile (null while user is actively drawing a new polygon)
  const selectedStockpile = useMemo(() => {
    if (isDrawing) return null;
    if (stockpiles.length === 0) return null;
    if (selectedStockpileId !== null) {
      const found = stockpiles.find(s => s.id === selectedStockpileId);
      if (found) return found;
    }
    return stockpiles[stockpiles.length - 1];
  }, [stockpiles, selectedStockpileId, isDrawing]);

  // Active volume result for HUD compatibility
  const volumeResult = selectedStockpile?.result || null;

  // Ensure 3D Visuals Root Group
  const ensureRootGroup = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (!rootGroupRef.current && scene) {
      const group = new THREE.Group();
      group.name = 'volumeMasterGroup';
      group.renderOrder = 998;
      scene.add(group);
      rootGroupRef.current = group;

      // Subgroup for current active drawing polygon
      const drawingGroup = new THREE.Group();
      drawingGroup.name = 'activeDrawingVolumeGroup';
      group.add(drawingGroup);
      activeDrawingGroupRef.current = drawingGroup;
    }
    return rootGroupRef.current;
  }, [viewerRef]);

  // Update active drawing preview (markers & perimeter line)
  const updateActiveDrawingVisuals = useCallback((pts) => {
    ensureRootGroup();
    const group = activeDrawingGroupRef.current;
    if (!group) return;

    // Clear previous drawing preview
    while (group.children.length > 0) {
      const c = group.children[0];
      group.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }

    if (pts.length === 0) return;

    // Spheres for vertices
    pts.forEach((pt, idx) => {
      const geo = new THREE.SphereGeometry(0.35, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: idx === 0 ? 0x22c55e : 0xf59e0b, // Green origin, Amber subsequent
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.copy(pt);
      sphere.renderOrder = 1002;
      group.add(sphere);
    });

    // Perimeter line
    if (pts.length >= 2) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xfbbf24,
        linewidth: 3,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.renderOrder = 1000;
      group.add(line);
    }
  }, [ensureRootGroup]);

  // Update 3D Highlights across all completed stockpiles
  const update3DHighlights = useCallback((activeId) => {
    const engine = viewerRef.current?.tilesetEngine || viewerRef.current?.tilesetEngineRef?.current;
    let hasSelected = false;

    stockpiles.forEach(s => {
      const isSelected = s.id === activeId;
      if (isSelected) hasSelected = true;

      if (s.lineMesh?.material) {
        s.lineMesh.material.color.set(isSelected ? 0xfacc15 : 0xd97706); // Gold vs Warm Amber
        s.lineMesh.material.opacity = isSelected ? 1.0 : 0.6;
        s.lineMesh.renderOrder = isSelected ? 1006 : 999;
      }
      if (s.baseMesh?.material) {
        s.baseMesh.material.opacity = isSelected ? 0.65 : 0.25;
        s.baseMesh.material.color.set(isSelected ? 0x0284c7 : 0x0369a1);
      }
      if (s.wireMesh?.material) {
        s.wireMesh.material.opacity = isSelected ? 0.90 : 0.40;
      }
      if (s.fillMesh) {
        s.fillMesh.visible = isSelected;
      }
      if (s.cutMesh) {
        s.cutMesh.visible = isSelected;
      }
      if (s.markers) {
        s.markers.forEach(m => {
          m.scale.setScalar(isSelected ? 1.4 : 1.0);
          m.renderOrder = isSelected ? 1008 : 1000;
        });
      }
      if (isSelected && engine) {
        const groundOffset = viewerRef.current?.datumInfo?.groundOffset || DSM_DATUM_OFFSET;
        const planeEq = s.planeEq || computeReferencePlaneEquation(s.points, s.baseMethod || baseMethod, s.customBaseAsl || customBaseAsl, groundOffset);
        engine.setVolumePolygonCutout?.(s.points, planeEq, 0.35);
      }
    });

    if (!hasSelected && engine) {
      engine.clearVolumePolygonCutout?.();
    }
  }, [stockpiles, viewerRef, baseMethod, customBaseAsl]);

  // Sync 3D highlights on selection changes
  useEffect(() => {
    const activeId = selectedStockpileId ?? (stockpiles.length > 0 ? stockpiles[stockpiles.length - 1].id : null);
    update3DHighlights(activeId);
  }, [selectedStockpileId, stockpiles, update3DHighlights]);

  // Select a stockpile
  const selectStockpile = useCallback((id) => {
    setIsDrawing(false);
    setSelectedStockpileId(id);
    update3DHighlights(id);
  }, [update3DHighlights]);

  // Handle Deliberate Click from 3D Viewport
  const handleVolumeClick = useCallback((point) => {
    // CRITICAL: Once calculation is complete, DO NOT add more points until user explicitly clicks "+ New Stockpile"
    if (!isDrawing) return;

    setPolygonPoints(prev => {
      const updated = [...prev, point.clone()];
      updateActiveDrawingVisuals(updated);
      return updated;
    });
  }, [isDrawing, updateActiveDrawingVisuals]);

  /**
   * Run Volumetric Integration over the closed polygon
   */
  const computeVolumeInternal = useCallback((points, method = baseMethod, customAsl = customBaseAsl, activeDensity = density, existingStockpileId = null) => {
    if (points.length < 3) return;

    const tilesGroup = viewerRef.current?.tilesetEngine?.getGroup?.() || viewerRef.current?.tilesetEngineRef?.current?.getGroup?.();
    if (!tilesGroup) return;

    const meshes = [];
    tilesGroup.traverse(c => { if (c.isMesh) meshes.push(c); });
    if (meshes.length === 0) return;

    setIsCalculating(true);

    setTimeout(() => {
      const area2D = computePolygon2DArea(points);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let sumY = 0;

      points.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        sumY += p.y;
      });

      const meanY = sumY / points.length;
      const triangles = triangulatePolygon(points);

      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;
      const targetSamples = 1600;
      const areaApprox = Math.max(spanX * spanZ, 1.0);
      const gridStep = Math.max(0.25, Math.sqrt(areaApprox / targetSamples));
      const cellArea = gridStep * gridStep;

      const raycaster = new THREE.Raycaster();
      const downVector = new THREE.Vector3(0, -1, 0);
      const startHeight = maxY + 150.0;

      let cutVolume = 0;
      let fillVolume = 0;
      let surfaceArea3D = 0;
      let maxPileHeight = 0;
      let sampledPointsCount = 0;

      const fillVertices = [];
      const cutVertices = [];

      const groundOffset = viewerRef.current?.datumInfo?.groundOffset || DSM_DATUM_OFFSET;

      const numX = Math.ceil(spanX / gridStep) + 1;
      const numZ = Math.ceil(spanZ / gridStep) + 1;
      const sampleGrid = new Array(numX).fill(null).map(() => new Array(numZ).fill(null));

      for (let ix = 0; ix < numX; ix++) {
        const x = minX + ix * gridStep;
        for (let iz = 0; iz < numZ; iz++) {
          const z = minZ + iz * gridStep;
          if (!isPointInPolygon2D(x, z, points)) continue;

          const baseHeight = minY;

          raycaster.set(new THREE.Vector3(x, startHeight, z), downVector);
          const intersections = raycaster.intersectObjects(meshes, true);

          if (intersections.length > 0) {
            const surfaceY = intersections[0].point.y;
            const deltaH = surfaceY - baseHeight;
            sampledPointsCount++;

            if (deltaH >= 0.05) {
              fillVolume += deltaH * cellArea;
              if (deltaH > maxPileHeight) maxPileHeight = deltaH;
            } else if (deltaH <= -0.05) {
              cutVolume += Math.abs(deltaH) * cellArea;
            }

            if (intersections[0].face?.normal) {
              const normalY = Math.max(0.15, Math.abs(intersections[0].face.normal.y));
              surfaceArea3D += cellArea / normalY;
            } else {
              surfaceArea3D += cellArea;
            }

            sampleGrid[ix][iz] = { x, z, surfaceY, baseHeight, deltaH };
          }
        }
      }



      if (surfaceArea3D < area2D) {
        surfaceArea3D = area2D * 1.04;
      }

      const netVolume = fillVolume - cutVolume;
      const estimatedMassTons = fillVolume * activeDensity;

      const result = {
        fillVolume: Number(fillVolume.toFixed(2)),
        cutVolume: Number(cutVolume.toFixed(2)),
        netVolume: Number(netVolume.toFixed(2)),
        area2D: Number(area2D.toFixed(2)),
        surfaceArea3D: Number(surfaceArea3D.toFixed(2)),
        maxPileHeight: Number(maxPileHeight.toFixed(2)),
        sampledPointsCount,
        estimatedMassTons: Number(estimatedMassTons.toFixed(2)),
        baseMethod: method,
        minPerimeterAsl: Number((minY + groundOffset).toFixed(2)),
        maxPerimeterAsl: Number((maxY + groundOffset).toFixed(2)),
        meanPerimeterAsl: Number((meanY + groundOffset).toFixed(2)),
        pointsCount: points.length,
        timestamp: new Date().toISOString()
      };

      // ─── Build Dedicated 3D Objects for this Stockpile ───
      const root = ensureRootGroup();
      const id = existingStockpileId !== null ? existingStockpileId : nextIdRef.current++;
      let stockpileGroup = root.getObjectByName(`stockpile_${id}`);
      if (stockpileGroup) {
        while (stockpileGroup.children.length > 0) {
          const child = stockpileGroup.children[0];
          stockpileGroup.remove(child);
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        }
      } else {
        stockpileGroup = new THREE.Group();
        stockpileGroup.name = `stockpile_${id}`;
        root.add(stockpileGroup);
      }

      // Markers (Handles for draggable vertices)
      const markers = points.map((pt, idx) => {
        const geo = new THREE.SphereGeometry(0.42, 18, 18);
        const mat = new THREE.MeshBasicMaterial({
          color: idx === 0 ? 0x22c55e : 0xf59e0b,
          depthTest: false,
          transparent: true,
          opacity: 0.95
        });
        const sphere = new THREE.Mesh(geo, mat);
        sphere.position.copy(pt);
        sphere.renderOrder = 1005;
        sphere.userData = { stockpileId: id, vertexIndex: idx, type: 'stockpile_vertex_handle' };
        stockpileGroup.add(sphere);
        return sphere;
      });

      // Closed Perimeter Line
      const closedPoints = [...points, points[0]];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(closedPoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xfacc15,
        linewidth: 3.5,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const lineMesh = new THREE.Line(lineGeo, lineMat);
      lineMesh.renderOrder = 1000;
      lineMesh.userData = { stockpileId: id, type: 'stockpile_line' };
      stockpileGroup.add(lineMesh);

      // Cut plane and grid are hidden per user requirement (only points & green area above remain visible)
      const baseMesh = null;
      const wireMesh = null;

      // Calculate reference plane equation and apply continuous volumetric colormap in 3D Tiles shader
      const planeEq = computeReferencePlaneEquation(points, method, customAsl, groundOffset);
      const engine = viewerRef.current?.tilesetEngine || viewerRef.current?.tilesetEngineRef?.current;
      engine?.setVolumePolygonCutout?.(points, planeEq, 0.35);

      const fillMesh = null;
      const cutMesh = null;

      // Clear active drawing preview
      if (activeDrawingGroupRef.current) {
        while (activeDrawingGroupRef.current.children.length > 0) {
          const c = activeDrawingGroupRef.current.children[0];
          activeDrawingGroupRef.current.remove(c);
          if (c.geometry) c.geometry.dispose();
          if (c.material) c.material.dispose();
        }
      }

      // CRITICAL: Stop listening to clicks and lock drawing!
      setIsDrawing(false);
      setIsCalculating(false);
      setPolygonPoints([]);

      const updatedStockpileObj = {
        id,
        name: `Stockpile #${id}`,
        points: [...points],
        result,
        triangles,
        density: activeDensity,
        baseMethod: method,
        customBaseAsl: customAsl,
        planeEq,
        stockpileGroup,
        lineMesh,
        baseMesh,
        wireMesh,
        fillMesh,
        cutMesh,
        markers
      };

      if (existingStockpileId !== null) {
        setStockpiles(prev => prev.map(s => s.id === existingStockpileId ? { ...s, ...updatedStockpileObj } : s));
      } else {
        setStockpiles(prev => [...prev, updatedStockpileObj]);
        setAccumulatedStockpileIds(prev => [...prev, id]); // Automatically included in accumulation
      }
      setSelectedStockpileId(id);
    }, 40);
  }, [viewerRef, baseMethod, customBaseAsl, density, ensureRootGroup]);

  // Complete & Calculate Current Polygon
  const completePolygon = useCallback(() => {
    if (polygonPoints.length < 3) {
      alert('Please place at least 3 points to close the stockpile perimeter.');
      return;
    }
    computeVolumeInternal(polygonPoints, baseMethod, customBaseAsl, density);
  }, [polygonPoints, baseMethod, customBaseAsl, density, computeVolumeInternal]);

  // Start New Stockpile (unlocks drawing mode)
  const startNewStockpile = useCallback(() => {
    setIsDrawing(true);
    setSelectedStockpileId(null);
    setPolygonPoints([]);
    if (activeDrawingGroupRef.current) {
      while (activeDrawingGroupRef.current.children.length > 0) {
        const c = activeDrawingGroupRef.current.children[0];
        activeDrawingGroupRef.current.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }
    update3DHighlights(null);
    const engine = viewerRef.current?.tilesetEngine || viewerRef.current?.tilesetEngineRef?.current;
    engine?.clearVolumePolygonCutout?.();
  }, [viewerRef, update3DHighlights]);

  // Clear only active drawing polygon points
  const clearActiveDrawing = useCallback(() => {
    setPolygonPoints([]);
    if (activeDrawingGroupRef.current) {
      while (activeDrawingGroupRef.current.children.length > 0) {
        const c = activeDrawingGroupRef.current.children[0];
        activeDrawingGroupRef.current.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }
  }, []);

  // Delete a specific stockpile
  const deleteStockpile = useCallback((stockpileId) => {
    setStockpiles(prev => {
      const target = prev.find(s => s.id === stockpileId);
      if (target && rootGroupRef.current) {
        rootGroupRef.current.remove(target.stockpileGroup);
        target.stockpileGroup.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
            else c.material.dispose();
          }
        });
      }
      const remaining = prev.filter(s => s.id !== stockpileId);
      setSelectedStockpileId(curr => {
        if (curr === stockpileId) {
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        }
        return curr;
      });
      return remaining;
    });

    setAccumulatedStockpileIds(prev => prev.filter(id => id !== stockpileId));
    const engine = viewerRef.current?.tilesetEngine || viewerRef.current?.tilesetEngineRef?.current;
    engine?.clearVolumePolygonCutout?.();
  }, [viewerRef]);

  // Clear all stockpiles
  const clearAllStockpiles = useCallback(() => {
    if (rootGroupRef.current) {
      while (rootGroupRef.current.children.length > 0) {
        const child = rootGroupRef.current.children[0];
        rootGroupRef.current.remove(child);
        child.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
            else c.material.dispose();
          }
        });
      }
    }
    setStockpiles([]);
    setSelectedStockpileId(null);
    setAccumulatedStockpileIds([]);
    setPolygonPoints([]);
    setIsDrawing(true);

    const engine = viewerRef.current?.tilesetEngine || viewerRef.current?.tilesetEngineRef?.current;
    engine?.clearVolumePolygonCutout?.();
  }, [viewerRef]);

  // Live update of a vertex position while dragging
  const updateStockpileVertexPosition = useCallback((stockpileId, vertexIndex, newPosition) => {
    setStockpiles(prev => prev.map(s => {
      if (s.id !== stockpileId) return s;
      const updatedPoints = [...s.points];
      updatedPoints[vertexIndex] = newPosition.clone();

      // Update 3D marker sphere position
      if (s.markers && s.markers[vertexIndex]) {
        s.markers[vertexIndex].position.copy(newPosition);
      }

      // Update perimeter line
      if (s.lineMesh) {
        const closed = [...updatedPoints, updatedPoints[0]];
        s.lineMesh.geometry.setFromPoints(closed);
      }

      // Update localized cutout if selected
      const engine = viewerRef.current?.tilesetEngine || viewerRef.current?.tilesetEngineRef?.current;
      const groundOffset = viewerRef.current?.datumInfo?.groundOffset || DSM_DATUM_OFFSET;
      const planeEq = computeReferencePlaneEquation(updatedPoints, s.baseMethod || baseMethod, s.customBaseAsl || customBaseAsl, groundOffset);
      engine?.setVolumePolygonCutout?.(updatedPoints, planeEq, 0.35);

      return {
        ...s,
        points: updatedPoints
      };
    }));
  }, [viewerRef]);

  // Commit vertex changes on pointer up: recompute the volume & 3D masses
  const commitStockpileVertexChange = useCallback((stockpileId) => {
    setStockpiles(prev => {
      const target = prev.find(s => s.id === stockpileId);
      if (!target) return prev;
      computeVolumeInternal(target.points, target.baseMethod || baseMethod, target.customBaseAsl || customBaseAsl, target.density || density, stockpileId);
      return prev;
    });
  }, [baseMethod, customBaseAsl, density, computeVolumeInternal]);

  // Toggle Stockpile in Accumulation Sum
  const toggleAccumulateStockpile = useCallback((id) => {
    setAccumulatedStockpileIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);

  // Computed Accumulation Totals
  const accumulatedTotals = useMemo(() => {
    const included = stockpiles.filter(s => accumulatedStockpileIds.includes(s.id));
    if (included.length === 0) return null;

    const totalFill = included.reduce((sum, s) => sum + (s.result?.fillVolume || 0), 0);
    const totalCut = included.reduce((sum, s) => sum + (s.result?.cutVolume || 0), 0);
    const totalNet = totalFill - totalCut;
    const totalMass = included.reduce((sum, s) => sum + (s.result?.estimatedMassTons || 0), 0);
    const totalArea2D = included.reduce((sum, s) => sum + (s.result?.area2D || 0), 0);
    const totalSurfaceArea3D = included.reduce((sum, s) => sum + (s.result?.surfaceArea3D || 0), 0);

    return {
      count: included.length,
      totalFill: Number(totalFill.toFixed(2)),
      totalCut: Number(totalCut.toFixed(2)),
      totalNet: Number(totalNet.toFixed(2)),
      totalMass: Number(totalMass.toFixed(2)),
      totalArea2D: Number(totalArea2D.toFixed(2)),
      totalSurfaceArea3D: Number(totalSurfaceArea3D.toFixed(2)),
    };
  }, [stockpiles, accumulatedStockpileIds]);

  // Raycast Hit Checker for 3D selection
  const checkVolumeHit = useCallback((raycaster) => {
    if (!rootGroupRef.current || stockpiles.length === 0) return null;

    const prevThresh = raycaster.params?.Line?.threshold;
    if (raycaster.params) {
      if (!raycaster.params.Line) raycaster.params.Line = {};
      raycaster.params.Line.threshold = 1.0;
    }

    const hits = raycaster.intersectObjects(rootGroupRef.current.children, true);
    if (raycaster.params?.Line) {
      raycaster.params.Line.threshold = prevThresh ?? 1;
    }

    if (hits.length > 0) {
      for (const hit of hits) {
        let cur = hit.object;
        while (cur && cur !== rootGroupRef.current) {
          if (cur.userData?.stockpileId) {
            return cur.userData.stockpileId;
          }
          cur = cur.parent;
        }
      }
    }
    return null;
  }, [stockpiles]);

  // Handlers for settings & recalcs
  const handleBaseMethodChange = useCallback((newMethod) => {
    setBaseMethod(newMethod);
    if (selectedStockpile) {
      computeVolumeInternal(selectedStockpile.points, newMethod, selectedStockpile.customBaseAsl, selectedStockpile.density, selectedStockpile.id);
    }
  }, [selectedStockpile, computeVolumeInternal]);

  const handleCustomBaseAslChange = useCallback((aslVal) => {
    const num = parseFloat(aslVal);
    setCustomBaseAsl(num);
    if (selectedStockpile && baseMethod === 'custom') {
      computeVolumeInternal(selectedStockpile.points, 'custom', num, selectedStockpile.density, selectedStockpile.id);
    }
  }, [selectedStockpile, baseMethod, computeVolumeInternal]);

  const handleDensityChange = useCallback((newDensity) => {
    const num = parseFloat(newDensity);
    setDensity(num);
    if (selectedStockpile) {
      setStockpiles(prev => prev.map(s => {
        if (s.id === selectedStockpile.id) {
          return {
            ...s,
            density: num,
            result: {
              ...s.result,
              estimatedMassTons: Number((s.result.fillVolume * num).toFixed(2))
            }
          };
        }
        return s;
      }));
    }
  }, [selectedStockpile]);

  return {
    stockpiles,
    selectedStockpileId,
    selectedStockpile,
    volumeResult,
    accumulatedTotals,
    accumulatedStockpileIds,
    toggleAccumulateStockpile,
    polygonPoints,
    isDrawing,
    isCalculating,
    baseMethod,
    customBaseAsl,
    density,
    handleVolumeClick,
    completePolygon,
    startNewStockpile,
    selectStockpile,
    deleteStockpile,
    clearAllStockpiles,
    clearActiveDrawing,
    checkVolumeHit,
    updateStockpileVertexPosition,
    commitStockpileVertexChange,
    handleBaseMethodChange,
    handleCustomBaseAslChange,
    handleDensityChange,
    clearVolume: clearActiveDrawing
  };
}
