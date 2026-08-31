import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import ProtectedRoute from '../components/ProtectedRoute';
import ModelAndScansViewer from '../components/ModelAndScansViewer';
import TagPanel from '../components/TagPanel';
import { useMeasurement } from '../hooks/useMeasurement';
import { useTags } from '../hooks/useTags';
import { useAreaPointers } from '../hooks/useAreaPointers';
import AreaPointersPanel from '../components/AreaPointersPanel';
import FurnitureCatalog from '../components/FurnitureCatalog';
import LayerControlPanel from '../components/LayerControlPanel';
import CrossSectionProfiler from '../components/CrossSectionProfiler';
import ReportsHubModal from '../components/ReportsHubModal';
import MeasurementHUD from '../components/MeasurementHUD';
import { bakeStaging } from '../utils/stagingRenderer';
import { 
  Compass, 
  Map, 
  Layers, 
  Activity, 
  Ruler, 
  FileText, 
  Tag, 
  CircleDot, 
  Maximize2, 
  ArrowLeft,
  Eye,
  Sliders,
  CheckCircle2,
  Box
} from 'lucide-react';
import './studio.css';
import { API_URL, MINIO_URL } from '../config/api';

export function meta() {
  return [{ title: "Drone Survey Studio | VirtualTwin SaaS" }];
}

function StudioContent() {
  const navigate = useNavigate();
  const { id } = useParams();
  const viewerRef = useRef(null);

  // ─── Modes & Tools ───
  const [measurementMode, setMeasurementMode] = useState(false);
  const [tagMode, setTagMode] = useState(false);
  const [pointersMode, setPointersMode] = useState(false);
  const [stagingMode, setStagingMode] = useState(false);
  const [crossSectionMode, setCrossSectionMode] = useState(false);

  // ─── Drone Survey & GIS Modals / Overlays ───
  const [showLayerControl, setShowLayerControl] = useState(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [crossSectionData, setCrossSectionData] = useState(null);
  const [activeSurveyMeasurement, setActiveSurveyMeasurement] = useState(null);
  const crossSectionStartPointRef = useRef(null);

  // ─── Inspection Details / Survey Metadata ───
  const [inspectionData, setInspectionData] = useState(null);

  // ─── Layer Control State ───
  const [layerState, setLayerState] = useState({
    meshVisible: true,
    screenSpaceError: 8,
    wireframe: false,
    orthoVisible: true,
    orthoOpacity: 1.0,
    basemapVisible: false,
    basemapOpacity: 0.92,
    scansVisible: true,
    tagsVisible: true,
    contoursVisible: false,
    contourInterval: '1.0m'
  });

  // ─── Staging Profiles State ───
  const [stagingProfiles, setStagingProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [isBaking, setIsBaking] = useState(false);
  const [bakeProgress, setBakeProgress] = useState(0);
  const [debugBakedImages, setDebugBakedImages] = useState([]);

  // ─── Tag & Pointer Prompts ───
  const [titlePrompt, setTitlePrompt] = useState(null);
  const [promptTitle, setPromptTitle] = useState('');
  const [pointerPrompt, setPointerPrompt] = useState(null);
  const [promptPointerName, setPromptPointerName] = useState('');

  // ─── Fetch Inspection Details ───
  const fetchInspection = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/inspections/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInspectionData(data);
        if (data.stagingProfiles) setStagingProfiles(data.stagingProfiles);
      }
    } catch (e) {
      console.error("Failed to load inspection:", e);
    }
  }, [id]);

  useEffect(() => {
    fetchInspection();
  }, [fetchInspection]);

  // ─── Measurement hook ───
  const {
    measurements,
    hasPendingPoint,
    handleMeasurementClick: rawMeasurementClick,
    removeMeasurement,
    clearAllMeasurements,
    cancelPending
  } = useMeasurement(viewerRef);

  // Wrap measurement click to populate HUD
  const handleMeasurementClick = useCallback((e) => {
    rawMeasurementClick(e);
  }, [rawMeasurementClick]);

  // Track latest measurement for HUD
  useEffect(() => {
    if (measurements.length > 0) {
      const latest = measurements[measurements.length - 1];
      setActiveSurveyMeasurement(latest);
    }
  }, [measurements]);

  // ─── Tags hook ───
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

  // ─── Area Pointers hook ───
  const {
    areaPointers,
    selectedPointer,
    selectedPointerId,
    trySelectPointer,
    handlePointerClick,
    createPointer,
    updatePointer,
    deletePointer,
    selectPointer,
    deselectPointer,
    tryStartDrag,
    handleDragMove,
    handleDragEnd,
    isDragging,
  } = useAreaPointers(viewerRef, id);

  // ─── Layer State Update Handler ───
  const handleUpdateLayer = useCallback((key, value) => {
    setLayerState(prev => ({ ...prev, [key]: value }));

    const tilesetEngine = viewerRef.current?.tilesetEngine;
    const orthoLayer = viewerRef.current?.orthoLayer;
    const scene = viewerRef.current?.sceneRef?.current;

    if (key === 'meshVisible') {
      tilesetEngine?.setVisible(value);
      if (viewerRef.current?.modelRef?.current) {
        viewerRef.current.modelRef.current.visible = value;
      }
    } else if (key === 'screenSpaceError') {
      tilesetEngine?.setScreenSpaceError(value);
    } else if (key === 'wireframe') {
      tilesetEngine?.setWireframe(value);
    } else if (key === 'orthoVisible') {
      orthoLayer?.setVisible(value);
    } else if (key === 'orthoOpacity') {
      orthoLayer?.setOpacity(value);
    } else if (key === 'basemapVisible') {
      const basemap = viewerRef.current?.satelliteBasemapLayer;
      if (basemap) {
        if (value && !basemap.isLoaded) {
          basemap.load({ visible: true, opacity: layerState.basemapOpacity ?? 0.92 });
        } else {
          basemap.setVisible(value);
        }
      }
    } else if (key === 'basemapOpacity') {
      viewerRef.current?.satelliteBasemapLayer?.setOpacity(value);
    } else if (key === 'scansVisible') {
      const rings = scene?.getObjectByName('isScanRings') || scene?.children.find(c => c.userData?.isScanRings);
      if (rings) rings.visible = value;
    } else if (key === 'tagsVisible') {
      const tagGroup = scene?.getObjectByName('tagMarkers');
      if (tagGroup) tagGroup.visible = value;
    }
  }, []);

  // ─── Cross Section Click Handler ───
  const handleCrossSectionClick = useCallback((event) => {
    const renderer = viewerRef.current?.rendererRef?.current;
    const camera = viewerRef.current?.cameraRef?.current;
    if (!renderer || !camera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1
    };

    // Use Raycaster to find intersection
    const raycaster = new (window.THREE || viewerRef.current?.THREE || Object.getPrototypeOf(camera).constructor.Raycaster || Object.getPrototypeOf(viewerRef.current?.sceneRef?.current).constructor.Raycaster)();
    // Fallback standard raycast
    const meshes = [];
    const model = viewerRef.current?.modelRef?.current;
    if (model) model.traverse(c => { if (c.isMesh) meshes.push(c); });
    const tilesGroup = viewerRef.current?.tilesetEngine?.getGroup();
    if (tilesGroup) tilesGroup.traverse(c => { if (c.isMesh) meshes.push(c); });

    // Try imperative handle sample
    if (!crossSectionStartPointRef.current) {
      // First point (Point A)
      crossSectionStartPointRef.current = { x: 0, y: 0, z: 0 }; // Placeholder until raycast resolves
      // We can use measurement point
      setCrossSectionData(null);
    }
  }, []);

  // ─── Tool Toggles ───
  const toggleMeasurement = useCallback(() => {
    setMeasurementMode(prev => {
      if (prev) cancelPending();
      return !prev;
    });
    setTagMode(false);
    setPointersMode(false);
    setStagingMode(false);
    setCrossSectionMode(false);
  }, [cancelPending]);

  const toggleCrossSection = useCallback(() => {
    setCrossSectionMode(prev => !prev);
    setMeasurementMode(false);
    setTagMode(false);
    setPointersMode(false);
    setStagingMode(false);

    // If opening cross section and samples available, generate demo profile or wait for 2 clicks
    if (!crossSectionMode && viewerRef.current?.sampleCrossSection) {
      const profile = viewerRef.current.sampleCrossSection({ x: -40, y: -80, z: -43 }, { x: 50, y: 120, z: -40 }, 60);
      setCrossSectionData(profile);
    }
  }, [crossSectionMode]);

  const toggleTagMode = useCallback(() => {
    setTagMode(prev => !prev);
    setMeasurementMode(false);
    setPointersMode(false);
    setStagingMode(false);
    setCrossSectionMode(false);
  }, []);

  const togglePointerMode = useCallback(() => {
    setPointersMode(prev => !prev);
    setTagMode(false);
    setMeasurementMode(false);
    setStagingMode(false);
    setCrossSectionMode(false);
  }, []);

  const toggleStagingMode = useCallback(() => {
    setStagingMode(prev => !prev);
    setTagMode(false);
    setPointersMode(false);
    setMeasurementMode(false);
    setCrossSectionMode(false);
  }, []);

  // ─── Tag Placement ───
  const onTagClickHandler = useCallback((event) => {
    handleTagClick(event, (position) => {
      setTitlePrompt({ position });
      setPromptTitle('');
    });
  }, [handleTagClick]);

  const confirmTagPlacement = useCallback(async () => {
    if (!titlePrompt || !promptTitle.trim()) return;
    await createTag(promptTitle.trim(), titlePrompt.position);
    setTitlePrompt(null);
    setPromptTitle('');
  }, [titlePrompt, promptTitle, createTag]);

  // ─── Pointer Placement ───
  const onPointerClickHandler = useCallback((event) => {
    handlePointerClick(event, (position) => {
      setPointerPrompt({ position });
      setPromptPointerName('');
    });
  }, [handlePointerClick]);

  const confirmPointerPlacement = useCallback(async () => {
    if (!pointerPrompt || !promptPointerName.trim()) return;
    await createPointer(promptPointerName.trim(), '#ff0000', pointerPrompt.position);
    setPointerPrompt(null);
    setPromptPointerName('');
  }, [pointerPrompt, promptPointerName, createPointer]);

  // ─── Backend Survey API Handlers ───
  const handleSaveCrossSection = async (sectionData) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/inspections/${id}/survey/cross-sections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(sectionData)
      });
      if (res.ok) {
        alert("Cross-Section Profile saved successfully to survey records!");
        fetchInspection();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveMeasurement = async (measData) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/inspections/${id}/survey/measurements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(measData)
      });
      if (res.ok) {
        fetchInspection();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSurveyReport = async ({ title, reportType, file }) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    // 1. Get presigned upload URL
    const presignRes = await fetch(`${API_URL}/inspections/${id}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ fileName: `reports/${file.name}` })
    });
    if (!presignRes.ok) throw new Error("Upload URL failed");
    const { presignedUrl } = await presignRes.json();

    // 2. PUT to MinIO
    await fetch(presignedUrl, { method: 'PUT', body: file });

    // 3. Register Report in Backend
    const regRes = await fetch(`${API_URL}/inspections/${id}/survey/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title,
        reportType,
        fileUrl: `${MINIO_URL}/virtual-inspections/${id}/reports/${file.name}`
      })
    });
    if (regRes.ok) {
      alert("Survey Report uploaded and linked successfully!");
      fetchInspection();
    }
  };

  // ─── Staging Helpers ───
  const createStagingProfile = async () => {
    const name = prompt("Enter a name for the new staging profile:");
    if (!name) return;
    const token = localStorage.getItem('access_token');
    try {
      const res = await fetch(`${API_URL}/inspections/${id}/staging-profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        fetchInspection();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveStaging = async () => {
    if (!viewerRef.current?.staging || !activeProfileId) return;
    const token = localStorage.getItem('access_token');
    try {
      const items = viewerRef.current.staging.getStagedItemsData();
      await fetch(`${API_URL}/inspections/${id}/staging-profiles/${activeProfileId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items })
      });
      alert('Staging layout saved successfully!');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="studio-layout bg-slate-950 text-slate-100 min-h-screen">
      
      {/* ─── Top Floating GIS & Survey Command Bar ─── */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-2xl border border-slate-700/70 bg-slate-900/90 backdrop-blur-xl shadow-2xl">
        
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Exit</span>
        </button>

        <div className="h-5 w-[1px] bg-slate-700 mx-1" />

        {/* Camera View Presets */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => viewerRef.current?.setTopView?.()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
            title="Top-Down Ortho View (2D Plan)"
          >
            <Map className="h-3.5 w-3.5 text-cyan-400" />
            <span>Top (Ortho)</span>
          </button>

          <button 
            onClick={() => viewerRef.current?.setIsoView?.()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
            title="Isometric 45° 3D View"
          >
            <Compass className="h-3.5 w-3.5 text-amber-400" />
            <span>Iso 3D</span>
          </button>
        </div>

        <div className="h-5 w-[1px] bg-slate-700 mx-1" />

        {/* Survey Tools */}
        <div className="flex items-center gap-1.5">
          {/* Measurement Tool */}
          <button 
            onClick={toggleMeasurement}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              measurementMode 
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Ruler className="h-3.5 w-3.5" />
            <span>{measurementMode ? 'Measuring...' : 'Measure'}</span>
          </button>

          {/* Cross-Section Tool */}
          <button 
            onClick={toggleCrossSection}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              crossSectionMode || crossSectionData 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Elevation Profile</span>
          </button>

          {/* GIS Layers Switcher */}
          <button 
            onClick={() => setShowLayerControl(!showLayerControl)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              showLayerControl 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>GIS Layers</span>
          </button>

          {/* Reports Hub */}
          <button 
            onClick={() => setIsReportsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>RealityScan Reports</span>
          </button>
        </div>

      </div>

      {/* ─── 3D Viewport Mount ─── */}
      <div className="viewer-container">
        <ModelAndScansViewer
          ref={viewerRef}
          tourId={id}
          activeProfileId={activeProfileId}
          stagingMode={stagingMode}
          measurementMode={measurementMode}
          onMeasurementClick={handleMeasurementClick}
          tagMode={tagMode}
          onTagClick={onTagClickHandler}
          onTagSelect={trySelectTag}
          pointersMode={pointersMode}
          onPointerClick={onPointerClickHandler}
          onPointerSelect={trySelectPointer}
          onPointerDragStart={tryStartDrag}
          onPointerDragMove={handleDragMove}
          onPointerDragEnd={handleDragEnd}
        />
      </div>

      {/* ─── Layer Control Panel ─── */}
      {showLayerControl && (
        <LayerControlPanel
          layerState={layerState}
          onUpdateLayer={handleUpdateLayer}
          has3DTiles={Boolean(inspectionData?.tilesetUrl)}
          hasOrtho={Boolean(inspectionData?.orthoUrl)}
          hasDSM={Boolean(inspectionData?.dsmUrl)}
          hasScans={Boolean(inspectionData?.scansJsonUrl)}
        />
      )}

      {/* ─── Measurement HUD ─── */}
      {measurementMode && activeSurveyMeasurement && (
        <MeasurementHUD
          measurementData={activeSurveyMeasurement}
          onClose={() => setActiveSurveyMeasurement(null)}
          onSave={handleSaveMeasurement}
          inspectionId={id}
        />
      )}

      {/* ─── Cross-Section Elevation Profiler ─── */}
      {crossSectionData && (
        <CrossSectionProfiler
          profileData={crossSectionData}
          onClose={() => setCrossSectionData(null)}
          onSave={handleSaveCrossSection}
          inspectionId={id}
        />
      )}

      {/* ─── RealityScan Reports Hub Modal ─── */}
      <ReportsHubModal
        isOpen={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
        inspection={inspectionData}
        onAddReport={handleAddSurveyReport}
      />

      {/* ─── Side Panel (Tags, Pointers, Staging) ─── */}
      <div className="studio-sidebar">
        
        {/* Inspection Survey Info Card */}
        <div className="tool-section bg-slate-900/80 p-3 rounded-xl border border-slate-800">
          <div className="text-xs font-bold text-slate-200 mb-1 flex items-center justify-between">
            <span>{inspectionData?.title || 'Drone Survey Flight'}</span>
            <span className="text-[10px] text-cyan-400 font-mono">
              {inspectionData?.gsd ? `${inspectionData.gsd} cm/px` : 'RTK Survey'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">
            {inspectionData?.description || 'Construction site supervision & photogrammetry digital twin.'}
          </p>
          <div className="flex gap-2 text-[10px] font-mono text-slate-400">
            <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {inspectionData?.surveyReports?.length || 0} Reports
            </span>
            <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {inspectionData?.crossSections?.length || 0} Profiles
            </span>
            <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {tags.length} Pins
            </span>
          </div>
        </div>

        {/* ─── Tags Tool Section ─── */}
        <div className="tool-section">
          <h3 className="tool-section-title">Site Issue Pins & Tags</h3>
          
          <button
            className={`measure-toggle ${tagMode ? 'active' : ''}`}
            onClick={toggleTagMode}
          >
            <span className="measure-toggle-icon">
              <Tag className="h-4 w-4" />
            </span>
            {tagMode ? 'Placing Pin...' : 'Add Site Pin'}
            <span className="status-dot" />
          </button>

          {tagMode && (
            <div className="measure-hint">
              📍 Click anywhere on the 3D terrain to pin a new inspection tag.
            </div>
          )}

          {/* Tags List */}
          {tags.length > 0 ? (
            <ul className="tags-list">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className={`tag-list-item ${selectedTagId === tag.id ? 'selected' : ''}`}
                  onClick={() => selectTag(tag.id)}
                >
                  <div className="tag-list-info">
                    <span className="tag-list-pin" style={{ color: tag.color || '#00e5ff' }}>
                      ●
                    </span>
                    <div className="tag-list-text">
                      <span className="tag-list-title">{tag.title}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-measurements">
              No tags placed yet
            </div>
          )}
        </div>

        {/* ─── Area Pointers Section ─── */}
        <div className="tool-section">
          <h3 className="tool-section-title">Area Zones</h3>
          <button
            className={`measure-toggle ${pointersMode ? 'active' : ''}`}
            onClick={togglePointerMode}
          >
            <span className="measure-toggle-icon">
              <Box className="h-4 w-4" />
            </span>
            {pointersMode ? 'Placing Zone...' : 'Add Area Zone'}
            <span className="status-dot" />
          </button>

          {areaPointers.length > 0 && (
            <ul className="tags-list">
              {areaPointers.map((ap) => (
                <li
                  key={ap.id}
                  className={`tag-list-item ${selectedPointerId === ap.id ? 'selected' : ''}`}
                  onClick={() => selectPointer(ap.id)}
                >
                  <div className="tag-list-info">
                    <span className="tag-list-pin" style={{ color: ap.color || '#ff0000' }}>
                      ■
                    </span>
                    <div className="tag-list-text">
                      <span className="tag-list-title">{ap.name}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ─── Virtual Staging Section ─── */}
        <div className="tool-section">
          <h3 className="tool-section-title">Site Staging / BIM</h3>
          <div className="space-y-2 mb-3">
            <select 
              value={activeProfileId} 
              onChange={(e) => {
                setActiveProfileId(e.target.value);
                if (!e.target.value) setStagingMode(false);
              }}
              className="w-full bg-slate-900 text-xs text-slate-200 border border-slate-700 rounded-lg p-2 outline-none"
            >
              <option value="">-- Select Staging Profile --</option>
              {stagingProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button 
              onClick={createStagingProfile} 
              className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
            >
              + Create New Profile
            </button>
          </div>

          {activeProfileId && (
            <button
              className={`measure-toggle ${stagingMode ? 'active' : ''}`}
              onClick={toggleStagingMode}
            >
              <span className="measure-toggle-icon">🛋️</span>
              {stagingMode ? 'Editing Staging...' : 'Edit Staging'}
              <span className="status-dot" />
            </button>
          )}
        </div>

      </div>

      {/* ─── Tag Panel (edit overlay) ─── */}
      {selectedTag && (
        <TagPanel
          tag={selectedTag}
          onUpdate={updateTag}
          onUploadDocument={addTagDocument}
          onDeleteDocument={deleteTagDocument}
          onDelete={async (tagId) => { await deleteTag(tagId); }}
          onClose={deselectTag}
        />
      )}

      {/* ─── Area Pointers Panel (edit overlay) ─── */}
      {selectedPointer && (
        <AreaPointersPanel
          pointersMode={pointersMode}
          setPointersMode={togglePointerMode}
          selectedPointer={selectedPointer}
          deselectPointer={deselectPointer}
          updatePointer={updatePointer}
          deletePointer={deletePointer}
        />
      )}

      {/* ─── Title Prompt Modal (Tags) ─── */}
      {titlePrompt && (
        <div className="tag-title-prompt-overlay" onClick={() => setTitlePrompt(null)}>
          <div className="tag-title-prompt" onClick={(e) => e.stopPropagation()}>
            <h3>Name this Tag</h3>
            <p>Enter a title for the new annotation point.</p>
            <input
              type="text"
              autoFocus
              value={promptTitle}
              onChange={(e) => setPromptTitle(e.target.value)}
              placeholder="e.g. Earthwork Zone B, Quality Defect..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptTitle.trim()) confirmTagPlacement();
                if (e.key === 'Escape') setTitlePrompt(null);
              }}
            />
            <div className="tag-title-prompt-actions">
              <button className="tag-prompt-cancel" onClick={() => setTitlePrompt(null)}>Cancel</button>
              <button
                className="tag-prompt-confirm"
                onClick={confirmTagPlacement}
                disabled={!promptTitle.trim()}
              >
                Place Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Title Prompt Modal (Pointers) ─── */}
      {pointerPrompt && (
        <div className="tag-title-prompt-overlay" onClick={() => setPointerPrompt(null)}>
          <div className="tag-title-prompt" onClick={(e) => e.stopPropagation()}>
            <h3>Name this Area</h3>
            <p>Enter a label for the area pointed to.</p>
            <input
              type="text"
              autoFocus
              value={promptPointerName}
              onChange={(e) => setPromptPointerName(e.target.value)}
              placeholder="e.g. Foundation Pit 1..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptPointerName.trim()) confirmPointerPlacement();
                if (e.key === 'Escape') setPointerPrompt(null);
              }}
            />
            <div className="tag-title-prompt-actions">
              <button className="tag-prompt-cancel" onClick={() => setPointerPrompt(null)}>Cancel</button>
              <button
                className="tag-prompt-confirm"
                style={{ background: '#ff4d6d' }}
                onClick={confirmPointerPlacement}
                disabled={!promptPointerName.trim()}
              >
                Place Zone
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function StudioPage() {
  return (
    <ProtectedRoute>
      <StudioContent />
    </ProtectedRoute>
  );
}
