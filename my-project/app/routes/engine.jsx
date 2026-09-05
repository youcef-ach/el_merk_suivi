import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import * as THREE from 'three';
import IndustrialTourViewer from '../components/IndustrialTourViewer';
import DroneSurveyViewer from '../components/DroneSurveyViewer';
import MeasurementHUD from '../components/MeasurementHUD';
import MeasurementsListPanel from '../components/MeasurementsListPanel';
import CrossSectionProfiler from '../components/CrossSectionProfiler';
import CrossSectionsListPanel from '../components/CrossSectionsListPanel';
import TagPanel from '../components/TagPanel';
import VolumeHUD from '../components/VolumeHUD';
import VolumeListPanel from '../components/VolumeListPanel';
import SurveyReportModal from '../components/SurveyReportModal';
import OrthoLayerDrawer from '../components/OrthoLayerDrawer';
import SatelliteBasemapDrawer from '../components/SatelliteBasemapDrawer';
import TimelineComparisonBar from '../components/TimelineComparisonBar';
import PointCloudDrawer from '../components/PointCloudDrawer';
import AreaPointersPanel from '../components/AreaPointersPanel';
import { useMeasurement } from '../hooks/useMeasurement';
import { useCrossSection } from '../hooks/useCrossSection';
import { useTags } from '../hooks/useTags';
import { useVolumeCalculation } from '../hooks/useVolumeCalculation';
import { useAreaPointers } from '../hooks/useAreaPointers';
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
  Layers, 
  Sparkles, 
  Boxes, 
  FileDown, 
  History, 
  Cpu, 
  Eye, 
  Building2, 
  Plane, 
  Grid, 
  ShieldAlert,
  Palette,
  Activity,
  MousePointer,
  Move,
  ZoomIn
} from 'lucide-react';
import './engine.css';
import { API_URL, MINIO_URL } from '../config/api';

export function meta() {
  return [{ title: "Digital Twin Engine | Industrial Tour & Drone GIS" }];
}

// Reusable singletons to eliminate garbage collection during hover raycasting
const _hoverRaycaster = new THREE.Raycaster();
_hoverRaycaster.firstHitOnly = true;
const _hoverMouse = new THREE.Vector2();

export default function EnginePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const viewerRef = useRef(null);
  const lastPointerMoveTimeRef = useRef(0);

  // Direct DOM refs for 60 FPS Telemetry HUD (Zero React Re-renders)
  const telemetryChipRef = useRef(null);
  const telemetryElevRef = useRef(null);
  const telemetryRelRef = useRef(null);
  const telemetrySlopeRef = useRef(null);
  const telemetryCoordsRef = useRef(null);

  const [inspectionData, setInspectionData] = useState(null);
  const [activePurpose, setActivePurpose] = useState('AUTO'); // 'AUTO' | 'VIRTUAL_TOUR' | 'DRONE_SURVEY'
  const [wireframe, setWireframe] = useState(false);
  const [sse, setSse] = useState(8);
  const [activeView, setActiveView] = useState('iso');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ─── Hypsometric Elevation Heatmap State (Dynamic Survey Range) ───
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.82);
  const [contourSpacing, setContourSpacing] = useState(0.5);
  const [minAsl, setMinAsl] = useState(0.0);
  const [maxAsl, setMaxAsl] = useState(10.0);

  // ─── Slope & Gradient Stability State ───
  const [slopeEnabled, setSlopeEnabled] = useState(false);
  const [slopeOpacity, setSlopeOpacity] = useState(0.85);
  const [slopeCriticalAngle, setSlopeCriticalAngle] = useState(35.0);
  const [slopeUnit, setSlopeUnit] = useState('deg');

  // ─── Survey Report PDF Generator Modal State ───
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // ─── 2D Orthomosaic Layer State ───
  const [isOrthoDrawerOpen, setIsOrthoDrawerOpen] = useState(false);
  const [orthoEnabled, setOrthoEnabled] = useState(false);
  const [orthoType, setOrthoType] = useState('dsm');
  const [orthoOpacity, setOrthoOpacity] = useState(0.85);
  const [orthoOffset, setOrthoOffset] = useState(0.05);

  const getOrthoUrl = useCallback((type) => {
    let raw = (type === 'dtm' ? inspectionData?.dtmUrl : inspectionData?.dsmUrl)
      || inspectionData?.orthoUrl;
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;
    return `${MINIO_URL}/virtual-inspections/${raw}`;
  }, [inspectionData]);

  // ─── 3D Satellite World Basemap State ───
  const [isBasemapDrawerOpen, setIsBasemapDrawerOpen] = useState(false);
  const [basemapEnabled, setBasemapEnabled] = useState(false);
  const [basemapOpacity, setBasemapOpacity] = useState(0.92);
  const [basemapElevation, setBasemapElevation] = useState(-0.01);
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

  // ─── Active Tool State: 'none' | 'measure' | 'crossSection' | 'volume' | 'tag' | 'pointers' ───
  const [activeTool, setActiveTool] = useState('none');

  // ─── Floor & Mode State for Virtual Tour ───
  const [activeFloor, setActiveFloor] = useState('all');
  const [tourMode, setTourMode] = useState('DOLLHOUSE'); // 'DOLLHOUSE' | 'FLOORPLAN' | 'INSIDE'

  // ─── Inspection Loading & Access Control State ───
  const [isLoadingInspection, setIsLoadingInspection] = useState(true);
  const [inspectionError, setInspectionError] = useState(null);

  // Fetch Inspection Details
  useEffect(() => {
    const fetchInspection = async () => {
      setIsLoadingInspection(true);
      setInspectionError(null);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        const res = await fetch(`${API_URL}/inspections/${id}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        // 401 Unauthorized or 403 Forbidden: Require login and preserve redirect destination
        if (res.status === 401 || res.status === 403) {
          const redirectParam = encodeURIComponent(window.location.pathname + window.location.search);
          navigate(`/auth?redirect=${redirectParam}`, { replace: true });
          return;
        }

        if (res.status === 404) {
          setInspectionError("Inspection not found or has been deleted.");
          setIsLoadingInspection(false);
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load inspection: ${res.status}`);
        }

        const data = await res.json();
        setInspectionData(data);
        const bounds = data?.orthoBounds;
        const gOffset = bounds?.groundAsl ?? bounds?.groundOffset ?? 0;
        let relMin = 0.0;
        let relMax = 6.2;
        if (bounds?.elevationRange) {
          relMin = bounds.elevationRange.min ?? 0.0;
          relMax = bounds.elevationRange.max ?? 6.2;
        } else if (bounds?.maxYRaw !== undefined && bounds?.minYRaw !== undefined) {
          const span = bounds.maxYRaw - bounds.minYRaw;
          relMin = 0.0;
          relMax = parseFloat(Math.min(span, 6.2).toFixed(1));
        }
        setMinAsl(parseFloat((gOffset + relMin).toFixed(2)));
        setMaxAsl(parseFloat((gOffset + relMax).toFixed(2)));
        setIsLoadingInspection(false);
      } catch (err) {
        console.error("Failed to fetch inspection details:", err);
        setInspectionError(err.message || "Failed to load inspection assets");
        setIsLoadingInspection(false);
      }
    };
    fetchInspection();
  }, [id, navigate]);

  // Close GIS Layers Dropdown on Click Outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (layersMenuRef.current && !layersMenuRef.current.contains(e.target)) {
        setIsLayersMenuOpen(false);
      }
    };
    if (isLayersMenuOpen) {
      document.addEventListener('pointerdown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [isLayersMenuOpen]);

  // Determine Effective Inspection Purpose
  const effectivePurpose = activePurpose === 'AUTO' 
    ? (inspectionData?.type === 'DRONE_SURVEY' || (inspectionData?.tilesetUrl && !inspectionData?.glbModelUrl) ? 'DRONE_SURVEY' : 'VIRTUAL_TOUR')
    : activePurpose;

  const isVirtualTour = effectivePurpose === 'VIRTUAL_TOUR';
  const isDroneSurvey = effectivePurpose === 'DRONE_SURVEY';

  // ─── Hooks for Measurements, Tags, Volumes, and Pointers ───
  const {
    measurements,
    selectedMeasurementId,
    selectedMeasurement,
    selectMeasurement,
    hasPendingPoint,
    handleMeasurementClick,
    removeMeasurement,
    clearAllMeasurements,
    cancelPending,
  } = useMeasurement(viewerRef);

  // Stepper handlers for cycling between active measurements in HUD
  const handlePrevMeasurement = useCallback(() => {
    if (measurements.length <= 1) return;
    const currIdx = measurements.findIndex(m => m.id === selectedMeasurement?.id);
    if (currIdx > 0) {
      selectMeasurement(measurements[currIdx - 1].id);
    } else {
      selectMeasurement(measurements[measurements.length - 1].id);
    }
  }, [measurements, selectedMeasurement, selectMeasurement]);

  const handleNextMeasurement = useCallback(() => {
    if (measurements.length <= 1) return;
    const currIdx = measurements.findIndex(m => m.id === selectedMeasurement?.id);
    if (currIdx >= 0 && currIdx < measurements.length - 1) {
      selectMeasurement(measurements[currIdx + 1].id);
    } else {
      selectMeasurement(measurements[0].id);
    }
  }, [measurements, selectedMeasurement, selectMeasurement]);

  const {
    tags,
    selectedTag,
    selectedTagId,
    trySelectTag,
    handleTagClick,
    createTag,
    updateTag,
    addTagDocument,
    deleteTagDocument,
    deleteTag,
    selectTag,
    deselectTag,
  } = useTags(viewerRef, id);

  // Tag creation modal state (Title Prompt)
  const [titlePrompt, setTitlePrompt] = useState(null);
  const [promptTitle, setPromptTitle] = useState('');
  const [isSubmittingTag, setIsSubmittingTag] = useState(false);
  const isSubmittingTagRef = useRef(false);

  const onTagClickHandler = useCallback((hitPoint) => {
    setTitlePrompt({ position: hitPoint });
    setPromptTitle('');
  }, []);

  const confirmTagPlacement = useCallback(async () => {
    if (!titlePrompt || !promptTitle.trim() || isSubmittingTagRef.current) return;
    isSubmittingTagRef.current = true;
    setIsSubmittingTag(true);
    try {
      const placed = await createTag(promptTitle.trim(), titlePrompt.position);
      setTitlePrompt(null);
      setPromptTitle('');
      if (placed?.id) {
        selectTag(placed.id);
      }
    } finally {
      isSubmittingTagRef.current = false;
      setIsSubmittingTag(false);
    }
  }, [titlePrompt, promptTitle, createTag, selectTag]);

  const cancelTagPlacement = useCallback(() => {
    setTitlePrompt(null);
    setPromptTitle('');
  }, []);

  const handleDeleteTag = useCallback(async (tagId) => {
    await deleteTag(tagId);
  }, [deleteTag]);

  // ─── Multi-Stockpile Volumetric Cut / Fill Hook ───
  const {
    stockpiles,
    selectedStockpileId,
    selectedStockpile,
    volumeResult,
    accumulatedTotals,
    accumulatedStockpileIds,
    toggleAccumulateStockpile,
    polygonPoints,
    isDrawing: isVolumeDrawing,
    isCalculating: isVolumeCalculating,
    baseMethod: volumeBaseMethod,
    customBaseAsl: volumeCustomBaseAsl,
    density: volumeDensity,
    handleVolumeClick,
    completePolygon: handleCompleteVolume,
    startNewStockpile,
    selectStockpile,
    deleteStockpile,
    clearAllStockpiles,
    clearVolume,
    handleBaseMethodChange,
    handleCustomBaseAslChange,
    handleDensityChange: handleVolumeDensityChange,
    updateStockpileVertexPosition,
    commitStockpileVertexChange
  } = useVolumeCalculation(viewerRef);

  // Stepper handlers for cycling between active stockpiles in HUD
  const handlePrevStockpile = useCallback(() => {
    if (stockpiles.length <= 1) return;
    const currIdx = stockpiles.findIndex(s => s.id === selectedStockpile?.id);
    if (currIdx > 0) {
      selectStockpile(stockpiles[currIdx - 1].id);
    } else {
      selectStockpile(stockpiles[stockpiles.length - 1].id);
    }
  }, [stockpiles, selectedStockpile, selectStockpile]);

  const handleNextStockpile = useCallback(() => {
    if (stockpiles.length <= 1) return;
    const currIdx = stockpiles.findIndex(s => s.id === selectedStockpile?.id);
    if (currIdx >= 0 && currIdx < stockpiles.length - 1) {
      selectStockpile(stockpiles[currIdx + 1].id);
    } else {
      selectStockpile(stockpiles[0].id);
    }
  }, [stockpiles, selectedStockpile, selectStockpile]);

  // ─── Multi-Slice Topographic Cross-Section Hook ───
  const {
    crossSections,
    selectedSectionId,
    selectedSection,
    pendingPoints: crossSectionPendingPoints,
    isDrawing: isCrossSectionDrawing,
    handleCrossSectionClick,
    startNewSlice: startNewCrossSectionSlice,
    selectSection: selectCrossSection,
    deleteSection: deleteCrossSection,
    clearAllSections: clearAllCrossSections,
    cancelPending: cancelPendingCrossSection,
    setHoveredSample: setCrossSectionHoveredSample,
  } = useCrossSection(viewerRef);

  // Stepper handlers for cycling between active cross-sections in HUD
  const handlePrevSection = useCallback(() => {
    if (crossSections.length <= 1) return;
    const currIdx = crossSections.findIndex(s => s.id === selectedSection?.id);
    if (currIdx > 0) {
      selectCrossSection(crossSections[currIdx - 1].id);
    } else {
      selectCrossSection(crossSections[crossSections.length - 1].id);
    }
  }, [crossSections, selectedSection, selectCrossSection]);

  const handleNextSection = useCallback(() => {
    if (crossSections.length <= 1) return;
    const currIdx = crossSections.findIndex(s => s.id === selectedSection?.id);
    if (currIdx >= 0 && currIdx < crossSections.length - 1) {
      selectCrossSection(crossSections[currIdx + 1].id);
    } else {
      selectCrossSection(crossSections[0].id);
    }
  }, [crossSections, selectedSection, selectCrossSection]);

  // Keyboard shortcut listener: ESC cancels pending actions, Delete removes selected items
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable) return;
      if (e.key === 'Escape') {
        if (hasPendingPoint) {
          cancelPending();
        }
        if (crossSectionPendingPoints.length > 0) {
          cancelPendingCrossSection();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeTool === 'measure' && selectedMeasurement) {
          removeMeasurement(selectedMeasurement.id);
        } else if (activeTool === 'crossSection' && selectedSection) {
          deleteCrossSection(selectedSection.id);
        } else if (activeTool === 'volume' && selectedStockpile) {
          deleteStockpile(selectedStockpile.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    hasPendingPoint, cancelPending, activeTool, selectedMeasurement, removeMeasurement,
    crossSectionPendingPoints, cancelPendingCrossSection, selectedSection, deleteCrossSection,
    selectedStockpile, deleteStockpile
  ]);

  const {
    pointers,
    activePointer,
    isPointersPanelOpen,
    handlePointerClick,
    handlePointerSelect,
    handlePointerDragStart,
    handlePointerDragMove,
    handlePointerDragEnd,
    handleCreatePointer,
    handleUpdatePointer,
    handleDeletePointer,
    closePointersPanel
  } = useAreaPointers(viewerRef, id);

  // Georeferenced GPS coordinate updates from 3D Tileset
  const handleGeoCoordinates = useCallback((geo) => {
    if (geo?.lat && geo?.lon) {
      setCoordinates(prev => {
        if (Math.abs(prev.lat - geo.lat) < 0.0001 && Math.abs(prev.lon - geo.lon) < 0.0001) {
          return prev;
        }
        return { lat: geo.lat, lon: geo.lon };
      });
    }
  }, []);

  // Toggle Tools
  const toggleTool = (toolName) => {
    setActiveTool(prev => (prev === toolName ? 'none' : toolName));
  };

  // Fullscreen Handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Drone View Controls
  const handleTopView = () => {
    setActiveView('top');
    viewerRef.current?.setTopView?.();
  };

  const handleIsoView = () => {
    setActiveView('iso');
    viewerRef.current?.setIsoView?.();
  };

  // Virtual Tour View Controls
  const handleDollhouse = () => {
    setTourMode('DOLLHOUSE');
    viewerRef.current?.handleDollhouseView?.();
  };

  const handleFloorplan = () => {
    setTourMode('FLOORPLAN');
    viewerRef.current?.handleFloorPlanView?.();
  };

  const handleToggleMesh = () => {
    viewerRef.current?.handleToggleMeshView?.();
  };

  // Helper to get true ground datum offset (0.00m reference)
  const getDatumOffset = useCallback(() => {
    return viewerRef.current?.datumInfo?.groundAsl 
      ?? viewerRef.current?.datumInfo?.groundOffset 
      ?? inspectionData?.orthoBounds?.groundAsl 
      ?? inspectionData?.orthoBounds?.groundOffset 
      ?? 0;
  }, [inspectionData]);

  // Drone GIS Layer Toggles
  const toggleHeatmap = () => {
    const next = !heatmapEnabled;
    setHeatmapEnabled(next);
    const dOffset = getDatumOffset();
    viewerRef.current?.tilesetEngine?.setHeatmapMode?.(next, {
      minElev: minAsl - dOffset,
      maxElev: maxAsl - dOffset,
      opacity: heatmapOpacity,
      contourSpacing: contourSpacing
    });
  };

  const toggleSlope = () => {
    const next = !slopeEnabled;
    setSlopeEnabled(next);
    viewerRef.current?.tilesetEngine?.setSlopeMode?.(next, {
      criticalAngle: slopeCriticalAngle,
      opacity: slopeOpacity
    });
  };

  const handleMinAslChange = (val) => {
    const num = parseFloat(val) || 0;
    setMinAsl(num);
    const dOffset = getDatumOffset();
    const localMinY = num - dOffset;
    const localMaxY = maxAsl - dOffset;
    viewerRef.current?.tilesetEngine?.setHeatmapRange?.(localMinY, localMaxY);
  };

  const handleMaxAslChange = (val) => {
    const num = parseFloat(val) || 0;
    setMaxAsl(num);
    const dOffset = getDatumOffset();
    const localMinY = minAsl - dOffset;
    const localMaxY = num - dOffset;
    viewerRef.current?.tilesetEngine?.setHeatmapRange?.(localMinY, localMaxY);
  };

  const handleHeatmapOpacityChange = (val) => {
    const num = parseFloat(val);
    setHeatmapOpacity(num);
    viewerRef.current?.tilesetEngine?.setHeatmapOpacity?.(num);
  };

  const handleContourSpacingChange = (val) => {
    const num = parseFloat(val);
    setContourSpacing(num);
    viewerRef.current?.tilesetEngine?.setContourSpacing?.(num);
    viewerRef.current?.tilesetEngine?.setContourEnabled?.(num > 0);
  };

  const handleResetRange = () => {
    const dOffset = getDatumOffset();
    const bounds = inspectionData?.orthoBounds;
    let relMin = 0.0;
    let relMax = 6.2;
    if (bounds?.elevationRange) {
      relMin = bounds.elevationRange.min ?? 0.0;
      relMax = bounds.elevationRange.max ?? 6.2;
    } else if (bounds?.maxYRaw !== undefined && bounds?.minYRaw !== undefined) {
      const span = bounds.maxYRaw - bounds.minYRaw;
      relMin = 0.0;
      relMax = parseFloat(Math.min(span, 6.2).toFixed(1));
    }
    const defaultMin = parseFloat((dOffset + relMin).toFixed(2));
    const defaultMax = parseFloat((dOffset + relMax).toFixed(2));
    setMinAsl(defaultMin);
    setMaxAsl(defaultMax);
    viewerRef.current?.tilesetEngine?.setHeatmapRange?.(relMin, relMax);
  };

  const handleSlopeCriticalAngleChange = (val) => {
    const num = parseFloat(val);
    setSlopeCriticalAngle(num);
    viewerRef.current?.tilesetEngine?.setSlopeCriticalAngle?.(num);
  };

  const handleSlopeOpacityChange = (val) => {
    const num = parseFloat(val);
    setSlopeOpacity(num);
    viewerRef.current?.tilesetEngine?.setSlopeOpacity?.(num);
  };

  // 3D Satellite Basemap Toggle
  const toggleBasemap = () => {
    const next = !basemapEnabled;
    setBasemapEnabled(next);
    const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
    layer?.setVisible?.(next);
  };

  // Live Cursor Elevation & Slope Raycasting (Optimized, 0 React Re-renders, Orbit-Safe)
  const handlePointerMove = useCallback((e) => {
    // 1. NEVER raycast while clicking, dragging, orbiting or panning!
    if (e.buttons !== 0) {
      if (telemetryChipRef.current && telemetryChipRef.current.style.display !== 'none') {
        telemetryChipRef.current.style.display = 'none';
      }
      return;
    }

    // 2. Throttle to ~12.5 FPS (80ms)
    const now = performance.now();
    if (now - lastPointerMoveTimeRef.current < 80) return;
    lastPointerMoveTimeRef.current = now;

    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    if (!renderer || !camera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    _hoverMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _hoverMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    _hoverRaycaster.setFromCamera(_hoverMouse, camera);
    _hoverRaycaster.firstHitOnly = true;

    const intersects = [];
    const tilesEngine = viewerRef.current?.tilesetEngine || viewerRef.current?.tilesetEngineRef?.current;
    if (tilesEngine?.raycast) {
      tilesEngine.raycast(_hoverRaycaster, intersects);
    } else if (tilesEngine?.getGroup?.()) {
      _hoverRaycaster.intersectObject(tilesEngine.getGroup(), true, intersects);
    } else if (viewerRef.current?.modelRef?.current) {
      _hoverRaycaster.intersectObject(viewerRef.current.modelRef.current, true, intersects);
    }

    if (intersects.length > 0) {
      const hit = intersects[0];
      const p = hit.point;
      const datumInfo = viewerRef.current?.datumInfo;
      const refY = datumInfo?.surfaceCenterPoint?.y ?? viewerRef.current?.tilesetEngine?.getSurfaceCenterPoint?.()?.y ?? 0;
      const relElev = p.y - refY;
      const datumOffset = getDatumOffset();
      const aslElev = relElev + datumOffset;

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

      // Fast Direct DOM Update (Zero Component Re-renders, 60 FPS)
      if (telemetryChipRef.current) {
        telemetryChipRef.current.style.display = 'flex';
        if (telemetryElevRef.current) {
          telemetryElevRef.current.textContent = `${aslElev.toFixed(2)} m ASL`;
        }
        if (telemetryRelRef.current) {
          telemetryRelRef.current.textContent = `(${relElev >= 0 ? '+' : ''}${relElev.toFixed(2)} m)`;
        }
        if (telemetrySlopeRef.current) {
          const isHazard = slopeDeg >= slopeCriticalAngle;
          telemetrySlopeRef.current.style.color = isHazard ? '#f87171' : '#34d399';
          telemetrySlopeRef.current.textContent = slopeUnit === 'deg' ? `${slopeDeg.toFixed(1)}°` : `${slopePct.toFixed(1)}%`;
        }
        if (telemetryCoordsRef.current) {
          telemetryCoordsRef.current.textContent = `X: ${p.x.toFixed(2)} m | Z: ${p.z.toFixed(2)} m`;
        }
      }
    } else {
      if (telemetryChipRef.current && telemetryChipRef.current.style.display !== 'none') {
        telemetryChipRef.current.style.display = 'none';
      }
    }
  }, [slopeCriticalAngle, slopeUnit, getDatumOffset]);

  const handlePointerLeave = useCallback(() => {
    if (telemetryChipRef.current) {
      telemetryChipRef.current.style.display = 'none';
    }
  }, []);

  const togglePointCloud = () => {
    const next = !pointCloudActive;
    setPointCloudActive(next);
    viewerRef.current?.tilesetEngine?.setPointCloudMode?.(next);
    if (next && viewerRef.current?.tilesetEngine?.getLoadedPointsCount) {
      setTotalPointsCount(viewerRef.current.tilesetEngine.getLoadedPointsCount());
    }
  };

  const toggleWireframe = () => {
    const next = !wireframe;
    setWireframe(next);
    if (viewerRef.current?.tilesetEngine?.setWireframe) {
      viewerRef.current.tilesetEngine.setWireframe(next);
    }
    if (viewerRef.current?.modelRef?.current) {
      viewerRef.current.modelRef.current.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => m.wireframe = next);
        }
      });
    }
  };

  const activeLayersCount = (heatmapEnabled ? 1 : 0) + (slopeEnabled ? 1 : 0) + (pointCloudActive ? 1 : 0) + (orthoEnabled ? 1 : 0) + (basemapEnabled ? 1 : 0);

  return (
    <div 
      className="engine-container" 
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}
    >
      
      {/* ─── VIRTUAL TOUR FLOATING UI (Main Branch Style) ─── */}
      {isVirtualTour && (
        <>
          {/* Top-Left Floating Back Button & Inspection Title */}
          <div style={{
            position: 'absolute',
            top: 20,
            left: 20,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <button 
              onClick={() => navigate(inspectionData?.projectId ? `/projects/${inspectionData.projectId}` : '/dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '10px 18px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.95)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)'}
            >
              <ArrowLeft style={{ width: 15, height: 15 }} />
              <span>Dashboard</span>
            </button>

            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                {inspectionData?.title || 'Industrial Virtual Tour'}
              </span>
              <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                360° Walkthrough
              </span>
              {inspectionData?.createdAt && (
                <span style={{ fontSize: '11px', color: '#94a3b8', borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '8px' }}>
                  {new Date(inspectionData.createdAt).toLocaleDateString()} {new Date(inspectionData.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>

          {/* Top-Right Floating Floor Selector & View Toggle */}
          <div style={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            {/* Floor Plan / Dollhouse Toggle */}
            <button 
              onClick={() => {
                if (tourMode === 'FLOORPLAN') {
                  handleDollhouse();
                } else {
                  handleFloorplan();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '10px 18px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.95)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)'}
            >
              {tourMode === 'FLOORPLAN' ? (
                <>
                  <Box style={{ width: 16, height: 16, color: '#38bdf8' }} />
                  <span>Dollhouse View</span>
                </>
              ) : (
                <>
                  <Grid style={{ width: 16, height: 16, color: '#38bdf8' }} />
                  <span>Floor Plan View</span>
                </>
              )}
            </button>

            {/* Floor Selector (Multi-Floor Support) */}
            <div style={{
              display: 'flex',
              background: 'rgba(15, 23, 42, 0.8)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              padding: '3px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
            }}>
              <button
                onClick={() => setActiveFloor('all')}
                style={{
                  background: activeFloor === 'all' ? '#0284c7' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  padding: '7px 12px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: activeFloor === 'all' ? 700 : 500,
                  transition: 'all 0.2s'
                }}
              >
                All
              </button>
              <button
                onClick={() => setActiveFloor(1)}
                style={{
                  background: activeFloor === 1 ? '#0284c7' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  padding: '7px 12px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: activeFloor === 1 ? 700 : 500,
                  transition: 'all 0.2s'
                }}
              >
                Upper
              </button>
              <button
                onClick={() => setActiveFloor(0)}
                style={{
                  background: activeFloor === 0 ? '#0284c7' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  padding: '7px 12px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: activeFloor === 0 ? 700 : 500,
                  transition: 'all 0.2s'
                }}
              >
                Ground
              </button>
            </div>

            {/* Fullscreen Button */}
            <button 
              onClick={toggleFullscreen}
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
              }}
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 style={{ width: 16, height: 16 }} /> : <Maximize2 style={{ width: 16, height: 16 }} />}
            </button>
          </div>

          {/* Left-Side Floating Vertical Action Dock */}
          <div style={{
            position: 'absolute',
            left: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '10px',
            borderRadius: '16px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)'
          }}>
            {/* 3D Measurement Ruler */}
            <button
              onClick={() => toggleTool('measure')}
              style={{
                background: activeTool === 'measure' ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(14, 165, 233, 0.3))' : 'transparent',
                borderColor: activeTool === 'measure' ? '#38bdf8' : 'transparent',
                color: activeTool === 'measure' ? '#38bdf8' : '#cbd5e1',
                border: '1px solid',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.2s'
              }}
              title="Point-to-point 3D Distance Measurement"
            >
              <Ruler style={{ width: 18, height: 18 }} />
              {measurements?.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  background: '#0284c7',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {measurements.length}
                </span>
              )}
            </button>

            {/* Equipment Inspection Tags */}
            <button
              onClick={() => toggleTool('tag')}
              style={{
                background: activeTool === 'tag' ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(129, 140, 248, 0.3))' : 'transparent',
                borderColor: activeTool === 'tag' ? '#818cf8' : 'transparent',
                color: activeTool === 'tag' ? '#818cf8' : '#cbd5e1',
                border: '1px solid',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.2s'
              }}
              title="Equipment Inspection Tags & PDF Manuals"
            >
              <MapPin style={{ width: 18, height: 18 }} />
              {tags?.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  background: '#6366f1',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {tags.length}
                </span>
              )}
            </button>

            {/* Machinery / Safety Area Pointers */}
            <button
              onClick={() => toggleTool('pointers')}
              style={{
                background: activeTool === 'pointers' ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(251, 191, 36, 0.3))' : 'transparent',
                borderColor: activeTool === 'pointers' ? '#fbbf24' : 'transparent',
                color: activeTool === 'pointers' ? '#fbbf24' : '#cbd5e1',
                border: '1px solid',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.2s'
              }}
              title="Demarcate Safety Boundaries & Machinery Cells"
            >
              <ShieldAlert style={{ width: 18, height: 18 }} />
              {pointers?.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  background: '#f59e0b',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {pointers.length}
                </span>
              )}
            </button>

            <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.1)', margin: '2px 0' }} />

            {/* Virtual Staging Studio Link */}
            <Link
              to={`/studio/${id}`}
              style={{
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(192, 132, 252, 0.25))',
                borderColor: 'rgba(192, 132, 252, 0.4)',
                color: '#c084fc',
                border: '1px solid',
                padding: '10px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Open Virtual Staging Studio"
            >
              <Palette style={{ width: 18, height: 18 }} />
            </Link>
          </div>
        </>
      )}

      {/* ─── DRONE PHOTOGRAMMETRY GIS HEADER (Only in Drone Mode) ─── */}
      {/* ─── DRONE PHOTOGRAMMETRY GIS WORKSTATION HUD (Decoupled 3-Cluster UI) ─── */}
      {isDroneSurvey && (
        <>
          {/* 1. Top-Left: Navigation, Inspection Title & Drone Survey Badge */}
          <div className="engine-top-left">
            <button 
              onClick={() => navigate(inspectionData?.projectId ? `/projects/${inspectionData.projectId}` : '/projects')} 
              className="engine-btn-icon-text"
              title="Return to Project Inspections"
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              <span>Back</span>
            </button>

            <div className="engine-divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="engine-title" title={inspectionData?.title || 'Inspection Digital Twin'}>
                  {inspectionData?.title || 'Inspection Digital Twin'}
                </span>
                <span className="engine-badge badge-drone">
                  🛰️ Drone Survey
                </span>
              </div>
              {inspectionData?.droneModel && (
                <span style={{ fontSize: 10.5, color: '#94a3b8', letterSpacing: '0.01em' }}>
                  {inspectionData.droneModel} • GSD {inspectionData.gsd || 1.5} cm/px
                </span>
              )}
            </div>
          </div>

          {/* 2. Top-Center: Dedicated GIS Workstation Toolbar Island */}
          <nav className="engine-top-toolbar">
            {/* View Camera Mode Switcher (Segmented Control) */}
            <div className="engine-view-toggle">
              <button 
                onClick={handleTopView}
                className={`engine-btn-compact ${activeView === 'top' ? 'active' : ''}`}
                title="Top-Down Ortho GIS View (2D Nadir)"
              >
                <Map style={{ width: 13, height: 13 }} />
                <span>Top 2D</span>
              </button>
              <button 
                onClick={handleIsoView}
                className={`engine-btn-compact ${activeView === 'iso' ? 'active' : ''}`}
                title="Isometric 3D Perspective"
              >
                <Compass style={{ width: 13, height: 13 }} />
                <span>Iso 3D</span>
              </button>
            </div>

            <div className="engine-divider" />

            {/* 1. 3D Distance Ruler */}
            <button 
              onClick={() => toggleTool('measure')}
              className={`engine-btn ${activeTool === 'measure' ? 'engine-btn-cyan' : ''}`}
              title="Measure 3D Distance, Height Difference and Slope"
            >
              <Ruler style={{ width: 14, height: 14 }} />
              <span>Ruler 3D</span>
              {measurements?.length > 0 && (
                <span className="engine-active-count-badge">{measurements.length}</span>
              )}
            </button>

            {/* 2. Elevation Cross-Section Profiler */}
            <button 
              onClick={() => toggleTool('crossSection')}
              className={`engine-btn ${activeTool === 'crossSection' ? 'engine-btn-indigo' : ''}`}
              title="Interactive Elevation Cross-Section Topographic Profiler"
            >
              <TrendingUp style={{ width: 14, height: 14 }} />
              <span>Cross-Section</span>
              {crossSections?.length > 0 && (
                <span className="engine-active-count-badge">{crossSections.length}</span>
              )}
            </button>

            {/* 3. Volumetric Cut/Fill Calculator */}
            <button 
              onClick={() => toggleTool('volume')}
              className={`engine-btn ${activeTool === 'volume' ? 'engine-btn-amber' : ''}`}
              title="Volumetric Earthwork & Stockpile Calculator"
            >
              <Boxes style={{ width: 14, height: 14 }} />
              <span>Cut / Fill</span>
              {stockpiles?.length > 0 && (
                <span className="engine-active-count-badge">{stockpiles.length}</span>
              )}
            </button>

            {/* 4. Equipment & Inspection Tags */}
            <button 
              onClick={() => toggleTool('tag')}
              className={`engine-btn ${activeTool === 'tag' ? 'engine-btn-cyan' : ''}`}
              title="Equipment Inspection Tags & PDF Manuals"
            >
              <MapPin style={{ width: 14, height: 14 }} />
              <span>Tags</span>
              {tags?.length > 0 && (
                <span className="engine-active-count-badge">{tags.length}</span>
              )}
            </button>

            <div className="engine-divider" />

            {/* 4. GIS Layers & Visual Overlays Menu */}
            <div className="engine-dropdown-container" ref={layersMenuRef}>
              <button 
                onClick={() => setIsLayersMenuOpen(!isLayersMenuOpen)}
                className={`engine-btn ${activeLayersCount > 0 ? 'engine-btn-emerald' : ''}`}
                title="GIS Surface Overlays (Heatmap, Slope, Ortho, Satellite, Point Cloud)"
              >
                <Layers style={{ width: 14, height: 14 }} />
                <span>GIS Layers</span>
                {activeLayersCount > 0 && (
                  <span className="engine-active-count-badge">{activeLayersCount}</span>
                )}
                <ChevronDown style={{ width: 12, height: 12, transition: 'transform 0.2s', transform: isLayersMenuOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {/* GIS Layers Dropdown Popover */}
              {isLayersMenuOpen && (
                <div className="engine-dropdown-menu-popover">
                  <div className="engine-dropdown-header">GIS TOPOGRAPHY & LAYERS</div>
                  
                  {/* Hypsometric Elevation Heatmap */}
                  <button 
                    onClick={toggleHeatmap}
                    className={`engine-dropdown-item ${heatmapEnabled ? 'active' : ''}`}
                  >
                    <Sparkles style={{ width: 14, height: 14, color: '#f59e0b' }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Hypsometric Heatmap</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Elevation color gradients & contours</div>
                    </div>
                    <span className={`engine-switch-dot ${heatmapEnabled ? 'on' : ''}`} />
                  </button>

                  {/* Slope Stability */}
                  <button 
                    onClick={toggleSlope}
                    className={`engine-dropdown-item ${slopeEnabled ? 'active' : ''}`}
                  >
                    <TrendingUp style={{ width: 14, height: 14, color: '#ef4444' }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Slope & Gradient Stability</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Hazard steepness detection</div>
                    </div>
                    <span className={`engine-switch-dot ${slopeEnabled ? 'on' : ''}`} />
                  </button>

                  {/* Point Cloud LIDAR (temporarily disabled) */}
                  {/*
                  <button 
                    onClick={() => { setIsPointCloudDrawerOpen(true); setIsLayersMenuOpen(false); }}
                    className={`engine-dropdown-item ${pointCloudActive ? 'active' : ''}`}
                  >
                    <Cpu style={{ width: 14, height: 14, color: '#818cf8' }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Point Cloud LIDAR</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Raw LAS/LAZ point rendering</div>
                    </div>
                    <span className={`engine-switch-dot ${pointCloudActive ? 'on' : ''}`} />
                  </button>
                  */}

                  {/* 2D Orthomosaic & DTM (temporarily disabled) */}
                  {/*
                  <button 
                    onClick={() => { setIsOrthoDrawerOpen(true); setIsLayersMenuOpen(false); }}
                    className={`engine-dropdown-item ${orthoEnabled ? 'active' : ''}`}
                  >
                    <Map style={{ width: 14, height: 14, color: '#38bdf8' }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>2D Orthomosaic & DTM</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Aerial photogrammetry projection</div>
                    </div>
                    <span className={`engine-switch-dot ${orthoEnabled ? 'on' : ''}`} />
                  </button>
                  */}

                  {/* 3D Satellite Basemap */}
                  <button 
                    onClick={() => { 
                      toggleBasemap();
                      setIsBasemapDrawerOpen(true); 
                      setIsLayersMenuOpen(false); 
                    }}
                    className={`engine-dropdown-item ${basemapEnabled ? 'active' : ''}`}
                  >
                    <Globe2 style={{ width: 14, height: 14, color: '#10b981' }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Satellite World Basemap</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Global satellite reference plane</div>
                    </div>
                    <span className={`engine-switch-dot ${basemapEnabled ? 'on' : ''}`} />
                  </button>
                </div>
              )}
            </div>
          </nav>

          {/* 3. Top-Right: Export Dossier & Fullscreen */}
          <div className="engine-top-right">
            <button 
              onClick={() => setIsReportModalOpen(true)}
              className="engine-btn engine-btn-export"
              title="Export Professional PDF Survey Dossier"
            >
              <FileDown style={{ width: 14, height: 14 }} />
              <span>Export Report</span>
            </button>

            <button 
              onClick={toggleFullscreen}
              className="engine-btn engine-btn-icon"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? <Minimize2 style={{ width: 14, height: 14 }} /> : <Maximize2 style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </>
      )}

      {/* ─── 3D Viewport: Render the Dedicated Viewer (Zero-Lag Pointer Move on Viewport Only) ─── */}
      <main 
        className="engine-viewport-wrapper"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {isLoadingInspection ? (
          <div className="engine-auth-loading-overlay">
            <div className="engine-auth-loading-spinner" />
            <div className="engine-auth-loading-text">
              <span className="engine-auth-loading-title">Loading Digital Twin Engine</span>
              <span className="engine-auth-loading-sub">Verifying enterprise credentials and synchronizing telemetry...</span>
            </div>
          </div>
        ) : inspectionError ? (
          <div className="engine-auth-loading-overlay">
            <div className="engine-auth-error-card">
              <ShieldAlert style={{ width: 36, height: 36, color: '#f87171' }} />
              <h2 style={{ fontSize: 18, color: '#f8fafc', margin: '12px 0 6px 0' }}>Access Restricted</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 16px 0', lineHeight: 1.5 }}>{inspectionError}</p>
              <Link to="/projects" className="engine-auth-back-btn">
                <ArrowLeft style={{ width: 14, height: 14 }} /> Return to Projects
              </Link>
            </div>
          </div>
        ) : isVirtualTour ? (
          <IndustrialTourViewer 
            ref={viewerRef}
            tourId={id}
            measurementMode={activeTool === 'measure'}
            onMeasurementClick={handleMeasurementClick}
            onSelectMeasurement={selectMeasurement}
            tagMode={activeTool === 'tag'}
            onTagClick={onTagClickHandler}
            onTagSelect={selectTag}
            pointersMode={activeTool === 'pointers'}
            onPointerClick={handlePointerClick}
            onPointerSelect={handlePointerSelect}
            onPointerDragStart={handlePointerDragStart}
            onPointerDragMove={handlePointerDragMove}
            onPointerDragEnd={handlePointerDragEnd}
            activeFloor={activeFloor}
          />
        ) : (
          <DroneSurveyViewer 
            ref={viewerRef}
            tourId={id}
            onGeoCoordinates={handleGeoCoordinates}
            measurementMode={activeTool === 'measure'}
            onMeasurementClick={handleMeasurementClick}
            onSelectMeasurement={selectMeasurement}
            volumeMode={activeTool === 'volume'}
            onVolumeClick={handleVolumeClick}
            onSelectStockpile={selectStockpile}
            onUpdateStockpileVertex={updateStockpileVertexPosition}
            onCommitStockpileVertex={commitStockpileVertexChange}
            crossSectionMode={activeTool === 'crossSection'}
            onCrossSectionClick={handleCrossSectionClick}
            onSelectSection={selectCrossSection}
            tagMode={activeTool === 'tag'}
            onTagClick={onTagClickHandler}
            onSelectTag={selectTag}
          />
        )}

        {/* ─── Measurement HUD (Both Modes) ─── */}
        {activeTool === 'measure' && selectedMeasurement && (
          <MeasurementHUD 
            measurementData={selectedMeasurement}
            measurementIndex={measurements.findIndex(m => m.id === selectedMeasurement.id) + 1}
            totalMeasurements={measurements.length}
            onPrev={handlePrevMeasurement}
            onNext={handleNextMeasurement}
            onDelete={() => removeMeasurement(selectedMeasurement.id)}
            onClose={() => setActiveTool('none')}
            inspectionId={id}
          />
        )}

        {/* ─── Measurements List Panel (Both Modes) ─── */}
        {activeTool === 'measure' && (
          <MeasurementsListPanel 
            measurements={measurements}
            selectedMeasurementId={selectedMeasurement?.id}
            onSelectMeasurement={(id) => {
              selectMeasurement(id);
            }}
            onDeleteMeasurement={removeMeasurement}
            onClearAll={clearAllMeasurements}
            hasPendingPoint={hasPendingPoint}
            onCancelPending={cancelPending}
            isOpen={true}
            onClose={() => setActiveTool('none')}
          />
        )}

        {/* ─── Cross-Sections List Panel (Drone GIS) ─── */}
        {isDroneSurvey && activeTool === 'crossSection' && (
          <CrossSectionsListPanel 
            crossSections={crossSections}
            selectedSectionId={selectedSection?.id}
            onSelectSection={(secId) => {
              selectCrossSection(secId);
            }}
            onDeleteSection={deleteCrossSection}
            onClearAll={clearAllCrossSections}
            onNewSlice={startNewCrossSectionSlice}
            pendingPoints={crossSectionPendingPoints}
            onCancelPending={cancelPendingCrossSection}
            isOpen={true}
            onClose={() => setActiveTool('none')}
          />
        )}

        {/* ─── Cross-Section Elevation Profiler (Drone GIS) ─── */}
        {isDroneSurvey && activeTool === 'crossSection' && selectedSection && (
          <CrossSectionProfiler 
            profileData={selectedSection?.profile ? { ...selectedSection.profile, name: selectedSection.name } : null}
            sectionIndex={crossSections.findIndex(s => s.id === selectedSection.id) + 1}
            totalSections={crossSections.length}
            onPrev={handlePrevSection}
            onNext={handleNextSection}
            onNewSlice={startNewCrossSectionSlice}
            onDelete={() => deleteCrossSection(selectedSection.id)}
            onHoverPoint={setCrossSectionHoveredSample}
            onClose={() => setActiveTool('none')}
            onSave={async (sectionData) => {
              try {
                const token = localStorage.getItem('access_token');
                await fetch(`${API_URL}/inspections/${id}/cross-sections`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  body: JSON.stringify(sectionData)
                });
              } catch (err) {
                console.error('Failed to save cross section:', err);
              }
            }}
            inspectionId={id}
          />
        )}

        {/* ─── Volumetric Cut/Fill Calculator HUD (Drone GIS) ─── */}
        {isDroneSurvey && activeTool === 'volume' && (
          <VolumeHUD 
            polygonPoints={polygonPoints}
            isDrawing={isVolumeDrawing}
            volumeResult={volumeResult}
            stockpileIndex={selectedStockpile ? stockpiles.findIndex(s => s.id === selectedStockpile.id) + 1 : 0}
            totalStockpiles={stockpiles.length}
            onPrev={handlePrevStockpile}
            onNext={handleNextStockpile}
            onDelete={() => selectedStockpile && deleteStockpile(selectedStockpile.id)}
            onNewStockpile={startNewStockpile}
            isCalculating={isVolumeCalculating}
            baseMethod={volumeBaseMethod}
            customBaseAsl={volumeCustomBaseAsl}
            density={volumeDensity}
            onComplete={handleCompleteVolume}
            onClear={clearVolume}
            onBaseMethodChange={handleBaseMethodChange}
            onCustomBaseAslChange={handleCustomBaseAslChange}
            onDensityChange={handleVolumeDensityChange}
            isVisible={true}
            onClose={() => setActiveTool('none')}
            inspectionId={id}
          />
        )}

        {/* ─── Stockpile & Volumes List Panel (Drone GIS) ─── */}
        {isDroneSurvey && activeTool === 'volume' && (
          <VolumeListPanel 
            stockpiles={stockpiles}
            selectedStockpileId={selectedStockpile?.id}
            onSelectStockpile={(stId) => {
              selectStockpile(stId);
            }}
            onDeleteStockpile={deleteStockpile}
            onClearAll={clearAllStockpiles}
            onNewStockpile={startNewStockpile}
            isDrawing={isVolumeDrawing}
            accumulatedTotals={accumulatedTotals}
            accumulatedStockpileIds={accumulatedStockpileIds}
            onToggleAccumulate={toggleAccumulateStockpile}
            isOpen={true}
            onClose={() => setActiveTool('none')}
          />
        )}

        {/* ─── Tag Mode Active Guidance Chip ─── */}
        {activeTool === 'tag' && !selectedTag && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-cyan-500/40 text-xs text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="font-medium text-slate-200">
              Click 3D surface to place a tag • Click existing pins to inspect & view PDF manuals
            </span>
            <button
              onClick={() => setActiveTool('none')}
              className="ml-2 text-slate-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-white/10 transition text-xs font-semibold"
            >
              ✕
            </button>
          </div>
        )}

        {/* ─── Smart Tag Panel (Both Modes) ─── */}
        {selectedTag && (
          <TagPanel 
            tag={selectedTag}
            onUpdate={updateTag}
            onUploadDocument={addTagDocument}
            onDeleteDocument={deleteTagDocument}
            onDelete={handleDeleteTag}
            onClose={deselectTag}
          />
        )}

        {/* ─── Title Prompt Modal (Tags) ─── */}
        {titlePrompt && (
          <div className="tag-title-prompt-overlay" onClick={cancelTagPlacement}>
            <div className="tag-title-prompt" onClick={(e) => e.stopPropagation()}>
              <h3>Name this Tag</h3>
              <p>Enter a label for this equipment or inspection location.</p>
              <input
                type="text"
                autoFocus
                value={promptTitle}
                onChange={(e) => setPromptTitle(e.target.value)}
                placeholder="e.g. Wellhead B3, Transformer Box, Valve 04..."
                disabled={isSubmittingTag}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && promptTitle.trim() && !isSubmittingTag) {
                    e.preventDefault();
                    confirmTagPlacement();
                  }
                  if (e.key === 'Escape') cancelTagPlacement();
                }}
              />
              <div className="tag-title-prompt-actions">
                <button className="tag-prompt-cancel" onClick={cancelTagPlacement} disabled={isSubmittingTag}>Cancel</button>
                <button
                  className="tag-prompt-confirm"
                  onClick={confirmTagPlacement}
                  disabled={!promptTitle.trim() || isSubmittingTag}
                >
                  {isSubmittingTag ? 'Placing Tag...' : 'Place Tag'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Area Pointers Safety Panel (Virtual Tour) ─── */}
        <AreaPointersPanel 
          isOpen={isPointersPanelOpen && isVirtualTour}
          activePointer={activePointer}
          pointers={pointers}
          onCreate={handleCreatePointer}
          onUpdate={handleUpdatePointer}
          onDelete={handleDeletePointer}
          onSelect={handlePointerSelect}
          onClose={closePointersPanel}
        />

        {/* ─── 4D Timeline Comparison Bar (Drone GIS) ─── */}
        <TimelineComparisonBar 
          isOpen={isTimelineOpen && isDroneSurvey}
          onClose={() => setIsTimelineOpen(false)}
          activeFlightId={activeFlightId}
          onSelectFlight={setActiveFlightId}
          isSplitSwipeActive={isSplitSwipeActive}
          onToggleSplitSwipe={() => setIsSplitSwipeActive(!isSplitSwipeActive)}
        />

        {/* ─── Point Cloud LIDAR Drawer (temporarily disabled) ─── */}
        {/*
        <PointCloudDrawer 
          isOpen={isPointCloudDrawerOpen && isDroneSurvey}
          onClose={() => setIsPointCloudDrawerOpen(false)}
          pointCloudActive={pointCloudActive}
          onTogglePointCloud={togglePointCloud}
          pointSize={pointSize}
          onChangePointSize={(s) => { setPointSize(s); viewerRef.current?.tilesetEngine?.setPointSize?.(s); }}
          pointShape={pointShape}
          onChangePointShape={(sh) => { setPointShape(sh); viewerRef.current?.tilesetEngine?.setPointShape?.(sh); }}
          pointColorMode={pointColorMode}
          onChangePointColorMode={(mode) => {
            setPointColorMode(mode);
            viewerRef.current?.tilesetEngine?.setPointColorMode?.(mode);
          }}
          totalPointsCount={totalPointsCount}
        />
        */}

        {/* ─── 2D Orthomosaic Layer Drawer (temporarily disabled) ─── */}
        {/*
        <OrthoLayerDrawer 
          isOpen={isOrthoDrawerOpen && isDroneSurvey}
          onClose={() => setIsOrthoDrawerOpen(false)}
          orthoEnabled={orthoEnabled}
          onToggleOrtho={() => {
            const next = !orthoEnabled;
            setOrthoEnabled(next);
            const layer = viewerRef.current?.orthoLayer;
            if (layer) {
              if (next) {
                const targetUrl = getOrthoUrl(orthoType);
                if (targetUrl) {
                  layer.load(targetUrl, {
                    opacity: orthoOpacity,
                    elevationOffsetY: orthoOffset,
                    visible: true,
                    ...inspectionData?.orthoBounds
                  });
                }
                layer.show();
              } else {
                layer.hide();
              }
            }
          }}
          orthoType={orthoType}
          onChangeOrthoType={(type) => {
            setOrthoType(type);
            const layer = viewerRef.current?.orthoLayer;
            if (layer && orthoEnabled) {
              const targetUrl = getOrthoUrl(type);
              if (targetUrl) {
                layer.load(targetUrl, {
                  opacity: orthoOpacity,
                  elevationOffsetY: orthoOffset,
                  visible: true,
                  ...inspectionData?.orthoBounds
                });
              }
            }
          }}
          orthoOpacity={orthoOpacity}
          onChangeOrthoOpacity={(val) => {
            setOrthoOpacity(val);
            viewerRef.current?.orthoLayer?.setOpacity?.(val);
          }}
          orthoOffset={orthoOffset}
          onChangeOrthoOffset={(val) => {
            setOrthoOffset(val);
            viewerRef.current?.orthoLayer?.setElevationOffset?.(val);
          }}
        />
        */}

        {/* ─── 3D Satellite Basemap Drawer (Drone GIS) ─── */}
        <SatelliteBasemapDrawer 
          isOpen={isBasemapDrawerOpen && isDroneSurvey}
          onClose={() => setIsBasemapDrawerOpen(false)}
          basemapEnabled={basemapEnabled}
          onToggleBasemap={toggleBasemap}
          basemapOpacity={basemapOpacity}
          onChangeBasemapOpacity={(val) => {
            setBasemapOpacity(val);
            const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
            layer?.setOpacity?.(val);
          }}
          basemapElevation={basemapElevation}
          onChangeBasemapElevation={(val) => {
            setBasemapElevation(val);
            const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
            layer?.setElevation?.(val);
          }}
          basemapRotation={basemapRotation}
          onChangeBasemapRotation={(val) => {
            setBasemapRotation(val);
            const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
            layer?.setRotation?.(val);
          }}
          basemapOffsetX={basemapOffsetX}
          basemapOffsetZ={basemapOffsetZ}
          onChangeBasemapOffset={(x, z) => {
            setBasemapOffsetX(x);
            setBasemapOffsetZ(z);
            const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
            layer?.setManualOffset?.(x, z);
          }}
          basemapProvider={basemapProvider}
          onChangeBasemapProvider={(providerKey) => {
            setBasemapProvider(providerKey);
            const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
            layer?.setProvider?.(providerKey);
          }}
          basemapZoom={basemapZoom}
          onChangeBasemapZoom={(zoom) => {
            setBasemapZoom(zoom);
            const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
            layer?.setZoomAndRadius?.(zoom, basemapRadius);
          }}
          basemapRadius={basemapRadius}
          onChangeBasemapRadius={(radius) => {
            setBasemapRadius(radius);
            const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
            layer?.setZoomAndRadius?.(basemapZoom, radius);
          }}
          coordinates={coordinates}
          onChangeCoordinates={(latOrObj, maybeLon) => {
            const lat = typeof latOrObj === 'object' && latOrObj !== null ? latOrObj.lat : latOrObj;
            const lon = typeof latOrObj === 'object' && latOrObj !== null ? latOrObj.lon : maybeLon;
            setCoordinates({ lat, lon });
            const layer = viewerRef.current?.satelliteBasemapLayer || viewerRef.current?.satelliteBasemap;
            layer?.setCoordinates?.(lat, lon, basemapZoom);
          }}
        />

        {/* ─── Survey Report PDF Generator Modal (Drone GIS) ─── */}
        <SurveyReportModal 
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          inspectionData={inspectionData}
          viewerRef={viewerRef}
          volumeResult={volumeResult}
          profileData={selectedSection?.profile}
          tags={tags}
          measurements={measurements}
        />

        {/* ─── Floating Hypsometric Elevation Legend Card (Bottom Left) ─── */}
        {heatmapEnabled && isDroneSurvey && (
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

            {/* Min / Max Range Controls (ASL with relative ground indicator) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>
                  <span>Min ASL</span>
                  <span style={{ color: '#64748b' }}>Rel: {(minAsl - getDatumOffset()) >= 0 ? `+${(minAsl - getDatumOffset()).toFixed(1)}` : (minAsl - getDatumOffset()).toFixed(1)}m</span>
                </div>
                <input 
                  type="number" 
                  step="0.2" 
                  value={minAsl}
                  onChange={(e) => handleMinAslChange(e.target.value)}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#38bdf8', fontSize: 11, padding: '3px 6px' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>
                  <span>Max ASL</span>
                  <span style={{ color: '#64748b' }}>Rel: +{(maxAsl - getDatumOffset()).toFixed(1)}m</span>
                </div>
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
        {slopeEnabled && isDroneSurvey && (
          <div className="engine-slope-legend" style={{ width: 280, position: 'fixed', bottom: heatmapEnabled ? 300 : 68, left: 20, zIndex: 90 }}>
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
              <span style={{ color: '#ef4444', fontWeight: 600 }}>{slopeUnit === 'deg' ? '≥50° (Steep)' : '≥120%'}</span>
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

        {/* ─── Live Cursor Elevation & Slope Telemetry Chip (Bottom Left - Zero React Re-renders) ─── */}
        <div ref={telemetryChipRef} className="engine-telemetry-chip" style={{ display: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity style={{ width: 13, height: 13, color: '#38bdf8' }} />
            <span ref={telemetryElevRef} className="engine-telemetry-elev">-- m ASL</span>
            <span ref={telemetryRelRef} className="engine-telemetry-rel">(-- m)</span>
          </div>
          <span className="engine-hud-footer-dot">•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#94a3b8' }}>Slope:</span>
            <span ref={telemetrySlopeRef} style={{ color: '#34d399', fontWeight: 700 }}>--</span>
          </div>
          <span className="engine-hud-footer-dot">•</span>
          <span ref={telemetryCoordsRef} style={{ color: '#cbd5e1' }}>X: -- m | Z: -- m</span>
        </div>

        {/* ─── Active Tool Helper Hint Pill (Top Center) ─── */}
        {activeTool !== 'none' && (
          <div style={{
            position: 'fixed',
            top: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '8px 20px',
            borderRadius: '24px',
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            backdropFilter: 'blur(16px)',
            color: '#38bdf8',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.6)'
          }}>
            <span className="engine-pulse-dot" style={{ backgroundColor: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
            {activeTool === 'measure' && (
              <span>{hasPendingPoint ? "Click second point on 3D terrain to complete measurement" : "Click anywhere on 3D terrain to place first point"}</span>
            )}
            {activeTool === 'crossSection' && (
              <span>{crossSectionPendingPoints?.length === 1 ? "Click second point across terrain to generate elevation profile graph" : "Click first point on terrain to begin cross-section slice"}</span>
            )}
            {activeTool === 'volume' && (
              <span>{polygonPoints.length >= 3 ? "Click polygon vertices around area, then click Calculate Volume" : "Click 3D terrain to add polygon perimeter vertices (min 3 points)"}</span>
            )}
            {activeTool === 'tag' && (
              <span>Click any location on 3D terrain to drop an inspection marker / defect ticket</span>
            )}
            {activeTool === 'pointers' && (
              <span>Click 3D surface to define an industrial safety boundary / area marker</span>
            )}
          </div>
        )}

        {/* ─── Floating Minimalist Navigation Legend HUD (Bottom Right) ─── */}
        <footer className="engine-hud-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <MousePointer style={{ width: 12, height: 12, color: '#38bdf8' }} />
            <span><strong>Left Drag:</strong> Rotate</span>
          </div>
          <span className="engine-hud-footer-dot">•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Move style={{ width: 12, height: 12, color: '#38bdf8' }} />
            <span><strong>Right / Middle Drag:</strong> Pan Ground</span>
          </div>
          <span className="engine-hud-footer-dot">•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ZoomIn style={{ width: 12, height: 12, color: '#38bdf8' }} />
            <span><strong>Scroll:</strong> Zoom</span>
          </div>
          <span className="engine-hud-footer-dot">•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>2x Click:</span>
            <span>Focus Pivot</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
