import { useRef, useCallback, useState } from 'react';
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
 * Triangulate 2D Polygon using Fan Triangulation (or ear clipping for simple polygons)
 * Returns array of triangles: [[p0, p1, p2], ...]
 */
function triangulatePolygon(polygonPoints) {
  if (polygonPoints.length < 3) return [];
  // For convex/near-convex survey stockpiles, centroid fan triangulation is fast and continuous
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

    // Check if inside triangle
    if (u >= -0.01 && v >= -0.01 && (u + v) <= 1.01) {
      return A.y + u * (C.y - A.y) + v * (B.y - A.y);
    }
  }
  return fallbackMeanY;
}

/**
 * Custom Hook: Stockpile Volume & Earthwork Cut/Fill Engine
 */
export function useVolumeCalculation(viewerRef) {
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [volumeResult, setVolumeResult] = useState(null);
  const [baseMethod, setBaseMethod] = useState('tin'); // 'tin' | 'lowest' | 'mean' | 'custom'
  const [customBaseAsl, setCustomBaseAsl] = useState(99.0);
  const [density, setDensity] = useState(1.65); // Metric tons per m³
  const [isCalculating, setIsCalculating] = useState(false);

  const visualGroupRef = useRef(null);
  const pointsRef = useRef([]);

  // Keep ref synchronized
  pointsRef.current = polygonPoints;

  const ensureVisualGroup = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (!visualGroupRef.current && scene) {
      const group = new THREE.Group();
      group.name = 'volumeVisualsGroup';
      group.renderOrder = 998;
      scene.add(group);
      visualGroupRef.current = group;
    }
    return visualGroupRef.current;
  }, [viewerRef]);

  const clearVisuals = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (visualGroupRef.current && scene) {
      scene.remove(visualGroupRef.current);
      visualGroupRef.current.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      visualGroupRef.current = null;
    }
  }, [viewerRef]);

  /**
   * Rebuild 3D visual markers, polygon line loop, and base plane
   */
  const updateVisuals = useCallback((points, closed = false, triangles = []) => {
    const group = ensureVisualGroup();
    if (!group) return;

    // Clear existing children
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    if (points.length === 0) return;

    // 1. Vertex Markers (Golden Spheres)
    points.forEach((pt, idx) => {
      const sphereGeo = new THREE.SphereGeometry(0.32, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: idx === 0 ? 0x22c55e : 0xf59e0b, // Green for origin point
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.copy(pt);
      sphere.renderOrder = 1000;
      group.add(sphere);
    });

    // 2. Perimeter Outline (Golden Line)
    if (points.length >= 2) {
      const linePts = [...points];
      if (closed && points.length >= 3) {
        linePts.push(points[0]); // close loop
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xfbbf24,
        linewidth: 3,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.renderOrder = 999;
      group.add(line);
    }

    // 3. Translucent Base Plane Mesh (when closed)
    if (closed && points.length >= 3 && triangles.length > 0) {
      const vertices = [];
      triangles.forEach(tri => {
        tri.forEach(p => vertices.push(p.x, p.y, p.z));
      });

      const baseGeo = new THREE.BufferGeometry();
      baseGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      baseGeo.computeVertexNormals();

      const baseMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        wireframe: false
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.renderOrder = 997;
      group.add(baseMesh);

      // Add wireframe overlay for base surface grid
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        wireframe: true,
        transparent: true,
        opacity: 0.6
      });
      const wireMesh = new THREE.Mesh(baseGeo.clone(), wireMat);
      wireMesh.renderOrder = 998;
      group.add(wireMesh);
    }
  }, [ensureVisualGroup]);

  /**
   * Run Volumetric Integration over the closed polygon
   */
  const computeVolume = useCallback((points, method = baseMethod, customAsl = customBaseAsl) => {
    if (points.length < 3) return;

    const tilesGroup = viewerRef.current?.tilesetEngine?.getGroup?.() || viewerRef.current?.tilesetEngineRef?.current?.getGroup?.();
    if (!tilesGroup) return;

    const meshes = [];
    tilesGroup.traverse(c => { if (c.isMesh) meshes.push(c); });
    if (meshes.length === 0) return;

    setIsCalculating(true);

    setTimeout(() => {
      // 1. Compute 2D Planimetric Footprint Area
      const area2D = computePolygon2DArea(points);

      // 2. Compute Polygon Bounding Box
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

      // 3. Grid Sampling Setup
      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;
      const maxSpan = Math.max(spanX, spanZ);

      // Adaptive grid step: between 0.35m and 0.8m for high precision and snappy calculation
      const stepSize = Math.max(0.35, Math.min(0.8, maxSpan / 50));
      const cellArea = stepSize * stepSize;

      const numStepsX = Math.ceil(spanX / stepSize);
      const numStepsZ = Math.ceil(spanZ / stepSize);

      let fillVolume = 0; // m³ (above base surface)
      let cutVolume = 0;  // m³ (below base surface)
      let surfaceArea3D = 0;
      let sampledPointsCount = 0;
      let maxElevationDelta = 0;
      let maxPileHeight = 0;

      const raycaster = new THREE.Raycaster();
      const downVector = new THREE.Vector3(0, -1, 0);
      const rayOriginY = maxY + 40.0;

      // Base height evaluator
      const getBaseHeight = (px, pz) => {
        if (method === 'tin') {
          return interpolateBaseHeight(px, pz, triangles, meanY);
        } else if (method === 'lowest') {
          return minY;
        } else if (method === 'mean') {
          return meanY;
        } else if (method === 'custom') {
          return customAsl - DSM_DATUM_OFFSET;
        }
        return meanY;
      };

      // 4. Numerical Grid Integration
      for (let ix = 0; ix <= numStepsX; ix++) {
        const x = minX + ix * stepSize;
        for (let iz = 0; iz <= numStepsZ; iz++) {
          const z = minZ + iz * stepSize;

          if (isPointInPolygon2D(x, z, points)) {
            raycaster.set(new THREE.Vector3(x, rayOriginY, z), downVector);
            const intersects = raycaster.intersectObjects(meshes, true);

            if (intersects.length > 0) {
              const meshY = intersects[0].point.y;
              const baseY = getBaseHeight(x, z);
              const deltaH = meshY - baseY;

              if (deltaH > 0) {
                fillVolume += deltaH * cellArea;
                maxPileHeight = Math.max(maxPileHeight, deltaH);
              } else {
                cutVolume += Math.abs(deltaH) * cellArea;
              }

              maxElevationDelta = Math.max(maxElevationDelta, Math.abs(deltaH));
              sampledPointsCount++;

              // 3D Topographic surface element approximation
              surfaceArea3D += cellArea * Math.sqrt(1 + (deltaH / stepSize) * 0.05);
            }
          }
        }
      }

      if (surfaceArea3D < area2D) {
        surfaceArea3D = area2D * 1.04;
      }

      const netVolume = fillVolume - cutVolume;
      const estimatedMassTons = fillVolume * density;

      const result = {
        fillVolume,
        cutVolume,
        netVolume,
        area2D,
        surfaceArea3D,
        maxPileHeight,
        sampledPointsCount,
        estimatedMassTons,
        baseMethod: method,
        minPerimeterAsl: minY + DSM_DATUM_OFFSET,
        maxPerimeterAsl: maxY + DSM_DATUM_OFFSET,
        meanPerimeterAsl: meanY + DSM_DATUM_OFFSET,
        pointsCount: points.length,
        timestamp: new Date().toISOString()
      };

      setVolumeResult(result);
      setIsCalculating(false);

      // Rebuild 3D visual base plane
      updateVisuals(points, true, triangles);
    }, 40);
  }, [viewerRef, baseMethod, customBaseAsl, density, updateVisuals]);

  /**
   * Handle Click from 3D Viewport
   */
  const handleVolumeClick = useCallback((point) => {
    const newPoints = [...pointsRef.current, point.clone()];
    setPolygonPoints(newPoints);
    setIsDrawing(true);
    updateVisuals(newPoints, false);
  }, [updateVisuals]);

  /**
   * Finish / Close Polygon
   */
  const completePolygon = useCallback(() => {
    const currentPts = pointsRef.current;
    if (currentPts.length < 3) {
      alert('Please place at least 3 points to close the stockpile polygon.');
      return;
    }
    setIsDrawing(false);
    computeVolume(currentPts, baseMethod, customBaseAsl);
  }, [baseMethod, customBaseAsl, computeVolume]);

  /**
   * Clear Current Stockpile Selection
   */
  const clearVolume = useCallback(() => {
    setPolygonPoints([]);
    pointsRef.current = [];
    setVolumeResult(null);
    setIsDrawing(false);
    setIsCalculating(false);
    clearVisuals();
  }, [clearVisuals]);

  /**
   * Switch Base Reference Method & Recalculate
   */
  const handleBaseMethodChange = useCallback((newMethod) => {
    setBaseMethod(newMethod);
    if (pointsRef.current.length >= 3 && volumeResult) {
      computeVolume(pointsRef.current, newMethod, customBaseAsl);
    }
  }, [volumeResult, customBaseAsl, computeVolume]);

  /**
   * Update Custom Base ASL & Recalculate
   */
  const handleCustomBaseAslChange = useCallback((aslVal) => {
    const num = parseFloat(aslVal);
    setCustomBaseAsl(num);
    if (pointsRef.current.length >= 3 && volumeResult && baseMethod === 'custom') {
      computeVolume(pointsRef.current, 'custom', num);
    }
  }, [volumeResult, baseMethod, computeVolume]);

  /**
   * Update Material Density (t/m³)
   */
  const handleDensityChange = useCallback((newDensity) => {
    const num = parseFloat(newDensity);
    setDensity(num);
    if (volumeResult) {
      setVolumeResult(prev => ({
        ...prev,
        estimatedMassTons: prev.fillVolume * num
      }));
    }
  }, [volumeResult]);

  return {
    polygonPoints,
    isDrawing,
    volumeResult,
    isCalculating,
    baseMethod,
    customBaseAsl,
    density,
    handleVolumeClick,
    completePolygon,
    clearVolume,
    handleBaseMethodChange,
    handleCustomBaseAslChange,
    handleDensityChange
  };
}
