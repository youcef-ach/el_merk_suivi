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
 * Append a 3D box column prism (12 triangles) to vertices array
 */
function addBoxPrism(vertices, x0, y0, z0, x1, y1, z1) {
  // Top face (y1)
  vertices.push(x0, y1, z0,  x1, y1, z0,  x1, y1, z1);
  vertices.push(x0, y1, z0,  x1, y1, z1,  x0, y1, z1);
  // Bottom face (y0)
  vertices.push(x0, y0, z1,  x1, y0, z1,  x1, y0, z0);
  vertices.push(x0, y0, z1,  x1, y0, z0,  x0, y0, z0);
  // Front face (z1)
  vertices.push(x0, y0, z1,  x1, y0, z1,  x1, y1, z1);
  vertices.push(x0, y0, z1,  x1, y1, z1,  x0, y1, z1);
  // Back face (z0)
  vertices.push(x1, y0, z0,  x0, y0, z0,  x0, y1, z0);
  vertices.push(x1, y0, z0,  x0, y1, z0,  x1, y1, z0);
  // Left face (x0)
  vertices.push(x0, y0, z0,  x0, y0, z1,  x0, y1, z1);
  vertices.push(x0, y0, z0,  x0, y1, z1,  x0, y1, z0);
  // Right face (x1)
  vertices.push(x1, y0, z1,  x1, y0, z0,  x1, y1, z0);
}


/**
 * Custom Hook: Multi-Stockpile Cut & Fill Volumetric Engine
 * Features:
 * - Differentiates click vs orbit/drag (stops listening after calculation until "+ New Stockpile")
 * - Manages multiple stockpiles (list, selection, 3D highlight, deletion)
 * - Accumulates multiple stockpiles together into aggregated net/fill/cut totals
 */
export function useVolumeCalculation(viewerRef) {
  const [stockpiles, setStockpiles] = useState([]);
  const [selectedStockpileId, setSelectedStockpileId] = useState(null);
  const [accumulatedStockpileIds, setAccumulatedStockpileIds] = useState([]);
  
  // Current active drawing polygon state
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Calculation parameters
  const [baseMethod, setBaseMethod] = useState('tin');
  const [customBaseAsl, setCustomBaseAsl] = useState(99.0);
  const [density, setDensity] = useState(1.65);

  const rootGroupRef = useRef(null);
  const activeDrawingGroupRef = useRef(null);
  const nextIdRef = useRef(1);

  // Active selected stockpile
  const selectedStockpile = useMemo(() => {
    if (stockpiles.length === 0) return null;
    return stockpiles.find(s => s.id === selectedStockpileId) || stockpiles[stockpiles.length - 1];
  }, [stockpiles, selectedStockpileId]);

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
        s.baseMesh.material.opacity = isSelected ? 0.55 : 0.2;
        s.baseMesh.material.color.set(isSelected ? 0x0284c7 : 0x0369a1);
      }
      if (s.wireMesh?.material) {
        s.wireMesh.material.opacity = isSelected ? 0.8 : 0.35;
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
        engine.setVolumePolygonCutout?.(s.points, 0.35);
      }
    });

    if (!hasSelected && engine) {
      engine.clearVolumePolygonCutout?.();
    }
  }, [stockpiles, viewerRef]);

  // Sync 3D highlights on selection changes
  useEffect(() => {
    const activeId = selectedStockpileId ?? (stockpiles.length > 0 ? stockpiles[stockpiles.length - 1].id : null);
    update3DHighlights(activeId);
  }, [selectedStockpileId, stockpiles, update3DHighlights]);

  // Select a stockpile
  const selectStockpile = useCallback((id) => {
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

      for (let x = minX + gridStep * 0.5; x <= maxX; x += gridStep) {
        for (let z = minZ + gridStep * 0.5; z <= maxZ; z += gridStep) {
          if (!isPointInPolygon2D(x, z, points)) continue;

          let baseHeight = meanY;
          if (method === 'lowest') {
            baseHeight = minY;
          } else if (method === 'mean') {
            baseHeight = meanY;
          } else if (method === 'custom') {
            baseHeight = customAsl - groundOffset;
          } else {
            baseHeight = interpolateBaseHeight(x, z, triangles, meanY);
          }

          raycaster.set(new THREE.Vector3(x, startHeight, z), downVector);
          const intersections = raycaster.intersectObjects(meshes, true);

          if (intersections.length > 0) {
            const surfaceY = intersections[0].point.y;
            const deltaH = surfaceY - baseHeight;
            sampledPointsCount++;

            const halfStep = gridStep * 0.48;
            const x0 = x - halfStep, x1 = x + halfStep;
            const z0 = z - halfStep, z1 = z + halfStep;

            if (deltaH >= 0.05) {
              fillVolume += deltaH * cellArea;
              if (deltaH > maxPileHeight) maxPileHeight = deltaH;
              addBoxPrism(fillVertices, x0, baseHeight, z0, x1, surfaceY, z1);
            } else if (deltaH <= -0.05) {
              cutVolume += Math.abs(deltaH) * cellArea;
              addBoxPrism(cutVertices, x0, surfaceY, z0, x1, baseHeight, z1);
            }

            if (intersections[0].face?.normal) {
              const normalY = Math.max(0.15, Math.abs(intersections[0].face.normal.y));
              surfaceArea3D += cellArea / normalY;
            } else {
              surfaceArea3D += cellArea;
            }
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

      // Translucent Base Plane
      const vertices = [];
      triangles.forEach(tri => {
        tri.forEach(p => vertices.push(p.x, p.y, p.z));
      });
      const baseGeo = new THREE.BufferGeometry();
      baseGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      baseGeo.computeVertexNormals();

      const baseMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7, // Cyan blue reference plane
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.renderOrder = 997;
      baseMesh.userData = { stockpileId: id, type: 'stockpile_plane' };
      stockpileGroup.add(baseMesh);

      // Wireframe overlay for base plane
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.75
      });
      const wireMesh = new THREE.Mesh(baseGeo.clone(), wireMat);
      wireMesh.renderOrder = 998;
      stockpileGroup.add(wireMesh);

      // ─── 3D Volumetric Fill Mass (Above Plane - Emerald Green) ───
      let fillMesh = null;
      if (fillVertices.length > 0) {
        const fillGeo = new THREE.BufferGeometry();
        fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillVertices, 3));
        fillGeo.computeVertexNormals();
        const fillMat = new THREE.MeshBasicMaterial({
          color: 0x10b981, // Emerald Green
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
          depthWrite: false
        });
        fillMesh = new THREE.Mesh(fillGeo, fillMat);
        fillMesh.renderOrder = 1002;
        fillMesh.userData = { stockpileId: id, type: 'stockpile_fill_mesh' };
        stockpileGroup.add(fillMesh);
      }

      // ─── 3D Volumetric Cut Mass (Under Plane - Crimson Red) ───
      let cutMesh = null;
      if (cutVertices.length > 0) {
        const cutGeo = new THREE.BufferGeometry();
        cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutVertices, 3));
        cutGeo.computeVertexNormals();
        const cutMat = new THREE.MeshBasicMaterial({
          color: 0xef4444, // Crimson Red
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
          depthWrite: false
        });
        cutMesh = new THREE.Mesh(cutGeo, cutMat);
        cutMesh.renderOrder = 1002;
        cutMesh.userData = { stockpileId: id, type: 'stockpile_cut_mesh' };
        stockpileGroup.add(cutMesh);
      }

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

      // Trigger localized mesh cutout on tileset
      const engine = viewerRef.current?.tilesetEngine || viewerRef.current?.tilesetEngineRef?.current;
      engine?.setVolumePolygonCutout?.(points, 0.35);
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
      engine?.setVolumePolygonCutout?.(updatedPoints, 0.35);

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
    checkVolumeHit,
    updateStockpileVertexPosition,
    commitStockpileVertexChange,
    handleBaseMethodChange,
    handleCustomBaseAslChange,
    handleDensityChange,
    clearVolume: clearAllStockpiles
  };
}
