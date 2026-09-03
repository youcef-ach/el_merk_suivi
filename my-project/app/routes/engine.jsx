import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import * as THREE from 'three';
import IndustrialTourViewer from '../components/IndustrialTourViewer';
import DroneSurveyViewer from '../components/DroneSurveyViewer';
import MeasurementHUD from '../components/MeasurementHUD';
import CrossSectionProfiler from '../components/CrossSectionProfiler';
import TagPanel from '../components/TagPanel';
import VolumeHUD from '../components/VolumeHUD';
import SurveyReportModal from '../components/SurveyReportModal';
import OrthoLayerDrawer from '../components/OrthoLayerDrawer';
import SatelliteBasemapDrawer from '../components/SatelliteBasemapDrawer';
import TimelineComparisonBar from '../components/TimelineComparisonBar';
import PointCloudDrawer from '../components/PointCloudDrawer';
import AreaPointersPanel from '../components/AreaPointersPanel';
import { useMeasurement } from '../hooks/useMeasurement';
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
  Palette
} from 'lucide-react';
import './engine.css';
import { API_URL } from '../config/api';

export function meta() {
  return [{ title: "Digital Twin Engine | Industrial Tour & Drone GIS" }];
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
  const [activePurpose, setActivePurpose] = useState('AUTO'); // 'AUTO' | 'VIRTUAL_TOUR' | 'DRONE_SURVEY'
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
  const [slopeUnit, setSlopeUnit] = useState('deg');

  // ─── Survey Report PDF Generator Modal State ───
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // ─── 2D Orthomosaic Layer State ───
  const [isOrthoDrawerOpen, setIsOrthoDrawerOpen] = useState(false);
  const [orthoEnabled, setOrthoEnabled] = useState(false);
  const [orthoType, setOrthoType] = useState('dsm');
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

  // ─── Active Tool State: 'none' | 'measure' | 'crossSection' | 'volume' | 'tag' | 'pointers' ───
  const [activeTool, setActiveTool] = useState('none');

  // ─── Floor & Mode State for Virtual Tour ───
  const [activeFloor, setActiveFloor] = useState('all');
  const [tourMode, setTourMode] = useState('DOLLHOUSE'); // 'DOLLHOUSE' | 'FLOORPLAN' | 'INSIDE'

  // Fetch Inspection Details
  useEffect(() => {
    const fetchInspection = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch(`${API_URL}/inspections/${id}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          setInspectionData(data);
        }
      } catch (err) {
        console.error("Failed to fetch inspection details:", err);
      }
    };
    fetchInspection();
  }, [id]);

  // Determine Effective Inspection Purpose
  const effectivePurpose = activePurpose === 'AUTO' 
    ? (inspectionData?.type === 'DRONE_SURVEY' || (inspectionData?.tilesetUrl && !inspectionData?.glbModelUrl) ? 'DRONE_SURVEY' : 'VIRTUAL_TOUR')
    : activePurpose;

  const isVirtualTour = effectivePurpose === 'VIRTUAL_TOUR';
  const isDroneSurvey = effectivePurpose === 'DRONE_SURVEY';

  // ─── Hooks for Measurements, Tags, Volumes, and Pointers ───
  const {
    measurements,
    activeMeasurement,
    handleMeasurementClick,
    handleClearMeasurement,
    clearAllMeasurements,
    isMeasuring
  } = useMeasurement(viewerRef.current?.sceneRef, viewerRef.current?.cameraRef);

  const {
    tags,
    activeTag,
    isTagPanelOpen,
    tagFormState,
    handleTagClick,
    handleTagSelect,
    handleSaveTag,
    handleDeleteTag,
    handleUploadDocument,
    handleDeleteDocument,
    closeTagPanel,
    updateTagFormField
  } = useTags(viewerRef, id);

  const {
    volumePoints,
    volumeResult,
    handleVolumeClick,
    clearVolume,
    setSoilType,
    soilType
  } = useVolumeCalculation(viewerRef.current?.sceneRef, viewerRef.current?.cameraRef);

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

  // Toggle Tools
  const toggleTool = (toolName) => {
    setActiveTool(prev => prev === toolName ? 'none' : toolName);
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

  // Drone GIS Layer Toggles
  const toggleHeatmap = () => {
    const next = !heatmapEnabled;
    setHeatmapEnabled(next);
    viewerRef.current?.tilesetEngine?.setHeatmapMode?.(next, {
      minElev: minAsl - DSM_DATUM_OFFSET,
      maxElev: maxAsl - DSM_DATUM_OFFSET,
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
    <div className="engine-container" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      
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
      {isDroneSurvey && (
        <header className="engine-header">
          {/* Left Section: Back, Title & Purpose Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button 
              onClick={() => navigate(inspectionData?.projectId ? `/projects/${inspectionData.projectId}` : '/projects')} 
              className="engine-btn"
              title="Back to Project Inspections"
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              <span>Back</span>
            </button>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="engine-title">{inspectionData?.title || 'Inspection Digital Twin'}</span>
                <span className="engine-badge badge-drone">
                  🛰️ Drone Survey
                </span>
              </div>
              {inspectionData?.droneModel && (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{inspectionData.droneModel} • GSD {inspectionData.gsd || 1.5} cm/px</span>
              )}
            </div>
          </div>

          <div className="engine-divider" />

          {/* ─── DRONE SURVEY & GIS TOOLBAR (Construction / Topography Mode) ─── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* View Camera Mode Switcher */}
            <div className="engine-view-toggle">
              <button 
                onClick={handleTopView}
                className={`engine-btn-compact ${activeView === 'top' ? 'active' : ''}`}
                title="Top-Down Ortho GIS View"
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
            </button>

            {/* 3. Volumetric Cut/Fill Calculator */}
            <button 
              onClick={() => toggleTool('volume')}
              className={`engine-btn ${activeTool === 'volume' ? 'engine-btn-amber' : ''}`}
              title="Volumetric Earthwork & Stockpile Calculator"
            >
              <Boxes style={{ width: 14, height: 14 }} />
              <span>Cut / Fill</span>
            </button>

            <div className="engine-divider" />

            {/* 4. GIS Layers & Visual Overlays Menu */}
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setIsLayersMenuOpen(!isLayersMenuOpen)}
                className={`engine-btn ${activeLayersCount > 0 ? 'engine-btn-emerald' : ''}`}
                title="GIS Surface Overlays (Heatmap, Slope, Ortho, Satellite)"
              >
                <Layers style={{ width: 14, height: 14 }} />
                <span>GIS Layers</span>
                {activeLayersCount > 0 && (
                  <span className="engine-active-count-badge">{activeLayersCount}</span>
                )}
                <ChevronDown style={{ width: 12, height: 12 }} />
              </button>

              {/* GIS Layers Dropdown */}
              {isLayersMenuOpen && (
                <div className="engine-dropdown-menu" style={{ width: 260 }}>
                  <div className="engine-dropdown-header">GIS Topography & Layers</div>
                  
                  {/* Hypsometric Elevation Heatmap */}
                  <button 
                    onClick={toggleHeatmap}
                    className={`engine-dropdown-item ${heatmapEnabled ? 'active' : ''}`}
                  >
                    <Sparkles style={{ width: 14, height: 14, color: '#f59e0b' }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600 }}>Hypsometric Heatmap</div>
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
                      <div style={{ fontWeight: 600 }}>Slope & Gradient Stability</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Hazard steepness detection</div>
                    </div>
                    <span className={`engine-switch-dot ${slopeEnabled ? 'on' : ''}`} />
                  </button>

                  {/* Point Cloud LIDAR */}
                  <button 
                    onClick={() => { setIsPointCloudDrawerOpen(true); setIsLayersMenuOpen(false); }}
                    className={`engine-dropdown-item ${pointCloudActive ? 'active' : ''}`}
                  >
                    <Cpu style={{ width: 14, height: 14, color: '#818cf8' }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600 }}>Point Cloud LIDAR</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Raw LAS/LAZ point rendering</div>
                    </div>
                    <span className={`engine-switch-dot ${pointCloudActive ? 'on' : ''}`} />
                  </button>

                  {/* 2D Orthomosaic */}
                  <button 
                    onClick={() => { setIsOrthoDrawerOpen(true); setIsLayersMenuOpen(false); }}
                    className={`engine-dropdown-item ${orthoEnabled ? 'active' : ''}`}
                  >
                    <Map style={{ width: 14, height: 14, color: '#38bdf8' }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600 }}>2D Orthomosaic & DTM</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Aerial photogrammetry projection</div>
                    </div>
                    <span className={`engine-switch-dot ${orthoEnabled ? 'on' : ''}`} />
                  </button>
                </div>
              )}
            </div>

            {/* Export */}
            <button 
              onClick={() => setIsReportModalOpen(true)}
              className="engine-btn"
              style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(14, 165, 233, 0.25))', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
              title="Export Professional PDF Survey Dossier"
            >
              <FileDown style={{ width: 14, height: 14 }} />
              <span>Export Report</span>
            </button>
          </div>

          <div className="engine-divider" />

          {/* Right Section: Purpose Mode Switcher & Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button 
              onClick={toggleFullscreen}
              className="engine-btn"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 style={{ width: 14, height: 14 }} /> : <Maximize2 style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </header>
      )}

      {/* ─── 3D Viewport: Render the Dedicated Viewer ─── */}
      <main className="engine-viewport-wrapper">
        {isVirtualTour ? (
          <IndustrialTourViewer 
            ref={viewerRef}
            tourId={id}
            measurementMode={activeTool === 'measure'}
            onMeasurementClick={handleMeasurementClick}
            tagMode={activeTool === 'tag'}
            onTagClick={handleTagClick}
            onTagSelect={handleTagSelect}
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
            measurementMode={activeTool === 'measure'}
            onMeasurementClick={handleMeasurementClick}
            volumeMode={activeTool === 'volume'}
            onVolumeClick={handleVolumeClick}
          />
        )}

        {/* ─── Measurement HUD (Both Modes) ─── */}
        <MeasurementHUD 
          measurements={measurements}
          activeMeasurement={activeMeasurement}
          onClear={handleClearMeasurement}
          onClearAll={clearAllMeasurements}
          isVisible={activeTool === 'measure'}
          onClose={() => setActiveTool('none')}
        />

        {/* ─── Cross-Section Elevation Profiler (Drone GIS) ─── */}
        <CrossSectionProfiler 
          isVisible={activeTool === 'crossSection' && isDroneSurvey}
          onClose={() => setActiveTool('none')}
          sampleCrossSection={(p1, p2) => viewerRef.current?.sampleCrossSection?.(p1, p2)}
          sceneRef={viewerRef.current?.sceneRef}
          cameraRef={viewerRef.current?.cameraRef}
          inspectionId={id}
        />

        {/* ─── Volumetric Cut/Fill Calculator HUD (Drone GIS) ─── */}
        <VolumeHUD 
          points={volumePoints}
          result={volumeResult}
          onClear={clearVolume}
          soilType={soilType}
          onSoilChange={setSoilType}
          isVisible={activeTool === 'volume' && isDroneSurvey}
          onClose={() => setActiveTool('none')}
          inspectionId={id}
        />

        {/* ─── Smart Tag Panel (Both Modes) ─── */}
        <TagPanel 
          isOpen={isTagPanelOpen}
          activeTag={activeTag}
          tagFormState={tagFormState}
          onSave={handleSaveTag}
          onDelete={handleDeleteTag}
          onUploadDocument={handleUploadDocument}
          onDeleteDocument={handleDeleteDocument}
          onClose={closeTagPanel}
          onChangeField={updateTagFormField}
        />

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

        {/* ─── Point Cloud LIDAR Drawer (Drone GIS) ─── */}
        <PointCloudDrawer 
          isOpen={isPointCloudDrawerOpen && isDroneSurvey}
          onClose={() => setIsPointCloudDrawerOpen(false)}
          pointCloudActive={pointCloudActive}
          onTogglePointCloud={toggleWireframe}
          pointSize={pointSize}
          onChangePointSize={(s) => { setPointSize(s); viewerRef.current?.tilesetEngine?.setPointSize?.(s); }}
          pointShape={pointShape}
          onChangePointShape={(sh) => { setPointShape(sh); viewerRef.current?.tilesetEngine?.setPointShape?.(sh); }}
          totalPoints={totalPointsCount}
        />

        {/* ─── 2D Orthomosaic Layer Drawer (Drone GIS) ─── */}
        <OrthoLayerDrawer 
          isOpen={isOrthoDrawerOpen && isDroneSurvey}
          onClose={() => setIsOrthoDrawerOpen(false)}
          orthoEnabled={orthoEnabled}
          onToggleOrtho={(val) => {
            setOrthoEnabled(val);
            if (viewerRef.current?.orthoLayer) {
              if (val) {
                viewerRef.current.orthoLayer.load(
                  inspectionData?.orthoUrl 
                    ? (inspectionData.orthoUrl.startsWith('http') ? inspectionData.orthoUrl : `${API_URL}/storage/${inspectionData.orthoUrl}`)
                    : '/ortho.png',
                  { opacity: orthoOpacity, elevationOffsetY: orthoOffset }
                );
              } else {
                viewerRef.current.orthoLayer.hide();
              }
            }
          }}
          orthoOpacity={orthoOpacity}
          onChangeOpacity={(val) => {
            setOrthoOpacity(val);
            viewerRef.current?.orthoLayer?.setOpacity?.(val);
          }}
          orthoOffset={orthoOffset}
          onChangeOffset={(val) => {
            setOrthoOffset(val);
            viewerRef.current?.orthoLayer?.setElevationOffset?.(val);
          }}
        />

        {/* ─── 3D Satellite Basemap Drawer (Drone GIS) ─── */}
        <SatelliteBasemapDrawer 
          isOpen={isBasemapDrawerOpen && isDroneSurvey}
          onClose={() => setIsBasemapDrawerOpen(false)}
          basemapEnabled={basemapEnabled}
          onToggleBasemap={(val) => {
            setBasemapEnabled(val);
            viewerRef.current?.satelliteBasemap?.setVisible?.(val);
          }}
          basemapOpacity={basemapOpacity}
          onChangeOpacity={(val) => {
            setBasemapOpacity(val);
            viewerRef.current?.satelliteBasemap?.setOpacity?.(val);
          }}
          basemapElevation={basemapElevation}
          onChangeElevation={(val) => {
            setBasemapElevation(val);
            viewerRef.current?.satelliteBasemap?.setElevation?.(val);
          }}
          coordinates={coordinates}
          onChangeCoordinates={(c) => {
            setCoordinates(c);
            viewerRef.current?.satelliteBasemap?.setCoordinates?.(c.lat, c.lon);
          }}
        />

        {/* ─── Survey Report PDF Generator Modal (Drone GIS) ─── */}
        <SurveyReportModal 
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          inspection={inspectionData}
          measurementsCount={measurements.length}
          volumeResult={volumeResult}
        />
      </main>
    </div>
  );
}
