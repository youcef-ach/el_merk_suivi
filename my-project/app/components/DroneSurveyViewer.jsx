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
  volumeMode,
  onVolumeClick,
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

  // Measurement & Volume click refs
  const measurementModeRef = useRef(false);
  const onMeasurementClickRef = useRef(null);
  measurementModeRef.current = measurementMode;
  onMeasurementClickRef.current = onMeasurementClick;

  const volumeModeRef = useRef(false);
  const onVolumeClickRef = useRef(null);
  volumeModeRef.current = volumeMode;
  onVolumeClickRef.current = onVolumeClick;

  // ─── 1. Load Drone Photogrammetry Deliverables (3D Tiles, Orthomosaics, Basemap) ───
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady || !tourId) return;

    let isSubscribed = true;

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
          elevationOffsetY: -0.15,
          opacity: 0.92,
          visible: false
        });

        // Initialize Orthomosaic Layer
        const orthoLayer = new OrthomosaicLayer(scene);
        orthoLayerRef.current = orthoLayer;

        // Load Cesium 3D Tiles
        if (tilesetUrl) {
          const engine = new TilesetEngine(scene, cameraRef.current, rendererRef.current);
          engine.loadTileset(tilesetUrl, 'rotX_neg90');
          tilesetEngineRef.current = engine;

          // Auto-extract GPS bounding volume coordinates
          engine.onGeoCoordinates((geo) => {
            if (geo && geo.lat && geo.lon) {
              satelliteBasemapRef.current?.setCoordinates(geo.lat, geo.lon);
              setTourDetails(prev => prev ? { ...prev, latitude: geo.lat, longitude: geo.lon } : { latitude: geo.lat, longitude: geo.lon });
            }
          });

          if (beforeRenderCallbacksRef?.current) {
            beforeRenderCallbacksRef.current.push(() => {
              engine.update();
            });
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

  // ─── 2. Continuous 3D Tiles Update Frame Loop ───
  useEffect(() => {
    let tilesRafId;
    const updateTiles = () => {
      tilesRafId = requestAnimationFrame(updateTiles);
      if (tilesetEngineRef.current) {
        tilesetEngineRef.current.update();
      }
    };
    updateTiles();
    return () => cancelAnimationFrame(tilesRafId);
  }, []);

  // ─── 3. Auto-Frame Camera for Drone Survey ───
  useEffect(() => {
    if (isDataLoaded && cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 140, 220);
      controlsRef.current.target.set(0, 4, 0);
      controlsRef.current.update();
    }
  }, [isDataLoaded, cameraRef, controlsRef]);

  // ─── 4. Click Raycasting for Drone Tools (Measurements / Cut & Fill) ───
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera || !isDataLoaded) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (e) => {
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

      if (measurementModeRef.current && onMeasurementClickRef.current) {
        onMeasurementClickRef.current(hitPoint);
      } else if (volumeModeRef.current && onVolumeClickRef.current) {
        onVolumeClickRef.current(hitPoint);
      }
    };

    renderer.domElement.addEventListener('click', onClick);
    return () => renderer.domElement.removeEventListener('click', onClick);
  }, [isDataLoaded, rendererRef, cameraRef]);

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

      if (surfaceY < minElev) minElev = surfaceY;
      if (surfaceY > maxElev) maxElev = surfaceY;

      points.push({
        x: interp.x,
        y: surfaceY,
        z: interp.z,
        elevation: surfaceY,
        distance: (t * totalDist).toFixed(2),
      });
    }

    if (minElev === Infinity) minElev = 0;
    if (maxElev === -Infinity) maxElev = 0;

    const deltaElev = maxElev - minElev;
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
    orthoLayer: orthoLayerRef.current,
    satelliteBasemap: satelliteBasemapRef.current,
    get satelliteBasemapLayer() { return satelliteBasemapRef.current; },
    tourDetails,
    setTopView,
    setIsoView,
    sampleCrossSection,
  }), [sceneRef, cameraRef, rendererRef, controlsRef, tourDetails]);

  return (
    <div className="viewer-viewport-relative" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

DroneSurveyViewer.displayName = 'DroneSurveyViewer';
export default DroneSurveyViewer;
