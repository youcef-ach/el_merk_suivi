import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import * as THREE from 'three';
import ModelAndScansViewer from '../components/ModelAndScansViewer';
import MeasurementHUD from '../components/MeasurementHUD';
import CrossSectionProfiler from '../components/CrossSectionProfiler';
import TagPanel from '../components/TagPanel';
import VolumeHUD from '../components/VolumeHUD';
import SurveyReportModal from '../components/SurveyReportModal';
import OrthoLayerDrawer from '../components/OrthoLayerDrawer';
import SatelliteBasemapDrawer from '../components/SatelliteBasemapDrawer';
import TimelineComparisonBar from '../components/TimelineComparisonBar';
import PointCloudDrawer from '../components/PointCloudDrawer';
import { useMeasurement } from '../hooks/useMeasurement';
import { useTags } from '../hooks/useTags';
import { useVolumeCalculation } from '../hooks/useVolumeCalculation';
import { 
  ArrowLeft, 
  Map, 
  Compass, 
  Maximize2,
  Minimize2,
  Box,
  SlidersHorizontal,
  ChevronDown,
  Globe2,
  Ruler,
  TrendingUp,
  MapPin,
  Trash2,
  MousePointer,
  Move,
  ZoomIn,
  Activity,
  Layers,
  Sparkles,
  Boxes,
  FileDown,
  History,
  Clock,
  Eye,
  Cpu
} from 'lucide-react';
import './engine.css';
import { API_URL } from '../config/api';

export function meta() {
  return [{ title: "3D Digital Twin Engine | Photogrammetry GIS Viewer" }];
}

// Sea-Level Datum Offset from RealityScan DSM (Mean Elevation ~99.31m ASL)
const DSM_DATUM_OFFSET = 99.31;
const DSM_MIN_ELEV = 95.67;
const DSM_MAX_ELEV = 103.92;

export default function EnginePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const viewerRef = useRef(null);

  const [inspectionData, setInspectionData] = useState(null);
  const [wireframe, setWireframe] = useState(false);
  const [sse, setSse] = useState(8);
  const [activeView, setActiveView] = useState('iso');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ─── Hypsometric Elevation Heatmap State ───
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.82);
  const [contourSpacing, setContourSpacing] = useState(0.5);
  const [minAsl, setMinAsl] = useState(DSM_MIN_ELEV);
  const [maxAsl, setMaxAsl] = useState(DSM_MAX_ELEV);

  // ─── Slope & Gradient Stability State ───
  const [slopeEnabled, setSlopeEnabled] = useState(false);
  const [slopeOpacity, setSlopeOpacity] = useState(0.85);
  const [slopeCriticalAngle, setSlopeCriticalAngle] = useState(35.0);
  const [slopeUnit, setSlopeUnit] = useState('deg'); // 'deg' | 'percent'

  // ─── Survey Report PDF Generator Modal State ───
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // ─── 2D Orthomosaic Layer State ───
  const [isOrthoDrawerOpen, setIsOrthoDrawerOpen] = useState(false);
  const [orthoEnabled, setOrthoEnabled] = useState(false);
  const [orthoType, setOrthoType] = useState('dsm'); // 'dsm' | 'dtm'
  const [orthoOpacity, setOrthoOpacity] = useState(0.85);
  const [orthoOffset, setOrthoOffset] = useState(0.05);

  // ─── 3D Satellite World Basemap State ───
  const [isBasemapDrawerOpen, setIsBasemapDrawerOpen] = useState(false);
  const [basemapEnabled, setBasemapEnabled] = useState(false);
  const [basemapOpacity, setBasemapOpacity] = useState(0.92);
  const [basemapElevation, setBasemapElevation] = useState(-0.15);
  const [basemapRotation, setBasemapRotation] = useState(0);
  const [basemapOffsetX, setBasemapOffsetX] = useState(0);
  const [basemapOffsetZ, setBasemapOffsetZ] = useState(0);
  const [basemapProvider, setBasemapProvider] = useState('esri-satellite');
  const [basemapZoom, setBasemapZoom] = useState(17);
  const [basemapRadius, setBasemapRadius] = useState(2);
  const [coordinates, setCoordinates] = useState({ lat: 31.9056, lon: 9.1489 });

  // ─── 4D Timeline Comparison State ───
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [activeFlightId, setActiveFlightId] = useState('flight-3');
  const [isSplitSwipeActive, setIsSplitSwipeActive] = useState(false);

  // ─── Dense Point Cloud (LIDAR) State ───
  const [isPointCloudDrawerOpen, setIsPointCloudDrawerOpen] = useState(false);
  const [pointCloudActive, setPointCloudActive] = useState(false);
  const [pointSize, setPointSize] = useState(3.5);
  const [pointShape, setPointShape] = useState('circle');
  const [pointColorMode, setPointColorMode] = useState('rgb');
  const [totalPointsCount, setTotalPointsCount] = useState(0);

  // ─── Layers & Shaders Dropdown Menu State ───
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);
  const layersMenuRef = useRef(null);

  const activeLayersCount = (heatmapEnabled ? 1 : 0) + (slopeEnabled ? 1 : 0) + (pointCloudActive ? 1 : 0) + (orthoEnabled ? 1 : 0) + (basemapEnabled ? 1 : 0);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (layersMenuRef.current && !layersMenuRef.current.contains(e.target)) {
        setIsLayersMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTogglePointCloud = () => {
    const next = !pointCloudActive;
    setPointCloudActive(next);
    const engine = viewerRef.current?.tilesetEngine;
    if (engine) {
      engine.setPointCloudMode(next);
      setTotalPointsCount(engine.getLoadedPointsCount());
    }
  };

  const handleChangePointSize = (size) => {
    setPointSize(size);
    viewerRef.current?.tilesetEngine?.setPointSize?.(size);
  };

  const handleChangePointShape = (shape) => {
    setPointShape(shape);
    viewerRef.current?.tilesetEngine?.setPointShape?.(shape);
  };

  const handleChangePointColorMode = (mode) => {
    setPointColorMode(mode);
    viewerRef.current?.tilesetEngine?.setPointColorMode?.(mode);
  };

  const handleToggleOrtho = () => {
    const next = !orthoEnabled;
    setOrthoEnabled(next);
    const orthoLayer = viewerRef.current?.orthoLayer;
    if (orthoLayer) {
      if (next && !orthoLayer.mesh) {
        const url = orthoType === 'dsm' ? '/digital_surface_model_image.jpg' : '/digital_terrain_model_image.png';
        orthoLayer.loadOrtho(url);
      }
      orthoLayer.setVisible(next);
    }
  };

  const handleChangeOrthoType = (type) => {
    setOrthoType(type);
    const orthoLayer = viewerRef.current?.orthoLayer;
    if (orthoLayer) {
      const url = type === 'dsm' ? '/digital_surface_model_image.jpg' : '/digital_terrain_model_image.png';
      orthoLayer.loadOrtho(url);
      orthoLayer.setVisible(orthoEnabled);
      orthoLayer.setOpacity(orthoOpacity);
      orthoLayer.setElevationOffset(orthoOffset);
    }
  };

  const handleChangeOrthoOpacity = (val) => {
    setOrthoOpacity(val);
    viewerRef.current?.orthoLayer?.setOpacity?.(val);
  };

  const handleChangeOrthoOffset = (val) => {
    setOrthoOffset(val);
    viewerRef.current?.orthoLayer?.setElevationOffset?.(val);
  };

  const handleToggleBasemap = () => {
    const next = !basemapEnabled;
    setBasemapEnabled(next);
    const basemapLayer = viewerRef.current?.satelliteBasemapLayer;
    if (basemapLayer) {
      if (next && !basemapLayer.isLoaded) {
        basemapLayer.load({
          lat: coordinates.lat,
          lon: coordinates.lon,
          zoom: basemapZoom,
          gridRadius: basemapRadius,
          providerKey: basemapProvider,
          elevationOffsetY: basemapElevation,
          opacity: basemapOpacity,
          visible: true
        });
      } else {
        basemapLayer.setVisible(next);
      }
    }
  };

  const handleChangeBasemapOpacity = (val) => {
    setBasemapOpacity(val);
    viewerRef.current?.satelliteBasemapLayer?.setOpacity?.(val);
  };

  const handleChangeBasemapElevation = (val) => {
    setBasemapElevation(val);
    viewerRef.current?.satelliteBasemapLayer?.setElevation?.(val);
  };

  const handleChangeBasemapProvider = (providerKey) => {
    setBasemapProvider(providerKey);
    viewerRef.current?.satelliteBasemapLayer?.setProvider?.(providerKey);
  };

  const handleChangeBasemapZoom = (zoom) => {
    setBasemapZoom(zoom);
    viewerRef.current?.satelliteBasemapLayer?.load?.({
      lat: coordinates.lat,
      lon: coordinates.lon,
      zoom,
      gridRadius: basemapRadius,
      providerKey: basemapProvider,
      elevationOffsetY: basemapElevation,
      opacity: basemapOpacity,
      visible: basemapEnabled
    });
  };

  const handleChangeBasemapRadius = (radius) => {
    setBasemapRadius(radius);
    viewerRef.current?.satelliteBasemapLayer?.load?.({
      lat: coordinates.lat,
      lon: coordinates.lon,
      zoom: basemapZoom,
      gridRadius: radius,
      providerKey: basemapProvider,
      elevationOffsetY: basemapElevation,
      opacity: basemapOpacity,
      visible: basemapEnabled
    });
  };

  const handleChangeCoordinates = (lat, lon) => {
    setCoordinates({ lat, lon });
    viewerRef.current?.satelliteBasemapLayer?.setCoordinates?.(lat, lon, basemapZoom);
  };

  const handleChangeBasemapRotation = (deg) => {
    setBasemapRotation(deg);
    viewerRef.current?.satelliteBasemapLayer?.setRotation?.(deg);
  };

  const handleChangeBasemapOffset = (x, z) => {
    setBasemapOffsetX(x);
    setBasemapOffsetZ(z);
    viewerRef.current?.satelliteBasemapLayer?.setManualOffset?.(x, z);
  };

  const handleSelectFlight = (flightId) => {
    setActiveFlightId(flightId);
    console.log('[Engine] Selected 4D Flight Timestamp:', flightId);
  };

  const handleToggleSplitSwipe = () => {
    setIsSplitSwipeActive(!isSplitSwipeActive);
  };

  const handleMinAslChange = (val) => {
    const num = parseFloat(val);
    setMinAsl(num);
    const localMinY = num - DSM_DATUM_OFFSET;
    const localMaxY = maxAsl - DSM_DATUM_OFFSET;
    viewerRef.current?.tilesetEngine?.setHeatmapRange?.(localMinY, localMaxY);
  };

  const handleMaxAslChange = (val) => {
    const num = parseFloat(val);
    setMaxAsl(num);
    const localMinY = minAsl - DSM_DATUM_OFFSET;
    const localMaxY = num - DSM_DATUM_OFFSET;
    viewerRef.current?.tilesetEngine?.setHeatmapRange?.(localMinY, localMaxY);
  };

  const handleResetRange = () => {
    setMinAsl(DSM_MIN_ELEV);
    setMaxAsl(DSM_MAX_ELEV);
    viewerRef.current?.tilesetEngine?.setHeatmapRange?.(DSM_MIN_ELEV - DSM_DATUM_OFFSET, DSM_MAX_ELEV - DSM_DATUM_OFFSET);
  };

  // ─── Live Cursor Elevation & Slope Telemetry ───
  const [cursorTelemetry, setCursorTelemetry] = useState(null);

  // ─── Active GIS Mode ───
  // 'none' | 'measure' | 'crossSection' | 'tag'
  const [activeTool, setActiveTool] = useState('none');

  // ─── Measurement Hook ───
  const {
    measurements,
    handleMeasurementClick,
    clearAllMeasurements,
    hasPendingPoint
  } = useMeasurement(viewerRef);

  // ─── Tags / Inspection Pins Hook ───
  const {
    tags,
    selectedTag,
    setSelectedTagId,
    handleTagClick,
    createTag,
    updateTag,
    deleteTag,
    uploadDocument,
    deleteDocument
  } = useTags(viewerRef, id);

  // ─── Stockpile Volume & Earthwork Hook ───
  const {
    polygonPoints: volumePoints,
    isDrawing: isDrawingVolume,
    volumeResult,
    isCalculating: isCalculatingVolume,
    baseMethod: volumeBaseMethod,
    customBaseAsl: volumeCustomAsl,
    density: volumeDensity,
    handleVolumeClick,
    completePolygon: completeVolumePolygon,
    clearVolume,
    handleBaseMethodChange: handleVolumeBaseMethodChange,
    handleCustomBaseAslChange: handleVolumeCustomAslChange,
    handleDensityChange: handleVolumeDensityChange
  } = useVolumeCalculation(viewerRef);

  // ─── Cross-Section State & Drawing ───
  const [profileData, setProfileData] = useState(null);
  const [csStartPoint, setCsStartPoint] = useState(null);
  const csMarkersGroupRef = useRef(null);

  // Stockpile Volume Canvas Click Handler
  const handleVolumeCanvasClick = useCallback((event) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    const model = viewerRef.current?.modelRef?.current;
    const tilesGroup = viewerRef.current?.tilesetEngine?.getGroup?.() || viewerRef.current?.tilesetEngineRef?.current?.getGroup?.();

    if (!renderer || !camera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const meshes = [];
    if (model) model.traverse(c => { if (c.isMesh) meshes.push(c); });
    if (tilesGroup) tilesGroup.traverse(c => { if (c.isMesh) meshes.push(c); });

    if (meshes.length === 0) return;

    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length === 0) return;

    const hitPoint = intersects[0].point.clone();
    handleVolumeClick(hitPoint);
  }, [handleVolumeClick]);

  // Fetch Inspection details
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    fetch(`${API_URL}/inspections/${id}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(res => res.json())
      .then(data => setInspectionData(data))
      .catch(err => console.error(err));
  }, [id]);

  // Sync Coordinates with 3D Tiles GPS Auto-Detection
  useEffect(() => {
    const engine = viewerRef.current?.tilesetEngine;
    if (engine) {
      engine.onGeoCoordinates((geo) => {
        if (geo && geo.lat && geo.lon) {
          setCoordinates({ lat: geo.lat, lon: geo.lon });
        }
      });
    }
  }, [viewerRef.current?.tilesetEngine]);

  // Live Cursor Elevation Raycasting
  const handlePointerMove = useCallback((e) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    const tilesGroup = viewerRef.current?.tilesetEngine?.getGroup?.() || viewerRef.current?.tilesetEngineRef?.current?.getGroup?.();

    if (!renderer || !camera || !tilesGroup) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const meshes = [];
    tilesGroup.traverse(c => { if (c.isMesh) meshes.push(c); });

    if (meshes.length === 0) return;

    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const p = hit.point;
      const relElev = p.y;
      const aslElev = relElev + DSM_DATUM_OFFSET;

      // Real-Time Topographic Slope Gradient Calculation
      let slopeDeg = 0;
      let slopePct = 0;
      if (hit.face && hit.face.normal) {
        const worldNormal = hit.face.normal.clone();
        if (hit.object) {
          worldNormal.transformDirection(hit.object.matrixWorld);
        }
        const cosTheta = Math.min(1.0, Math.max(0.0, Math.abs(worldNormal.y)));
        const thetaRad = Math.acos(cosTheta);
        slopeDeg = (thetaRad * 180) / Math.PI;
        slopePct = Math.tan(thetaRad) * 100;
      }

      setCursorTelemetry({
        aslElev: aslElev.toFixed(2),
        relElev: (relElev >= 0 ? `+${relElev.toFixed(2)}` : relElev.toFixed(2)),
        x: p.x.toFixed(2),
        z: p.z.toFixed(2),
        slopeDeg: slopeDeg.toFixed(1),
        slopePct: slopePct.toFixed(1)
      });
    } else {
      setCursorTelemetry(null);
    }
  }, []);

  const toggleHeatmap = () => {
    const next = !heatmapEnabled;
    setHeatmapEnabled(next);
    viewerRef.current?.tilesetEngine?.setHeatmapEnabled?.(next);
  };

  const handleHeatmapOpacityChange = (val) => {
    const num = parseFloat(val);
    setHeatmapOpacity(num);
    viewerRef.current?.tilesetEngine?.setHeatmapOpacity?.(num);
  };

  const handleContourSpacingChange = (val) => {
    const num = parseFloat(val);
    setContourSpacing(num);
    if (num <= 0) {
      viewerRef.current?.tilesetEngine?.setContourEnabled?.(false);
    } else {
      viewerRef.current?.tilesetEngine?.setContourEnabled?.(true);
      viewerRef.current?.tilesetEngine?.setContourSpacing?.(num);
    }
  };

  const toggleSlope = () => {
    const next = !slopeEnabled;
    setSlopeEnabled(next);
    viewerRef.current?.tilesetEngine?.setSlopeEnabled?.(next);
  };

  const handleSlopeOpacityChange = (val) => {
    const num = parseFloat(val);
    setSlopeOpacity(num);
    viewerRef.current?.tilesetEngine?.setSlopeOpacity?.(num);
  };

  const handleSlopeCriticalAngleChange = (val) => {
    const num = parseFloat(val);
    setSlopeCriticalAngle(num);
    viewerRef.current?.tilesetEngine?.setSlopeCriticalAngle?.(num);
  };

  const toggleTool = (toolName) => {
    if (activeTool === toolName) {
      setActiveTool('none');
      if (toolName === 'crossSection') {
        clearCrossSectionMarkers();
        setCsStartPoint(null);
      }
    } else {
      setActiveTool(toolName);
      if (toolName !== 'crossSection') {
        clearCrossSectionMarkers();
        setCsStartPoint(null);
      }
    }
  };

  const clearCrossSectionMarkers = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (csMarkersGroupRef.current && scene) {
      scene.remove(csMarkersGroupRef.current);
      csMarkersGroupRef.current.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      csMarkersGroupRef.current = null;
    }
  }, []);

  const ensureCsMarkersGroup = useCallback(() => {
    const scene = viewerRef.current?.sceneRef?.current;
    if (!csMarkersGroupRef.current && scene) {
      const group = new THREE.Group();
      group.name = 'crossSectionMarkers';
      group.renderOrder = 999;
      scene.add(group);
      csMarkersGroupRef.current = group;
    }
    return csMarkersGroupRef.current;
  }, []);

  const handleCrossSectionClick = useCallback((event) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    const model = viewerRef.current?.modelRef?.current;
    const tilesGroup = viewerRef.current?.tilesetEngine?.getGroup?.() || viewerRef.current?.tilesetEngineRef?.current?.getGroup?.();

    if (!renderer || !camera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const meshes = [];
    if (model) model.traverse(c => { if (c.isMesh) meshes.push(c); });
    if (tilesGroup) tilesGroup.traverse(c => { if (c.isMesh) meshes.push(c); });

    if (meshes.length === 0) return;

    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length === 0) return;

    const hitPoint = intersects[0].point.clone();
    const group = ensureCsMarkersGroup();
    if (!group) return;

    if (!csStartPoint) {
      // First point of cross section
      clearCrossSectionMarkers();
      const freshGroup = ensureCsMarkersGroup();
      
      const sphereGeo = new THREE.SphereGeometry(0.4, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x10b981, depthTest: false, transparent: true, opacity: 0.95 });
      const marker = new THREE.Mesh(sphereGeo, sphereMat);
      marker.position.copy(hitPoint);
      marker.renderOrder = 1000;
      freshGroup.add(marker);

      setCsStartPoint(hitPoint);
      setProfileData(null);
    } else {
      // Second point of cross section — sample topography
      const sphereGeo = new THREE.SphereGeometry(0.4, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, transparent: true, opacity: 0.95 });
      const endMarker = new THREE.Mesh(sphereGeo, sphereMat);
      endMarker.position.copy(hitPoint);
      endMarker.renderOrder = 1000;
      group.add(endMarker);

      // Draw 3D cut line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([csStartPoint, hitPoint]);
      const lineMat = new THREE.LineDashedMaterial({ 
        color: 0x34d399, 
        dashSize: 1, 
        gapSize: 0.5, 
        depthTest: false, 
        transparent: true,
        opacity: 0.9,
        linewidth: 3 
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      line.renderOrder = 999;
      group.add(line);

      // Sample topography points along segment
      if (viewerRef.current?.sampleCrossSection) {
        const result = viewerRef.current.sampleCrossSection(csStartPoint, hitPoint, 80);
        setProfileData(result);
      }

      setCsStartPoint(null);
    }
  }, [csStartPoint, ensureCsMarkersGroup, clearCrossSectionMarkers]);

  const handleSaveCrossSection = async (data) => {
    const token = localStorage.getItem('access_token');
    if (!token || !id) return;

    try {
      await fetch(`${API_URL}/inspections/${id}/survey/cross-sections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: data.name,
          startPoint: data.startPoint,
          endPoint: data.endPoint,
          samples: data.samples,
          metrics: {
            length: data.length,
            minElev: data.minElev,
            maxElev: data.maxElev,
            deltaElev: data.deltaElev,
            slope: data.slope
          }
        })
      });
      alert('Cross-section profile saved successfully to database!');
    } catch (e) {
      console.error(e);
      alert('Failed to save cross section: ' + e.message);
    }
  };

  const handlePromptNewTag = useCallback((position) => {
    const title = window.prompt("Enter Title for Inspection Pin / Defect Tag:", "Inspection Observation");
    if (title && title.trim()) {
      createTag(title.trim(), position);
    }
  }, [createTag]);

  const toggleWireframe = () => {
    const next = !wireframe;
    setWireframe(next);
    viewerRef.current?.tilesetEngine?.setWireframe?.(next);
  };

  const handleSseChange = (val) => {
    const num = Number(val);
    setSse(num);
    viewerRef.current?.tilesetEngine?.setScreenSpaceError?.(num);
  };

  const handleSetTopView = () => {
    setActiveView('top');
    viewerRef.current?.setTopView?.();
  };

  const handleSetIsoView = () => {
    setActiveView('iso');
    viewerRef.current?.setIsoView?.();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const latestMeasurement = measurements.length > 0 ? measurements[measurements.length - 1] : null;

  return (
    <div className="engine-viewport-root" onPointerMove={handlePointerMove}>
      
      {/* ─── Top Floating Glass HUD Bar ─── */}
      <header className="engine-hud-header">
        
        {/* Left Section: Back + Title + Live Badge */}
        <div className="engine-title-box">
          <button 
            onClick={() => navigate('/projects')}
            className="engine-btn"
            title="Return to Projects Dashboard"
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            <span>Projects</span>
          </button>

          <div className="engine-divider" />

          <span className="engine-title-text" title={inspectionData?.title || 'Photogrammetry 3D Mesh'}>
            {inspectionData?.title || 'Photogrammetry 3D Mesh'}
          </span>

          <div className="engine-badge-live">
            <span className="engine-pulse-dot" />
            <span>3D Mesh Active</span>
          </div>

          {inspectionData?.coordinateSystem && (
            <span className="engine-chip-epsg">
              <Globe2 style={{ width: 11, height: 11 }} />
              {inspectionData.coordinateSystem.includes('32260') ? 'EPSG:32260' : 'Oran UTM'}
            </span>
          )}
        </div>

        <div className="engine-divider" />

        {/* Center Section: Camera Preset View Selector */}
        <div className="engine-segmented-track">
          <button 
            onClick={handleSetTopView}
            className={`engine-segmented-btn ${activeView === 'top' ? 'active-top' : ''}`}
            title="Top-Down Orthogonal 2D View"
          >
            <Map style={{ width: 13, height: 13 }} />
            <span>Top</span>
          </button>

          <button 
            onClick={handleSetIsoView}
            className={`engine-segmented-btn ${activeView === 'iso' ? 'active-iso' : ''}`}
            title="Perspective Isometric 3D View"
          >
            <Compass style={{ width: 13, height: 13 }} />
            <span>Iso 3D</span>
          </button>
        </div>

        <div className="engine-divider" />

        {/* GIS Survey & Visual Analysis Tools Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          
          {/* 1. 3D Distance Ruler */}
          <button 
            onClick={() => toggleTool('measure')}
            className={`engine-btn ${activeTool === 'measure' ? 'engine-btn-cyan' : ''}`}
            title="Measure 3D & 2D Surface Distance, Height Difference and Slope"
          >
            <Ruler style={{ width: 14, height: 14 }} />
            <span>Ruler 3D</span>
            {measurements.length > 0 && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: 'rgba(6, 182, 212, 0.3)', color: '#38bdf8' }}>
                {measurements.length}
              </span>
            )}
          </button>

          {/* 2. Elevation Cross-Section Profiler */}
          <button 
            onClick={() => toggleTool('crossSection')}
            className={`engine-btn ${activeTool === 'crossSection' ? 'engine-btn-emerald' : ''}`}
            title="Elevation Cross-Section Profiler: Click 2 points across terrain to view elevation graph"
          >
            <TrendingUp style={{ width: 14, height: 14 }} />
            <span>Elevation Slice</span>
          </button>

          {/* 3. Stockpile Volume & Earthwork Cut/Fill Tool */}
          <button 
            onClick={() => toggleTool('volume')}
            className={`engine-btn ${activeTool === 'volume' ? 'engine-btn-amber' : ''}`}
            title="Stockpile Volume & Earthwork: Draw 3D polygon to calculate volume (m³) and tonnage"
          >
            <Boxes style={{ width: 14, height: 14 }} />
            <span>Stockpile Volume</span>
            {volumePoints.length > 0 && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}>
                {volumePoints.length}
              </span>
            )}
          </button>

          {/* 4. Smart Inspection Pins (Tags) */}
          <button 
            onClick={() => toggleTool('tag')}
            className={`engine-btn ${activeTool === 'tag' ? 'engine-btn-indigo' : ''}`}
            title="Drop Smart Inspection Pins / Defect Notes on 3D Mesh"
          >
            <MapPin style={{ width: 14, height: 14 }} />
            <span>Drop Pin</span>
            {tags.length > 0 && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: 'rgba(99, 102, 241, 0.3)', color: '#a5b4fc' }}>
                {tags.length}
              </span>
            )}
          </button>

          {/* 5. GIS Layers & Shaders Dropdown Hub */}
          <div className="engine-dropdown-container" ref={layersMenuRef}>
            <button 
              onClick={() => setIsLayersMenuOpen(!isLayersMenuOpen)}
              className={`engine-btn ${activeLayersCount > 0 ? 'engine-btn-active-layers' : ''}`}
              title="Toggle GIS Visual Colormaps, Shading & Point Cloud"
            >
              <Layers style={{ width: 14, height: 14 }} />
              <span>Layers & Shaders</span>
              {activeLayersCount > 0 && (
                <span className="engine-active-count-badge">
                  {activeLayersCount}
                </span>
              )}
              <ChevronDown style={{ width: 12, height: 12, opacity: 0.7 }} />
            </button>

            {isLayersMenuOpen && (
              <div className="engine-layers-dropdown-menu">
                <div className="engine-dropdown-header">VISUALIZATION & GIS LAYERS</div>
                
                {/* 1. Hypsometric Elevation Heatmap */}
                <button 
                  onClick={() => { toggleHeatmap(); setIsLayersMenuOpen(false); }}
                  className={`engine-dropdown-item ${heatmapEnabled ? 'active' : ''}`}
                >
                  <Sparkles style={{ width: 14, height: 14, color: '#38bdf8' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>Elevation Heatmap</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Sea-level false-color contour map</div>
                  </div>
                  <span className={`engine-switch-dot ${heatmapEnabled ? 'on' : ''}`} />
                </button>

                {/* 2. Slope & Gradient Stability */}
                <button 
                  onClick={() => { toggleSlope(); setIsLayersMenuOpen(false); }}
                  className={`engine-dropdown-item ${slopeEnabled ? 'active' : ''}`}
                >
                  <TrendingUp style={{ width: 14, height: 14, color: '#f97316' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>Slope & Stability</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Ramp & highwall steepness colormap</div>
                  </div>
                  <span className={`engine-switch-dot ${slopeEnabled ? 'on' : ''}`} />
                </button>

                {/* 3. Dense Point Cloud (LIDAR) */}
                <button 
                  onClick={() => { setIsPointCloudDrawerOpen(true); setIsLayersMenuOpen(false); }}
                  className={`engine-dropdown-item ${pointCloudActive ? 'active' : ''}`}
                >
                  <Cpu style={{ width: 14, height: 14, color: '#a855f7' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>Point Cloud (LIDAR)</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Discrete laser point kernels & sizes</div>
                  </div>
                  <span className={`engine-switch-dot ${pointCloudActive ? 'on' : ''}`} />
                </button>

                {/* 4. 2D High-Res Orthomosaic */}
                <button 
                  onClick={() => { setIsOrthoDrawerOpen(true); setIsLayersMenuOpen(false); }}
                  className={`engine-dropdown-item ${orthoEnabled ? 'active' : ''}`}
                >
                  <Map style={{ width: 14, height: 14, color: '#10b981' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>2D Orthomosaic & DTM</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Aerial photogrammetry projection</div>
                  </div>
                  <span className={`engine-switch-dot ${orthoEnabled ? 'on' : ''}`} />
                </button>

                {/* 5. 3D Satellite World Basemap */}
                <button 
                  onClick={() => { setIsBasemapDrawerOpen(true); setIsLayersMenuOpen(false); }}
                  className={`engine-dropdown-item ${basemapEnabled ? 'active' : ''}`}
                >
                  <Globe2 style={{ width: 14, height: 14, color: '#34d399' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>3D Satellite Basemap</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Real-world geographic ground terrain</div>
                  </div>
                  <span className={`engine-switch-dot ${basemapEnabled ? 'on' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {/* 8. 4D Multi-Temporal Survey Timeline */}
          <button 
            onClick={() => setIsTimelineOpen(!isTimelineOpen)}
            className={`engine-btn ${isTimelineOpen ? 'engine-btn-indigo' : ''}`}
            title="Compare Topographic Elevation & Volumetric Evolution Across Flights"
          >
            <History style={{ width: 14, height: 14 }} />
            <span>4D Timeline</span>
          </button>

          {/* 9. Export Certified Survey Dossier Report (PDF) */}
          <button 
            onClick={() => setIsReportModalOpen(true)}
            className="engine-btn"
            style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(14, 165, 233, 0.25))', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
            title="Export Professional Geotechnical PDF Survey Dossier with 3D Snapshots"
          >
            <FileDown style={{ width: 14, height: 14 }} />
            <span>Export Report</span>
          </button>

          {/* Clear Measurements Button */}
          {measurements.length > 0 && activeTool === 'measure' && (
            <button 
              onClick={clearAllMeasurements}
              className="engine-btn"
              style={{ color: '#ff6b6b', borderColor: 'rgba(255, 107, 107, 0.3)' }}
              title="Clear All Active Measurements"
            >
              <Trash2 style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>

        <div className="engine-divider" />

        {/* Right Section: Wireframe + LOD Selector + Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          
          {/* Wireframe Button */}
          <button 
            onClick={toggleWireframe}
            className={`engine-btn ${wireframe ? 'engine-btn-active' : ''}`}
            title="Toggle Polygonal Wireframe View"
          >
            <Box style={{ width: 14, height: 14 }} />
            <span>Wireframe</span>
          </button>

          {/* LOD Level Selector */}
          <div className="engine-select-pill">
            <SlidersHorizontal className="engine-select-icon" />
            <select 
              value={sse}
              onChange={(e) => handleSseChange(e.target.value)}
              className="engine-native-select"
            >
              <option value="4">LOD: Ultra (SSE 4)</option>
              <option value="8">LOD: High (SSE 8)</option>
              <option value="16">LOD: Balanced (SSE 16)</option>
              <option value="24">LOD: Fast (SSE 24)</option>
            </select>
            <ChevronDown className="engine-select-arrow" />
          </div>

          {/* Fullscreen Button */}
          <button 
            onClick={toggleFullscreen}
            className="engine-btn engine-btn-icon"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 style={{ width: 14, height: 14 }} /> : <Maximize2 style={{ width: 14, height: 14 }} />}
          </button>
        </div>
      </header>

      {/* ─── 3D WebGL Canvas Viewport (100% Fullscreen) ─── */}
      <main className="engine-canvas-container">
        <ModelAndScansViewer 
          ref={viewerRef} 
          tourId={id}
          measurementMode={activeTool === 'measure'}
          onMeasurementClick={handleMeasurementClick}
          tagMode={activeTool === 'tag'}
          onTagClick={(e) => handleTagClick(e, handlePromptNewTag)}
          onTagSelect={setSelectedTagId}
          pointersMode={activeTool === 'crossSection'}
          onPointerClick={handleCrossSectionClick}
          volumeMode={activeTool === 'volume'}
          onVolumeClick={handleVolumeCanvasClick}
        />
      </main>

      {/* ─── GIS Survey Modals & Drawers ─── */}

      {/* 1. Measurement Results HUD Overlay */}
      {activeTool === 'measure' && latestMeasurement && (
        <MeasurementHUD 
          measurementData={latestMeasurement}
          onClose={() => setActiveTool('none')}
          inspectionId={id}
        />
      )}

      {/* 2. Elevation Cross-Section Topography Profiler Drawer */}
      {profileData && (
        <CrossSectionProfiler 
          profileData={profileData}
          onClose={() => { setProfileData(null); clearCrossSectionMarkers(); }}
          onSave={handleSaveCrossSection}
          inspectionId={id}
        />
      )}

      {/* 3. Tag / Inspection Pin Slide-in Panel */}
      {selectedTag && (
        <TagPanel 
          tag={selectedTag}
          onUpdate={updateTag}
          onDelete={deleteTag}
          onUploadDocument={uploadDocument}
          onDeleteDocument={deleteDocument}
          onClose={() => setSelectedTagId(null)}
        />
      )}

      {/* 4. Stockpile Volume & Earthwork Analytics HUD */}
      {(activeTool === 'volume' || volumeResult) && (
        <VolumeHUD 
          polygonPoints={volumePoints}
          isDrawing={isDrawingVolume}
          volumeResult={volumeResult}
          isCalculating={isCalculatingVolume}
          baseMethod={volumeBaseMethod}
          customBaseAsl={volumeCustomAsl}
          density={volumeDensity}
          onComplete={completeVolumePolygon}
          onClear={clearVolume}
          onBaseMethodChange={handleVolumeBaseMethodChange}
          onCustomBaseAslChange={handleVolumeCustomAslChange}
          onDensityChange={handleVolumeDensityChange}
          onClose={() => {
            if (activeTool === 'volume') setActiveTool('none');
            clearVolume();
          }}
        />
      )}

      {/* 5. 2D Orthomosaic Layer Drawer */}
      <OrthoLayerDrawer 
        isOpen={isOrthoDrawerOpen}
        onClose={() => setIsOrthoDrawerOpen(false)}
        orthoEnabled={orthoEnabled}
        onToggleOrtho={handleToggleOrtho}
        orthoType={orthoType}
        onChangeOrthoType={handleChangeOrthoType}
        orthoOpacity={orthoOpacity}
        onChangeOrthoOpacity={handleChangeOrthoOpacity}
        orthoOffset={orthoOffset}
        onChangeOrthoOffset={handleChangeOrthoOffset}
      />

      {/* 6. 3D Satellite World Basemap Drawer */}
      <SatelliteBasemapDrawer
        isOpen={isBasemapDrawerOpen}
        onClose={() => setIsBasemapDrawerOpen(false)}
        basemapEnabled={basemapEnabled}
        onToggleBasemap={handleToggleBasemap}
        basemapOpacity={basemapOpacity}
        onChangeBasemapOpacity={handleChangeBasemapOpacity}
        basemapElevation={basemapElevation}
        onChangeBasemapElevation={handleChangeBasemapElevation}
        basemapRotation={basemapRotation}
        onChangeBasemapRotation={handleChangeBasemapRotation}
        basemapOffsetX={basemapOffsetX}
        basemapOffsetZ={basemapOffsetZ}
        onChangeBasemapOffset={handleChangeBasemapOffset}
        basemapProvider={basemapProvider}
        onChangeBasemapProvider={handleChangeBasemapProvider}
        basemapZoom={basemapZoom}
        onChangeBasemapZoom={handleChangeBasemapZoom}
        basemapRadius={basemapRadius}
        onChangeBasemapRadius={handleChangeBasemapRadius}
        coordinates={coordinates}
        onChangeCoordinates={handleChangeCoordinates}
      />

      {/* 6. 4D Multi-Temporal Survey Timeline Bar */}
      <TimelineComparisonBar 
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        activeFlightId={activeFlightId}
        onSelectFlight={handleSelectFlight}
        isSplitSwipeActive={isSplitSwipeActive}
        onToggleSplitSwipe={handleToggleSplitSwipe}
      />

      {/* 7. PDF Survey Report Generator Modal */}
      <SurveyReportModal 
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        inspectionData={inspectionData}
        viewerRef={viewerRef}
        volumeResult={volumeResult}
        profileData={profileData}
        tags={tags}
        measurements={measurements}
      />

      {/* 8. Dense Point Cloud (LIDAR) Controls Drawer */}
      <PointCloudDrawer 
        isOpen={isPointCloudDrawerOpen}
        onClose={() => setIsPointCloudDrawerOpen(false)}
        pointCloudActive={pointCloudActive}
        onTogglePointCloud={handleTogglePointCloud}
        pointSize={pointSize}
        onChangePointSize={handleChangePointSize}
        pointShape={pointShape}
        onChangePointShape={handleChangePointShape}
        pointColorMode={pointColorMode}
        onChangePointColorMode={handleChangePointColorMode}
        totalPointsCount={totalPointsCount}
      />

      {/* ─── Floating Hypsometric Elevation Legend Card (Bottom Left) ─── */}
      {heatmapEnabled && (
        <div className="engine-elevation-legend" style={{ width: 280 }}>
          <div className="engine-legend-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Layers style={{ width: 12, height: 12, color: '#38bdf8' }} />
              Hypsometric Elevation
            </span>
            <button 
              onClick={handleResetRange}
              style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}
              title="Reset to calibrated DSM range"
            >
              Reset
            </button>
          </div>

          <div className="engine-rainbow-bar" />

          <div className="engine-legend-ticks">
            <span>{minAsl.toFixed(1)} m</span>
            <span>{((minAsl + maxAsl) / 2).toFixed(1)} m</span>
            <span>{maxAsl.toFixed(1)} m ASL</span>
          </div>

          {/* Min / Max Range Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Min Level</div>
              <input 
                type="number" 
                step="0.2" 
                value={minAsl}
                onChange={(e) => handleMinAslChange(e.target.value)}
                style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#38bdf8', fontSize: 11, padding: '3px 6px' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Max Level</div>
              <input 
                type="number" 
                step="0.2" 
                value={maxAsl}
                onChange={(e) => handleMaxAslChange(e.target.value)}
                style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f87171', fontSize: 11, padding: '3px 6px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
            <span>Blend: {Math.round(heatmapOpacity * 100)}%</span>
            <input 
              type="range" 
              min="0.2" 
              max="1.0" 
              step="0.05" 
              value={heatmapOpacity}
              onChange={(e) => handleHeatmapOpacityChange(e.target.value)}
              style={{ width: 100, accentColor: '#38bdf8', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
            <span>Contours:</span>
            <select 
              value={contourSpacing} 
              onChange={(e) => handleContourSpacingChange(e.target.value)}
              style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#38bdf8', fontSize: 10, padding: '2px 4px', cursor: 'pointer' }}
            >
              <option value="0.25">Every 0.25 m</option>
              <option value="0.5">Every 0.5 m</option>
              <option value="1.0">Every 1.0 m</option>
              <option value="0">Off</option>
            </select>
          </div>
        </div>
      )}

      {/* ─── Floating Slope & Gradient Stability Legend Card (Bottom Left) ─── */}
      {slopeEnabled && (
        <div className="engine-slope-legend" style={{ width: 280, bottom: heatmapEnabled ? 210 : 64 }}>
          <div className="engine-legend-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <TrendingUp style={{ width: 12, height: 12, color: '#f97316' }} />
              Slope & Stability
            </span>
            <div className="engine-unit-pills">
              <button 
                onClick={() => setSlopeUnit('deg')} 
                className={`engine-unit-pill ${slopeUnit === 'deg' ? 'active' : ''}`}
              >
                Deg (°)
              </button>
              <button 
                onClick={() => setSlopeUnit('percent')} 
                className={`engine-unit-pill ${slopeUnit === 'percent' ? 'active' : ''}`}
              >
                Grade (%)
              </button>
            </div>
          </div>

          <div className="engine-slope-bar" />

          <div className="engine-legend-ticks">
            <span>{slopeUnit === 'deg' ? '0° (Flat)' : '0%'}</span>
            <span>{slopeUnit === 'deg' ? '20° (Ramp)' : '36%'}</span>
            <span>{slopeUnit === 'deg' ? '35° (Berm)' : '70%'}</span>
            <span style={{ color: '#f87171' }}>{slopeUnit === 'deg' ? '>50°' : '>120%'}</span>
          </div>

          {/* Critical Hazard Alert Slider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
            <span>Hazard Alert:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input 
                type="range" 
                min="20" 
                max="55" 
                step="1" 
                value={slopeCriticalAngle}
                onChange={(e) => handleSlopeCriticalAngleChange(e.target.value)}
                style={{ width: 80, accentColor: '#f87171', cursor: 'pointer' }}
              />
              <span style={{ color: '#f87171', fontWeight: 700, minWidth: 32 }}>
                {slopeUnit === 'deg' ? `${slopeCriticalAngle}°` : `${Math.round(Math.tan((slopeCriticalAngle * Math.PI) / 180) * 100)}%`}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
            <span>Blend: {Math.round(slopeOpacity * 100)}%</span>
            <input 
              type="range" 
              min="0.2" 
              max="1.0" 
              step="0.05" 
              value={slopeOpacity}
              onChange={(e) => handleSlopeOpacityChange(e.target.value)}
              style={{ width: 95, accentColor: '#f97316', cursor: 'pointer' }}
            />
          </div>
        </div>
      )}

      {/* ─── Live Cursor Elevation & Slope Telemetry Chip (Bottom Left) ─── */}
      {cursorTelemetry && (
        <div className="engine-telemetry-chip">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity style={{ width: 13, height: 13, color: '#38bdf8' }} />
            <span className="engine-telemetry-elev">{cursorTelemetry.aslElev} m ASL</span>
            <span className="engine-telemetry-rel">({cursorTelemetry.relElev} m)</span>
          </div>
          <span className="engine-hud-footer-dot">•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#94a3b8' }}>Slope:</span>
            <span style={{ color: parseFloat(cursorTelemetry.slopeDeg) >= slopeCriticalAngle ? '#f87171' : '#34d399', fontWeight: 700 }}>
              {slopeUnit === 'deg' ? `${cursorTelemetry.slopeDeg}°` : `${cursorTelemetry.slopePct}%`}
            </span>
          </div>
          <span className="engine-hud-footer-dot">•</span>
          <span style={{ color: '#cbd5e1' }}>X: {cursorTelemetry.x} m</span>
          <span style={{ color: '#cbd5e1' }}>Z: {cursorTelemetry.z} m</span>
        </div>
      )}

      {/* ─── Active Tool Helper Hint Pill ─── */}
      {activeTool !== 'none' && (
        <div style={{
          position: 'fixed',
          top: '78px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 80,
          padding: '6px 16px',
          borderRadius: '20px',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          backdropFilter: 'blur(16px)',
          color: '#38bdf8',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}>
          <span className="engine-pulse-dot" style={{ backgroundColor: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
          {activeTool === 'measure' && (
            <span>{hasPendingPoint ? "Click second point on 3D terrain to complete measurement" : "Click anywhere on 3D terrain to place first point"}</span>
          )}
          {activeTool === 'crossSection' && (
            <span>{csStartPoint ? "Click second point across terrain to generate elevation profile graph" : "Click first point on terrain to begin cross-section slice"}</span>
          )}
          {activeTool === 'tag' && (
            <span>Click any location on 3D terrain to drop an inspection marker / defect ticket</span>
          )}
        </div>
      )}

      {/* ─── Floating Minimalist Navigation Legend HUD (Bottom Right) ─── */}
      <footer className="engine-hud-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <MousePointer style={{ width: 12, height: 12, color: '#38bdf8' }} />
          <span><strong>Left Drag:</strong> Orbit</span>
        </div>
        <span className="engine-hud-footer-dot">•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Move style={{ width: 12, height: 12, color: '#38bdf8' }} />
          <span><strong>Right Drag:</strong> Pan</span>
        </div>
        <span className="engine-hud-footer-dot">•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ZoomIn style={{ width: 12, height: 12, color: '#38bdf8' }} />
          <span><strong>Scroll:</strong> Zoom</span>
        </div>
      </footer>

    </div>
  );
}
