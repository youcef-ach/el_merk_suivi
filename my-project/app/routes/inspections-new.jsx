import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import { 
  Camera, 
  Map, 
  Layers, 
  FileText, 
  Compass, 
  Upload, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles,
  Sliders,
  X,
  Check,
  CircleDot,
  Radio,
  Image as ImageIcon,
  ChevronRight,
  Video,
  Eye,
  FolderOpen
} from 'lucide-react';
import './new-inspection.css';
import { API_URL, MINIO_URL } from '../config/api';

export function meta() {
  return [
    { title: "New Drone Survey Flight | VirtualTwin SaaS" },
  ];
}

const createInspectionSchema = z.object({
  title: z.string().min(3, { message: "Title requires a minimum of 3 characters" }).max(100),
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  surveyDate: z.string().optional(),
  droneModel: z.string().optional(),
  gsd: z.string().optional(),
  flightAltitude: z.string().optional(),
  coordinateSystem: z.string().optional(),
});

function NewInspectionContent() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdInspectionData, setCreatedInspectionData] = useState(null);

  // Phase 2 Upload states
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');

  // Selected files state
  const [tilesetFile, setTilesetFile] = useState(null);
  const [orthoFile, setOrthoFile] = useState(null);
  const [dsmFile, setDsmFile] = useState(null);
  const [reportFile, setReportFile] = useState(null);
  const [glbFile, setGlbFile] = useState(null);
  const [jsonFile, setJsonFile] = useState(null);
  const [rcJsonFile, setRcJsonFile] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(createInspectionSchema),
    defaultValues: {
      title: '',
      description: '',
      visibility: 'PUBLIC',
      surveyDate: new Date().toISOString().split('T')[0],
      droneModel: 'DJI Mavic 3 Enterprise RTK',
      gsd: '1.45',
      flightAltitude: '85',
      coordinateSystem: 'WGS84 / UTM zone 31N (EPSG:32631)',
    }
  });

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const onSubmit = async (data) => {
    setApiError('');
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('access_token');
      const payload = {
        title: data.title,
        visibility: data.visibility || 'PRIVATE',
      };
      if (data.description && data.description.trim()) payload.description = data.description.trim();
      if (data.surveyDate) payload.surveyDate = new Date(data.surveyDate).toISOString();
      if (data.droneModel && data.droneModel.trim()) payload.droneModel = data.droneModel.trim();
      if (data.gsd && !isNaN(parseFloat(data.gsd))) payload.gsd = parseFloat(data.gsd);
      if (data.flightAltitude && !isNaN(parseFloat(data.flightAltitude))) payload.flightAltitude = parseFloat(data.flightAltitude);
      if (data.coordinateSystem && data.coordinateSystem.trim()) payload.coordinateSystem = data.coordinateSystem.trim();

      const response = await fetch(`${API_URL}/projects/${projectId}/inspections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Creation failed');

      setCreatedInspectionData(result);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadFileToMinio = async (inspectionId, file, overrideFileName = null) => {
    const token = localStorage.getItem('access_token');
    const fileName = overrideFileName || file.name;

    const presignRes = await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ fileName })
    });

    if (!presignRes.ok) throw new Error("Failed to secure presigned upload link");
    const { presignedUrl } = await presignRes.json();

    const putRes = await fetch(presignedUrl, {
      method: 'PUT',
      body: file
    });

    if (!putRes.ok) throw new Error(`Failed to upload ${fileName}`);
  };

  const executeUploadPhase = async () => {
    if (!createdInspectionData) return;
    setApiError('');
    setIsSubmitting(true);

    try {
      const inspectionId = createdInspectionData.id;
      const token = localStorage.getItem('access_token');

      const singleFiles = [
        tilesetFile,
        orthoFile,
        dsmFile,
        reportFile,
        glbFile,
        jsonFile,
        thumbnailFile,
        videoFile
      ].filter(Boolean);

      let totalFiles = singleFiles.length + (imageFiles ? imageFiles.length : 0);
      let completed = 0;
      
      if (totalFiles === 0) {
         navigate(`/studio/${inspectionId}`);
         return;
      }

      const incrementProgress = (status) => {
        completed++;
        setUploadProgress(Math.round((completed / totalFiles) * 100));
        if (status) setUploadStatusText(status);
      };

      const tasks = [];

      // 1. 3D Tileset (zip or single file)
      if (tilesetFile) {
        tasks.push((async () => {
          if (tilesetFile.name.endsWith('.zip')) {
            setUploadStatusText('Uploading 3D Tileset bundle (.zip)...');
            await uploadFileToMinio(inspectionId, tilesetFile, 'tileset.zip');
            setUploadStatusText('Extracting 3D Tileset LODs on server...');
            const procRes = await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/process-tileset`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!procRes.ok) {
              console.error("Failed to unpack tileset zip");
            }
          } else {
            setUploadStatusText('Uploading 3D Tileset...');
            await uploadFileToMinio(inspectionId, tilesetFile, `tileset_${tilesetFile.name}`);
            await fetch(`${API_URL}/inspections/${inspectionId}/survey/meta`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ tilesetUrl: `inspections/${inspectionId}/tileset_${tilesetFile.name}` })
            });
          }
          incrementProgress('3D Tileset ready');
        })());
      }

      // 2. Orthomosaic
      if (orthoFile) {
        tasks.push((async () => {
          setUploadStatusText('Uploading Orthoprojection...');
          await uploadFileToMinio(inspectionId, orthoFile, `ortho_${orthoFile.name}`);
          await fetch(`${API_URL}/inspections/${inspectionId}/survey/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ orthoUrl: `inspections/${inspectionId}/ortho_${orthoFile.name}` })
          });
          incrementProgress('Orthomosaic uploaded');
        })());
      }

      // 3. DSM
      if (dsmFile) {
        tasks.push((async () => {
          setUploadStatusText('Uploading DSM elevation model...');
          await uploadFileToMinio(inspectionId, dsmFile, `dsm_${dsmFile.name}`);
          await fetch(`${API_URL}/inspections/${inspectionId}/survey/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ dsmUrl: `inspections/${inspectionId}/dsm_${dsmFile.name}` })
          });
          incrementProgress('DSM uploaded');
        })());
      }

      // 4. RealityScan Report
      if (reportFile) {
        tasks.push((async () => {
          setUploadStatusText('Attaching RealityScan report...');
          await uploadFileToMinio(inspectionId, reportFile, `reports/${reportFile.name}`);
          await fetch(`${API_URL}/inspections/${inspectionId}/survey/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              title: `RealityScan Report (${reportFile.name})`,
              reportType: 'ALIGNMENT',
              fileUrl: `${MINIO_URL}/virtual-inspections/${inspectionId}/reports/${reportFile.name}`
            })
          });
          incrementProgress('Report linked');
        })());
      }

      // 5. GLB Architecture Model
      if (glbFile) {
        tasks.push((async () => {
          setUploadStatusText('Uploading GLB model...');
          await uploadFileToMinio(inspectionId, glbFile, 'ultimate_final.glb');
          await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/process-glb`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          incrementProgress('3D model ready');
        })());
      }

      // 6. 360 Scan Telemetry Coordinates JSON
      if (jsonFile && rcJsonFile) {
        tasks.push((async () => {
          setUploadStatusText('Processing 360 scan coordinate mapping...');
          const mpText = await jsonFile.text();
          const rcText = await rcJsonFile.text();
          await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/process-scans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ mpData: JSON.parse(mpText), rcData: JSON.parse(rcText) })
          });
          incrementProgress('360 Scan registration ready');
        })());
      } else if (jsonFile) {
        tasks.push(
          uploadFileToMinio(inspectionId, jsonFile, 'scans.json').then(() => incrementProgress('360 Scans telemetry uploaded'))
        );
      }

      // 7. Thumbnail Cover
      if (thumbnailFile) {
        tasks.push((async () => {
          await uploadFileToMinio(inspectionId, thumbnailFile, `thumb_${thumbnailFile.name}`);
          await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ thumbnailUrl: `inspections/${inspectionId}/thumb_${thumbnailFile.name}` })
          });
          incrementProgress('Thumbnail ready');
        })());
      }

      // 8. Site Video Tour
      if (videoFile) {
        tasks.push((async () => {
          setUploadStatusText('Uploading Site Tour video...');
          await uploadFileToMinio(inspectionId, videoFile, `video_${videoFile.name}`);
          await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ videoUrl: `inspections/${inspectionId}/video_${videoFile.name}` })
          });
          incrementProgress('Video tour ready');
        })());
      }

      // Execute single file tasks
      await Promise.all(tasks);

      // 9. Batch upload 360 Panorama Cubemaps (20 parallel requests at a time)
      if (imageFiles && imageFiles.length > 0) {
        setUploadStatusText(`Uploading ${imageFiles.length} 360° Panorama cubemaps...`);
        const CONCURRENCY = 20;
        const filesArray = Array.from(imageFiles);
        for (let i = 0; i < filesArray.length; i += CONCURRENCY) {
          const batch = filesArray.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map(async (file) => {
            await uploadFileToMinio(inspectionId, file, `images/${file.name}`);
            incrementProgress();
          }));
        }
      }

      // Navigate straight to Survey Studio!
      navigate(`/studio/${inspectionId}`);

    } catch (err) {
      setApiError(err.message || 'Upload encountered an issue');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="survey-form-container">
      <Navbar />

      <main className="survey-content-wrapper">
        
        {/* Navigation Breadcrumb */}
        <div className="survey-header-nav">
          <div className="survey-breadcrumbs">
            <button onClick={() => navigate('/projects')}>Projects</button>
            <ChevronRight className="h-3.5 w-3.5" />
            <button onClick={() => navigate(`/projects/${projectId}`)}>Chantier Site</button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-cyan-400 font-medium">New Survey Ingestion</span>
          </div>
        </div>

        {/* Hero Card */}
        <div className="survey-hero-card">
          <div>
            <div className="survey-hero-title">
              <Camera className="h-6 w-6 text-cyan-400" />
              New Drone Survey & RealityScan Mission
            </div>
            <p className="survey-hero-subtitle">
              Ingest photogrammetry deliverables (3D Tiles, Orthomosaics, DSM, 360 Scans, QA Reports) into the digital twin platform.
            </p>
          </div>
          <div className="survey-badge-rtk">
            <Radio className="h-3.5 w-3.5 text-cyan-400" />
            RTK &bull; Photogrammetry
          </div>
        </div>

        {/* Step Wizard Bar */}
        <div className="wizard-steps-bar">
          <div className={`wizard-step-item ${!createdInspectionData ? 'active' : 'completed'}`}>
            <span className="wizard-step-number">
              {!createdInspectionData ? '1' : <Check className="h-3.5 w-3.5" />}
            </span>
            <span>Mission Telemetry</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-700" />
          <div className={`wizard-step-item ${createdInspectionData ? 'active' : ''}`}>
            <span className="wizard-step-number">2</span>
            <span>Spatial & 360 Deliverables</span>
          </div>
        </div>

        {apiError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <span className="font-bold">Error:</span>
            <span>{apiError}</span>
          </div>
        )}

        {/* ─── STEP 1: Telemetry Form ─── */}
        {!createdInspectionData && (
          <form onSubmit={handleSubmit(onSubmit)}>
            
            {/* Mission Overview */}
            <div className="survey-section-card">
              <div className="survey-section-header">
                <div className="survey-section-icon">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="survey-section-title">Mission Overview</h3>
                  <p className="survey-section-desc">Identification and general notes for this drone survey flight</p>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label">
                    <span>Flight / Survey Title <span className="req">*</span></span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Flight 04 - Sector A Excavation & Foundations"
                    {...register('title')}
                    className="field-input"
                  />
                  {errors.title && <span className="field-error">{errors.title.message}</span>}
                </div>

                <div className="field-group">
                  <label className="field-label">
                    <span>Survey Flight Date</span>
                  </label>
                  <input
                    type="date"
                    {...register('surveyDate')}
                    className="field-input"
                  />
                </div>
              </div>

              <div className="field-group" style={{ marginBottom: '18px' }}>
                <label className="field-label">
                  <span>Scope Description & Survey Objectives</span>
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Earthwork progress verification, stockpile cut/fill volume calculation and weekly orthomosaic mapping."
                  {...register('description')}
                  className="field-textarea"
                />
              </div>

              <div className="field-group" style={{ maxWidth: '280px' }}>
                <label className="field-label">
                  <span>Access Visibility</span>
                </label>
                <select {...register('visibility')} className="field-select">
                  <option value="PRIVATE">Private (Enterprise Members Only)</option>
                  <option value="PUBLIC">Public (Accessible via share link)</option>
                </select>
              </div>
            </div>

            {/* Hardware & Georeference Specifications */}
            <div className="survey-section-card">
              <div className="survey-section-header">
                <div className="survey-section-icon amber">
                  <Compass className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="survey-section-title">Drone Hardware & Georeferencing</h3>
                  <p className="survey-section-desc">Camera sampling parameters, flight altitude and spatial datum</p>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label">Drone Hardware</label>
                  <input
                    type="text"
                    placeholder="e.g. DJI Mavic 3 Enterprise RTK"
                    {...register('droneModel')}
                    className="field-input"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Ground Sampling Distance (GSD cm/px)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="1.45"
                    {...register('gsd')}
                    className="field-input font-mono"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label">Flight Altitude AGL (meters)</label>
                  <input
                    type="number"
                    step="1"
                    placeholder="85"
                    {...register('flightAltitude')}
                    className="field-input font-mono"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Coordinate Reference System (CRS)</label>
                  <input
                    type="text"
                    placeholder="WGS84 / UTM zone 31N (EPSG:32631)"
                    {...register('coordinateSystem')}
                    className="field-input font-mono"
                  />
                </div>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="survey-submit-btn">
              <span>{isSubmitting ? 'Creating Mission Record...' : 'Proceed to Deliverables Upload'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* ─── STEP 2: Spatial Deliverables Ingestion ─── */}
        {createdInspectionData && (
          <div className="space-y-8">
            
            {/* ── Group 1: Drone GIS & Photogrammetry ── */}
            <div className="survey-section-card">
              <div className="survey-section-header">
                <div className="survey-section-icon purple">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="survey-section-title">1. Drone GIS & Photogrammetry Deliverables</h3>
                  <p className="survey-section-desc">RealityScan 3D tilesets, high-resolution orthomosaics, DSM elevation rasters and alignment QA reports</p>
                </div>
              </div>

              <div className="dropzone-grid">
                
                {/* 1. Cesium 3D Tiles / GLB */}
                <div className={`dropzone-card ${tilesetFile || glbFile ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    accept=".json,.glb,.gltf,.zip"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file?.name.endsWith('.glb') || file?.name.endsWith('.gltf')) {
                        setGlbFile(file);
                      } else {
                        setTilesetFile(file);
                      }
                    }}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">.json / .glb</span>
                    </div>
                    <h4 className="dropzone-title">3D Reality Mesh / 3D Tiles</h4>
                    <p className="dropzone-desc">Cesium 3D Tiles (`tileset.json` / LODs) or GLB architecture model.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {tilesetFile || glbFile ? (
                      <>
                        <span className="dropzone-filename">{(tilesetFile || glbFile).name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{formatFileSize((tilesetFile || glbFile).size)}</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select 3D Tiles</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Orthoprojection / Orthomosaic */}
                <div className={`dropzone-card ${orthoFile ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.tif,.tiff"
                    onChange={(e) => setOrthoFile(e.target.files[0])}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon emerald">
                        <Map className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">.tif / .jpg / .png</span>
                    </div>
                    <h4 className="dropzone-title">Orthoprojection Map</h4>
                    <p className="dropzone-desc">High-resolution georeferenced 2D Orthomosaic map layer.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {orthoFile ? (
                      <>
                        <span className="dropzone-filename">{orthoFile.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(orthoFile.size)}</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select Ortho</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Digital Surface Model (DSM) */}
                <div className={`dropzone-card ${dsmFile ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    accept=".tif,.tiff,.png,.jpg"
                    onChange={(e) => setDsmFile(e.target.files[0])}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon purple">
                        <Layers className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">.tif / .png</span>
                    </div>
                    <h4 className="dropzone-title">Digital Surface Model</h4>
                    <p className="dropzone-desc">Elevation surface raster for hypsometric heatmaps and cross-sections.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {dsmFile ? (
                      <>
                        <span className="dropzone-filename">{dsmFile.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(dsmFile.size)}</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select DSM</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 4. RealityScan Alignment & QA Report */}
                <div className={`dropzone-card ${reportFile ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    accept=".pdf,.html,.htm,.png,.jpg"
                    onChange={(e) => setReportFile(e.target.files[0])}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon blue">
                        <FileText className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">.pdf / .html</span>
                    </div>
                    <h4 className="dropzone-title">Alignment & QA Report</h4>
                    <p className="dropzone-desc">Photogrammetry alignment report, tie points error & calibration PDF.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {reportFile ? (
                      <>
                        <span className="dropzone-filename">{reportFile.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(reportFile.size)}</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select Report</span>
                      </span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* ── Group 2: 360° Ground Survey & Virtual Tour ── */}
            <div className="survey-section-card">
              <div className="survey-section-header">
                <div className="survey-section-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', borderColor: 'rgba(244, 63, 94, 0.3)' }}>
                  <CircleDot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="survey-section-title">2. 360° Ground Survey & Virtual Tour (Red Scan Rings)</h3>
                  <p className="survey-section-desc">Ground camera 360 cubemaps and scan telemetry registration for seamless teleportation rings</p>
                </div>
              </div>

              <div className="dropzone-grid">
                
                {/* 5. Scan Telemetry Coordinates JSON */}
                <div className={`dropzone-card ${jsonFile ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setJsonFile(e.target.files[0])}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon rose">
                        <CircleDot className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">scans.json</span>
                    </div>
                    <h4 className="dropzone-title">Scan Coordinates Telemetry</h4>
                    <p className="dropzone-desc">`scans.json` containing 3D coordinates (x, y, alt) for red scan rings.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {jsonFile ? (
                      <>
                        <span className="dropzone-filename">{jsonFile.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(jsonFile.size)}</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select scans.json</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 6. RealityCapture Scan Registration File (Optional) */}
                <div className={`dropzone-card ${rcJsonFile ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setRcJsonFile(e.target.files[0])}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon amber">
                        <Compass className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">rc_scans.json</span>
                    </div>
                    <h4 className="dropzone-title">RC Registration Matrix (Optional)</h4>
                    <p className="dropzone-desc">RealityCapture scan alignment coordinates for auto-calibration.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {rcJsonFile ? (
                      <>
                        <span className="dropzone-filename">{rcJsonFile.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(rcJsonFile.size)}</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select RC JSON</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 7. 360° Cubemap Panorama Images (Multiple Files) */}
                <div className={`dropzone-card ${imageFiles && imageFiles.length > 0 ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => setImageFiles(Array.from(e.target.files))}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon blue">
                        <FolderOpen className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">Multiple .jpg</span>
                    </div>
                    <h4 className="dropzone-title">360° Panorama Cubemaps</h4>
                    <p className="dropzone-desc">Select all 6-face cubemap images (`&lt;scanId&gt;_face.jpg`) for 360 view.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {imageFiles && imageFiles.length > 0 ? (
                      <>
                        <span className="dropzone-filename">{imageFiles.length} Cubemap files selected</span>
                        <span className="text-[10px] text-emerald-400 font-bold">✓ Ready</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select Panoramas</span>
                      </span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* ── Group 3: Media & Presentation ── */}
            <div className="survey-section-card">
              <div className="survey-section-header">
                <div className="survey-section-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="survey-section-title">3. Media & Presentation</h3>
                  <p className="survey-section-desc">Thumbnail image and optional video walkthrough for dashboard previews</p>
                </div>
              </div>

              <div className="dropzone-grid">
                
                {/* 8. Thumbnail Cover */}
                <div className={`dropzone-card ${thumbnailFile ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setThumbnailFile(e.target.files[0])}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">.jpg / .png</span>
                    </div>
                    <h4 className="dropzone-title">Mission Cover Image</h4>
                    <p className="dropzone-desc">Preview thumbnail image for project cards and dashboard.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {thumbnailFile ? (
                      <>
                        <span className="dropzone-filename">{thumbnailFile.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(thumbnailFile.size)}</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select Image</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 9. Video Tour */}
                <div className={`dropzone-card ${videoFile ? 'has-file' : ''}`}>
                  <input
                    type="file"
                    accept="video/*,.mp4,.mov,.webm"
                    onChange={(e) => setVideoFile(e.target.files[0])}
                    className="dropzone-input"
                  />
                  <div>
                    <div className="dropzone-top">
                      <div className="dropzone-icon emerald">
                        <Video className="h-5 w-5" />
                      </div>
                      <span className="dropzone-format-tag">.mp4 / .mov</span>
                    </div>
                    <h4 className="dropzone-title">Site Walkthrough Video</h4>
                    <p className="dropzone-desc">Optional drone flight recording or walkthrough video.</p>
                  </div>

                  <div className="dropzone-file-status">
                    {videoFile ? (
                      <>
                        <span className="dropzone-filename">{videoFile.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(videoFile.size)}</span>
                      </>
                    ) : (
                      <span className="dropzone-upload-btn">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Select Video</span>
                      </span>
                    )}
                  </div>
                </div>

              </div>

              {/* Progress Box */}
              {isSubmitting && (
                <div className="survey-progress-box">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-cyan-400 font-medium">{uploadStatusText || 'Ingesting spatial deliverables...'}</span>
                    <span className="text-white font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={executeUploadPhase}
              disabled={isSubmitting}
              className="survey-submit-btn"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' }}
            >
              <Upload className="h-4 w-4" />
              <span>{isSubmitting ? 'Uploading Survey Package...' : 'Upload & Launch Survey Studio'}</span>
            </button>

          </div>
        )}

      </main>
    </div>
  );
}

export default function NewInspectionPage() {
  return (
    <ProtectedRoute>
      <NewInspectionContent />
    </ProtectedRoute>
  );
}
