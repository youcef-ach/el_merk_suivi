import { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { useThreeScene } from '../hooks/useThreeScene';
import { TilesetEngine } from '../utils/TilesetEngine';
import { OrthomosaicLayer } from '../utils/OrthomosaicLayer';
import { SatelliteBasemapLayer } from '../utils/SatelliteBasemapLayer';
import { API_URL, MINIO_URL } from '../config/api';

const DroneSurveyViewer = forwardRef(({
  tourId,
  measurementMode,
  onMeasurementClick,
  onSelectMeasurement,
  volumeMode,
  onVolumeClick,
  onSelectStockpile,
  onUpdateStockpileVertex,
  onCommitStockpileVertex,
  crossSectionMode,
  onCrossSectionClick,
  onSelectSection,
  tagMode,
  onTagClick,
  onSelectTag,
  onGeoCoordinates,
}, ref) => {

  const dummyTex = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const { mountRef, sceneRef, cameraRef, rendererRef, controlsRef, beforeRenderCallbacksRef, sceneReady } = useThreeScene([dummyTex]);

  const tilesetEngineRef = useRef(null);
  const orthoLayerRef = useRef(null);
  const satelliteBasemapRef = useRef(null);
  const [tourDetails, setTourDetails] = useState(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isAligningDatum, setIsAligningDatum] = useState(false);
  const [datumInfo, setDatumInfo] = useState(null);
  const [isMarkerVisible, setIsMarkerVisible] = useState(true);

  // Measurement, Volume & CrossSection click refs
  const measurementModeRef = useRef(false);
  const onMeasurementClickRef = useRef(null);
  const onSelectMeasurementRef = useRef(null);
  measurementModeRef.current = measurementMode;
  onMeasurementClickRef.current = onMeasurementClick;
  onSelectMeasurementRef.current = onSelectMeasurement;

  const volumeModeRef = useRef(false);
  const onVolumeClickRef = useRef(null);
  const onSelectStockpileRef = useRef(null);
  const onUpdateStockpileVertexRef = useRef(null);
  const onCommitStockpileVertexRef = useRef(null);
  volumeModeRef.current = volumeMode;
  onVolumeClickRef.current = onVolumeClick;
  onSelectStockpileRef.current = onSelectStockpile;
  onUpdateStockpileVertexRef.current = onUpdateStockpileVertex;
  onCommitStockpileVertexRef.current = onCommitStockpileVertex;

  const crossSectionModeRef = useRef(false);
  const onCrossSectionClickRef = useRef(null);
  const onSelectSectionRef = useRef(null);
  crossSectionModeRef.current = crossSectionMode;
  onCrossSectionClickRef.current = onCrossSectionClick;
  onSelectSectionRef.current = onSelectSection;

  const tagModeRef = useRef(false);
  const onTagClickRef = useRef(null);
  const onSelectTagRef = useRef(null);
  tagModeRef.current = tagMode;
  onTagClickRef.current = onTagClick;
  onSelectTagRef.current = onSelectTag;

  const onGeoCoordinatesRef = useRef(null);
  onGeoCoordinatesRef.current = onGeoCoordinates;

  // ─── 1. Load Drone Photogrammetry Deliverables (3D Tiles, Orthomosaics, Basemap) ───
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady || !tourId) return;

    let isSubscribed = true;

    let updateCb = null;
    const initDroneAssets = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch(`${API_URL}/inspections/${tourId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        if (!res.ok) throw new Error(`Drone tour fetch failed: ${res.status}`);

        const tour = await res.json();
        if (!isSubscribed) return;
        setTourDetails(tour);

        let tilesetUrl = tour.tilesetUrl;
        if (tilesetUrl && !tilesetUrl.startsWith('http')) {
          tilesetUrl = `${MINIO_URL}/virtual-inspections/${tilesetUrl}`;
        }

        let orthoUrl = tour.orthoUrl;
        if (orthoUrl && !orthoUrl.startsWith('http')) {
          orthoUrl = `${MINIO_URL}/virtual-inspections/${orthoUrl}`;
        }

        // Initialize Satellite Basemap Ground Plane Layer
        const satelliteBasemap = new SatelliteBasemapLayer(scene);
        satelliteBasemapRef.current = satelliteBasemap;
        satelliteBasemap.load({
          lat: 31.9056,
          lon: 9.1489,
          zoom: 17,
          gridRadius: 2,
          providerKey: 'esri-satellite',
          elevationOffsetY: -0.01,
          opacity: 0.95,
          visible: false
        });

        // Initialize Orthomosaic Layer
        const orthoLayer = new OrthomosaicLayer(scene);
        orthoLayerRef.current = orthoLayer;

        // Load Cesium 3D Tiles
        if (tilesetUrl) {
          const hasPrecalculatedDatum = typeof tour.orthoBounds?.groundOffset === 'number' || typeof tour.orthoBounds?.groundAsl === 'number';
          setIsAligningDatum(!hasPrecalculatedDatum);
          if (hasPrecalculatedDatum) {
            setDatumInfo({
              surfaceCenterPoint: tour.orthoBounds.surfaceCenterPoint || tour.orthoBounds.centerSurfacePoint || tour.orthoBounds.lowestPoint,
              groundOffset: tour.orthoBounds.groundOffset ?? tour.orthoBounds.groundAsl,
              groundAsl: tour.orthoBounds.groundAsl ?? tour.orthoBounds.groundOffset,
              elevationRange: tour.orthoBounds.elevationRange
            });
          }

          const engine = new TilesetEngine(scene, cameraRef.current, rendererRef.current);
          engine.loadTileset(tilesetUrl, 'rotX_neg90', {
            camera: cameraRef.current,
            renderer: rendererRef.current,
            initialGroundOffset: tour.orthoBounds?.groundOffset,
            initialGroundAsl: tour.orthoBounds?.groundAsl,
            initialMeshSnapOffset: tour.orthoBounds?.meshSnapOffset,
            initialMinYRaw: tour.orthoBounds?.minYRaw,
            initialSurfaceCenterPoint: tour.orthoBounds?.surfaceCenterPoint || tour.orthoBounds?.centerSurfacePoint || tour.orthoBounds?.lowestPoint,
            initialElevationRange: tour.orthoBounds?.elevationRange,
          });
          tilesetEngineRef.current = engine;

          // Auto-extract GPS bounding volume coordinates
          engine.onGeoCoordinates((geo) => {
            if (geo && geo.lat && geo.lon) {
              satelliteBasemapRef.current?.setCoordinates(geo.lat, geo.lon);
              setTourDetails(prev => prev ? { ...prev, latitude: geo.lat, longitude: geo.lon } : { latitude: geo.lat, longitude: geo.lon });
              onGeoCoordinatesRef.current?.(geo);
            }
          });

          // Listener for ground datum alignment & surface center point discovery
          engine.onDatumAligned((datum) => {
            setIsAligningDatum(false);
            setDatumInfo(datum);
          });

          let prevTime = performance.now();
          updateCb = () => {
            const now = performance.now();
            const dt = Math.min(0.1, (now - prevTime) / 1000);
            prevTime = now;
            if (tilesetEngineRef.current) {
              if (cameraRef.current && (!tilesetEngineRef.current.camera || !tilesetEngineRef.current.tilesRenderer?.hasCamera(cameraRef.current))) {
                tilesetEngineRef.current.setCamera(cameraRef.current);
              }
              if (rendererRef.current && !tilesetEngineRef.current.renderer) {
                tilesetEngineRef.current.setRenderer(rendererRef.current);
              }
              tilesetEngineRef.current.update(dt);
            }
          };
          if (beforeRenderCallbacksRef?.current) {
            beforeRenderCallbacksRef.current.push(updateCb);
          }
        }

        setIsDataLoaded(true);

      } catch (err) {
        console.error("DroneSurveyViewer Load Error:", err.message);
        setIsDataLoaded(true);
      }
    };

    initDroneAssets();

    return () => {
      isSubscribed = false;
      if (beforeRenderCallbacksRef?.current && updateCb) {
        beforeRenderCallbacksRef.current = beforeRenderCallbacksRef.current.filter(cb => cb !== updateCb);
      }
      if (tilesetEngineRef.current) {
        tilesetEngineRef.current.dispose();
        tilesetEngineRef.current = null;
      }
      if (orthoLayerRef.current) {
        orthoLayerRef.current.dispose();
        orthoLayerRef.current = null;
      }
      if (satelliteBasemapRef.current) {
        satelliteBasemapRef.current.dispose();
        satelliteBasemapRef.current = null;
      }
    };
  }, [sceneRef, sceneReady, tourId, beforeRenderCallbacksRef, cameraRef, rendererRef]);

  // ─── 2. Auto-Frame Camera for Drone Survey ───
  useEffect(() => {
    if (isDataLoaded && cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 140, 220);
      controlsRef.current.target.set(0, 4, 0);
      controlsRef.current.update();
    }
  }, [isDataLoaded, cameraRef, controlsRef]);

  // ─── 3. Click Raycasting for Drone Tools (Measurements / Cut & Fill / Cross-Section) ───
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera || !isDataLoaded) return;

    // ─── Dynamic Cursor Styling ───
    if (measurementMode || volumeMode || crossSectionMode) {
      renderer.domElement.style.cursor = 'crosshair';
    } else {
      renderer.domElement.style.cursor = 'default';
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Track pointerdown state to differentiate deliberate clicks from camera orbit/pan drag
    let pointerDownPos = { x: 0, y: 0 };
    let pointerDownTime = 0;
    let isDragging = false;
    let draggedVertex = null;

    const onPointerDown = (e) => {
      // Only track primary left mouse button
      if (e.button !== 0) return;
      pointerDownPos = { x: e.clientX, y: e.clientY };
      pointerDownTime = performance.now();
      isDragging = false;

      // Check if user clicked on a stockpile vertex handle to drag it
      if (volumeModeRef.current && sceneRef.current) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const vGroup = sceneRef.current.getObjectByName('volumeMasterGroup');
        if (vGroup) {
          const vHits = raycaster.intersectObjects(vGroup.children, true);
          for (const hit of vHits) {
            let cur = hit.object;
            while (cur && cur !== vGroup) {
              if (cur.userData?.type === 'stockpile_vertex_handle') {
                draggedVertex = {
                  stockpileId: cur.userData.stockpileId,
                  vertexIndex: cur.userData.vertexIndex
                };
                if (controlsRef.current) {
                  controlsRef.current.enabled = false; // Lock OrbitControls during vertex drag!
                }
                renderer.domElement.style.cursor = 'grabbing';
                return;
              }
              cur = cur.parent;
            }
          }
        }
      }
    };

    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Handle active vertex dragging
      if (draggedVertex) {
        isDragging = true;
        const targets = [];
        if (tilesetEngineRef.current?.getGroup()) {
          targets.push(tilesetEngineRef.current.getGroup());
        }
        if (targets.length > 0) {
          const hits = raycaster.intersectObjects(targets, true);
          if (hits.length > 0) {
            onUpdateStockpileVertexRef.current?.(
              draggedVertex.stockpileId,
              draggedVertex.vertexIndex,
              hits[0].point
            );
          }
        }
        return;
      }

      // If button is held and pointer moved more than 5px, it is an orbit/pan drag
      if (e.buttons !== 0) {
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        if (Math.hypot(dx, dy) > 5) {
          isDragging = true;
        }
      } else if (volumeModeRef.current && sceneRef.current) {
        // Hover feedback over vertex handles: change cursor to 'grab'
        const vGroup = sceneRef.current.getObjectByName('volumeMasterGroup');
        let hoverHandle = false;
        if (vGroup) {
          const vHits = raycaster.intersectObjects(vGroup.children, true);
          for (const hit of vHits) {
            let cur = hit.object;
            while (cur && cur !== vGroup) {
              if (cur.userData?.type === 'stockpile_vertex_handle') {
                hoverHandle = true;
                break;
              }
              cur = cur.parent;
            }
            if (hoverHandle) break;
          }
        }
        if (volumeModeRef.current) {
          renderer.domElement.style.cursor = hoverHandle ? 'grab' : 'crosshair';
        } else if (measurementModeRef.current || crossSectionModeRef.current || tagModeRef.current) {
          renderer.domElement.style.cursor = 'crosshair';
        }

        // Hover feedback over existing 3D tags
        const tagGroup = sceneRef.current?.getObjectByName('tagMarkers');
        if (tagGroup && tagGroup.children.length > 0) {
          const tagHits = raycaster.intersectObjects(tagGroup.children, false);
          if (tagHits.length > 0) {
            renderer.domElement.style.cursor = 'pointer';
          }
        }
      }
    };

    const onPointerUp = () => {
      if (draggedVertex) {
        onCommitStockpileVertexRef.current?.(draggedVertex.stockpileId);
        draggedVertex = null;
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
        renderer.domElement.style.cursor = volumeModeRef.current ? 'crosshair' : 'default';
      }
    };

    const onClick = (e) => {
      if (draggedVertex) return;
      // 1. Strict click vs hover / drag / orbit differentiation
      if (e.button !== 0) return;
      if (isDragging) {
        isDragging = false;
        return;
      }
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      const elapsed = performance.now() - pointerDownTime;
      if (Math.hypot(dx, dy) > 5 || elapsed > 350) {
        return; // Orbit, pan, or long hold -> ignore
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 2. Check if click intersected an existing 3D measurement, cross-section, or stockpile!
      const scene = sceneRef.current;
      if (scene) {
        // Measurement selection
        const markersGroup = scene.getObjectByName('measurementMarkers');
        if (markersGroup && markersGroup.children.length > 0) {
          const prevLineThresh = raycaster.params?.Line?.threshold;
          if (raycaster.params) {
            if (!raycaster.params.Line) raycaster.params.Line = {};
            raycaster.params.Line.threshold = 0.8;
          }
          const mHits = raycaster.intersectObjects(markersGroup.children, true);
          if (raycaster.params?.Line) {
            raycaster.params.Line.threshold = prevLineThresh ?? 1;
          }

          if (mHits.length > 0) {
            for (const hit of mHits) {
              let cur = hit.object;
              while (cur && cur !== markersGroup) {
                if (cur.userData?.measurementId) {
                  onSelectMeasurementRef.current?.(cur.userData.measurementId);
                  return; // Selected measurement in 3D!
                }
                cur = cur.parent;
              }
            }
          }
        }

        // Cross-Section slice selection
        const csGroup = scene.getObjectByName('crossSectionVisualsGroup');
        if (csGroup && csGroup.children.length > 0) {
          const prevLineThresh = raycaster.params?.Line?.threshold;
          if (raycaster.params) {
            if (!raycaster.params.Line) raycaster.params.Line = {};
            raycaster.params.Line.threshold = 1.0;
          }
          const csHits = raycaster.intersectObjects(csGroup.children, true);
          if (raycaster.params?.Line) {
            raycaster.params.Line.threshold = prevLineThresh ?? 1;
          }
          if (csHits.length > 0) {
            for (const hit of csHits) {
              let cur = hit.object;
              while (cur && cur !== csGroup) {
                if (cur.userData?.sectionId) {
                  onSelectSectionRef.current?.(cur.userData.sectionId);
                  return; // Selected cross-section in 3D!
                }
                cur = cur.parent;
              }
            }
          }
        }

        // Stockpile / Volume selection
        const vGroup = scene.getObjectByName('volumeMasterGroup');
        if (vGroup && vGroup.children.length > 0) {
          const prevLineThresh = raycaster.params?.Line?.threshold;
          if (raycaster.params) {
            if (!raycaster.params.Line) raycaster.params.Line = {};
            raycaster.params.Line.threshold = 1.0;
          }
          const vHits = raycaster.intersectObjects(vGroup.children, true);
          if (raycaster.params?.Line) {
            raycaster.params.Line.threshold = prevLineThresh ?? 1;
          }
          if (vHits.length > 0) {
            for (const hit of vHits) {
              let cur = hit.object;
              while (cur && cur !== vGroup) {
                if (cur.userData?.stockpileId) {
                  onSelectStockpileRef.current?.(cur.userData.stockpileId);
                  return; // Selected stockpile in 3D!
                }
                cur = cur.parent;
              }
            }
          }
        }

        // Tag selection in 3D
        const tagGroup = scene.getObjectByName('tagMarkers');
        if (tagGroup && tagGroup.children.length > 0) {
          const tagHits = raycaster.intersectObjects(tagGroup.children, false);
          if (tagHits.length > 0) {
            const clickedTagId = tagHits[0].object.userData?.tagId;
            if (clickedTagId) {
              onSelectTagRef.current?.(clickedTagId);
              return; // Selected tag in 3D!
            }
          }
        }
      }

      // 3. Terrain Raycasting for Tool Actions
      const targets = [];
      if (tilesetEngineRef.current?.getGroup()) {
        targets.push(tilesetEngineRef.current.getGroup());
      }

      if (targets.length === 0) return;
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length === 0) return;

      const hitPoint = hits[0].point;

      if (measurementModeRef.current && onMeasurementClickRef.current) {
        onMeasurementClickRef.current(hitPoint);
      } else if (volumeModeRef.current && onVolumeClickRef.current) {
        onVolumeClickRef.current(hitPoint);
      } else if (crossSectionModeRef.current && onCrossSectionClickRef.current) {
        onCrossSectionClickRef.current(hitPoint);
      } else if (tagModeRef.current && onTagClickRef.current) {
        onTagClickRef.current(hitPoint);
      }
    };

    // ─── Double Click: Smooth Focus & Pivot Centering ───
    const onDblClick = (e) => {
      if (measurementModeRef.current || volumeModeRef.current || crossSectionModeRef.current || tagModeRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const targets = [];
      if (tilesetEngineRef.current?.getGroup()) {
        targets.push(tilesetEngineRef.current.getGroup());
      }
      if (targets.length === 0) return;
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length === 0) return;

      const hitPoint = hits[0].point;
      const controls = controlsRef.current;
      if (!controls) return;

      const currentTarget = controls.target.clone();
      const currentPos = camera.position.clone();
      const offset = currentPos.clone().sub(currentTarget);

      const dist = offset.length();
      if (dist > 350) {
        offset.normalize().multiplyScalar(220);
      }

      gsap.to(controls.target, {
        x: hitPoint.x,
        y: hitPoint.y,
        z: hitPoint.z,
        duration: 0.65,
        ease: "power2.out",
        onUpdate: () => controls.update()
      });

      gsap.to(camera.position, {
        x: hitPoint.x + offset.x,
        y: hitPoint.y + offset.y,
        z: hitPoint.z + offset.z,
        duration: 0.65,
        ease: "power2.out",
        onUpdate: () => controls.update()
      });
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('dblclick', onDblClick);
    return () => {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      renderer.domElement.style.cursor = 'default';
    };
  }, [isDataLoaded, rendererRef, cameraRef, controlsRef, measurementMode, sceneRef]);

  // ─── 5. Drone GIS Camera Views ───
  const setTopView = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    gsap.to(cameraRef.current.position, {
      x: 0,
      y: 350,
      z: 0.5,
      duration: 1.2,
      ease: "power2.inOut",
      onUpdate: () => controlsRef.current.update()
    });
    gsap.to(controlsRef.current.target, {
      x: 0,
      y: 4,
      z: 0,
      duration: 1.2,
      ease: "power2.inOut",
      onUpdate: () => controlsRef.current.update()
    });
  };

  const setIsoView = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    gsap.to(cameraRef.current.position, {
      x: 160,
      y: 140,
      z: 200,
      duration: 1.2,
      ease: "power2.inOut",
      onUpdate: () => controlsRef.current.update()
    });
    gsap.to(controlsRef.current.target, {
      x: 0,
      y: 4,
      z: 0,
      duration: 1.2,
      ease: "power2.inOut",
      onUpdate: () => controlsRef.current.update()
    });
  };

  // ─── 6. Terrain Cross-Section Sampling ───
  const sampleCrossSection = (p1, p2, numSamples = 60) => {
    const points = [];
    const start = new THREE.Vector3(p1.x, p1.y, p1.z);
    const end = new THREE.Vector3(p2.x, p2.y, p2.z);
    const totalDist = start.distanceTo(end);

    const raycaster = new THREE.Raycaster();
    const downVec = new THREE.Vector3(0, -1, 0);

    const targets = [];
    if (tilesetEngineRef.current?.getGroup()) {
      targets.push(tilesetEngineRef.current.getGroup());
    }

    let minElev = Infinity;
    let maxElev = -Infinity;

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const interp = new THREE.Vector3().lerpVectors(start, end, t);
      const rayOrigin = new THREE.Vector3(interp.x, Math.max(interp.y, 50) + 150, interp.z);
      raycaster.set(rayOrigin, downVec);

      let surfaceY = interp.y;
      if (targets.length > 0) {
        const hits = raycaster.intersectObjects(targets, true);
        if (hits.length > 0) {
          surfaceY = hits[0].point.y;
        }
      }

      const refY = datumInfo?.surfaceCenterPoint?.y ?? 0;
      const groundAsl = datumInfo?.groundAsl ?? 0;
      const relElev = Number((surfaceY - refY).toFixed(2));

      if (relElev < minElev) minElev = relElev;
      if (relElev > maxElev) maxElev = relElev;

      points.push({
        x: interp.x,
        y: surfaceY,
        z: interp.z,
        elevation: relElev,
        asl: groundAsl ? Number((groundAsl + relElev).toFixed(2)) : undefined,
        distance: (t * totalDist).toFixed(2),
      });
    }

    if (minElev === Infinity) minElev = 0;
    if (maxElev === -Infinity) maxElev = 0;

    const deltaElev = Math.max(0.01, maxElev - minElev);
    const slope = totalDist > 0 ? (deltaElev / totalDist) * 100 : 0;

    return {
      samples: points,
      length: totalDist,
      minElev,
      maxElev,
      deltaElev,
      slope,
      startPoint: p1,
      endPoint: p2,
    };
  };

  // Expose GIS methods to parent
  useImperativeHandle(ref, () => ({
    sceneRef,
    cameraRef,
    rendererRef,
    tilesetEngineRef,
    get tilesetEngine() { return tilesetEngineRef.current; },
    controlsRef,
    get orthoLayer() { return orthoLayerRef.current; },
    get satelliteBasemap() { return satelliteBasemapRef.current; },
    get satelliteBasemapLayer() { return satelliteBasemapRef.current; },
    tourDetails,
    datumInfo,
    isMarkerVisible,
    setDatumMarkerVisible: (vis) => {
      setIsMarkerVisible(vis);
      tilesetEngineRef.current?.setDatumMarkerVisible(vis);
    },
    setTopView,
    setIsoView,
    sampleCrossSection,
  }), [sceneRef, cameraRef, rendererRef, controlsRef, tourDetails, datumInfo, isMarkerVisible]);

  return (
    <div className="viewer-viewport-relative" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* ─── Calibration Loading HUD (Active while lowest point is being calculated) ─── */}
      {isAligningDatum && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-slate-950/40 backdrop-blur-sm transition-opacity duration-500">
          <div className="bg-slate-900/90 border border-cyan-500/40 shadow-2xl shadow-cyan-500/20 rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col items-center text-center space-y-4 pointer-events-auto animate-in fade-in zoom-in-95 duration-300">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping" />
              <div className="absolute inset-2 rounded-full border border-cyan-400/50 animate-pulse" />
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/30">
                <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            </div>
            <div>
              <h3 className="text-white font-semibold text-base tracking-wide flex items-center justify-center gap-2">
                <span>Calibrating Ground Datum</span>
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              </h3>
              <p className="text-cyan-200/70 text-xs mt-1">
                Aligning 3D tiles & establishing center surface datum (0.00m reference)...
              </p>
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden border border-slate-700/50">
              <div className="bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500 h-full rounded-full animate-pulse w-4/5" />
            </div>
          </div>
        </div>
      )}

      {/* ─── Datum Benchmark Floating Badge (Always accessible) ─── */}
      {datumInfo && !isAligningDatum && (
        <div className="absolute top-[72px] left-5 z-20 bg-slate-900/85 backdrop-blur-md border border-cyan-500/30 shadow-lg shadow-cyan-950/40 rounded-xl px-3.5 py-2 flex items-center gap-3 text-xs text-slate-200 select-none">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-pulse" />
          <div>
            <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
              <span>⌖ Center Datum</span>
              <span className="px-1.5 py-0.2 text-[10px] bg-cyan-500/20 text-cyan-300 rounded border border-cyan-400/40 font-mono">0.00m Rel</span>
              {typeof datumInfo.groundAsl === 'number' && (
                <span className="px-1.5 py-0.2 text-[10px] bg-blue-500/20 text-blue-300 rounded border border-blue-400/40 font-mono">
                  {datumInfo.groundAsl.toFixed(1)}m ASL
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400">
              Center Surface: X: {(datumInfo.surfaceCenterPoint?.x ?? datumInfo.centerSurfacePoint?.x ?? 0).toFixed(1)}m, Z: {(datumInfo.surfaceCenterPoint?.z ?? datumInfo.centerSurfacePoint?.z ?? 0).toFixed(1)}m
            </div>
          </div>
          <button
            onClick={() => {
              const nextVis = !isMarkerVisible;
              setIsMarkerVisible(nextVis);
              tilesetEngineRef.current?.setDatumMarkerVisible(nextVis);
            }}
            className={`ml-2 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
              isMarkerVisible
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle Center Surface Datum Benchmark Marker visibility"
          >
            {isMarkerVisible ? '📍 Marker ON' : '📍 Marker OFF'}
          </button>
        </div>
      )}
    </div>
  );
});

DroneSurveyViewer.displayName = 'DroneSurveyViewer';
export default DroneSurveyViewer;
