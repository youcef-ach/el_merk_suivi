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
  Radio, 
  ChevronRight, 
  Building2, 
  Plane, 
  ShieldCheck,
  Cpu,
  Image as ImageIcon,
  Boxes,
  FileCheck,
  Zap
} from 'lucide-react';
import './new-inspection.css';
import { API_URL, MINIO_URL } from '../config/api';

export function meta() {
  return [
    { title: "New Digital Twin Mission | VirtualTwin SaaS" },
  ];
}

const createInspectionSchema = z.object({
  type: z.enum(['VIRTUAL_TOUR', 'DRONE_SURVEY']),
  title: z.string().min(3, { message: "Title requires a minimum of 3 characters" }).max(100),
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  surveyDate: z.string().optional(),
  droneModel: z.string().optional(),
  gsd: z.string().optional(),
  flightAltitude: z.string().optional(),
  coordinateSystem: z.string().optional(),
});

const parseCsvOrJson = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Invalid file: No data rows found");
  const delimiter = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    headers.forEach((h, i) => {
      const val = values[i];
      obj[h] = !isNaN(Number(val)) && val !== '' ? Number(val) : val;
    });
    return obj;
  });
};

function NewInspectionContent() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [selectedType, setSelectedType] = useState('VIRTUAL_TOUR');
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
  const [lod1GlbFile, setLod1GlbFile] = useState(null);
  const [panoramasZipFile, setPanoramasZipFile] = useState(null);
  const [jsonFile, setJsonFile] = useState(null);
  const [scanMetadataFile, setScanMetadataFile] = useState(null);
  const [rcJsonFile, setRcJsonFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [compressionMode, setCompressionMode] = useState('uastc');
  const [isPreprocessedAssets, setIsPreprocessedAssets] = useState(true);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(createInspectionSchema),
    defaultValues: {
      type: 'VIRTUAL_TOUR',
      title: '',
      description: '',
      visibility: 'PRIVATE',
      surveyDate: new Date().toISOString().split('T')[0],
      droneModel: 'DJI Mavic 3 Enterprise RTK',
      gsd: '1.45',
      flightAltitude: '85',
      coordinateSystem: 'WGS84 / UTM zone 31N (EPSG:32631)',
    }
  });

  const handleSelectType = (type) => {
    setSelectedType(type);
    setValue('type', type);
  };

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
        type: data.type || selectedType,
        title: data.title,
        visibility: data.visibility || 'PRIVATE',
      };
      if (data.description && data.description.trim()) payload.description = data.description.trim();

      if (data.type === 'DRONE_SURVEY') {
        if (data.surveyDate) payload.surveyDate = new Date(data.surveyDate).toISOString();
        if (data.droneModel && data.droneModel.trim()) payload.droneModel = data.droneModel.trim();
        if (data.gsd && !isNaN(parseFloat(data.gsd))) payload.gsd = parseFloat(data.gsd);
        if (data.flightAltitude && !isNaN(parseFloat(data.flightAltitude))) payload.flightAltitude = parseFloat(data.flightAltitude);
        if (data.coordinateSystem && data.coordinateSystem.trim()) payload.coordinateSystem = data.coordinateSystem.trim();
      }

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

  const uploadFileToMinio = async (inspectionId, file, overrideFileName = null, onProgress = null) => {
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

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignedUrl, true);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded, e.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Failed to upload ${fileName} (HTTP ${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error(`Network error uploading ${fileName}. Check internet connection.`));
      xhr.ontimeout = () => reject(new Error(`Upload timed out for ${fileName}`));
      xhr.timeout = 1800000; // 30 minutes for large multi-hundred-megabyte files
      xhr.send(file);
    });
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
        lod1GlbFile,
        panoramasZipFile,
        jsonFile,
        scanMetadataFile,
        thumbnailFile
      ].filter(Boolean);

      if (singleFiles.length === 0) {
        navigate(`/engine/${inspectionId}`);
        return;
      }

      // Helper to format bytes
      const fmtMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

      // ── SPECIAL FAST INGESTION FOR PRE-PROCESSED VIRTUAL TOUR DELIVERABLES ──
      if (selectedType === 'VIRTUAL_TOUR' && isPreprocessedAssets) {
        // 1. Thumbnail Cover
        if (thumbnailFile) {
          setUploadStatusText('Uploading preview thumbnail...');
          await uploadFileToMinio(inspectionId, thumbnailFile, `thumb_${thumbnailFile.name}`);
          await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ thumbnailUrl: `inspections/${inspectionId}/thumb_${thumbnailFile.name}` })
          });
        }

        // 2. Scan Telemetry (scans.json)
        if (jsonFile) {
          setUploadStatusText('Uploading scan coordinates (scans.json)...');
          await uploadFileToMinio(inspectionId, jsonFile, 'scans.json');
        }

        // 3. Scan Metadata (scan_metadata.json)
        if (scanMetadataFile) {
          setUploadStatusText('Uploading scan metadata (scan_metadata.json)...');
          await uploadFileToMinio(inspectionId, scanMetadataFile, 'scan_metadata.json');
        }

        // 4. Pre-Optimized Master 3D Model (model.glb)
        if (glbFile) {
          setUploadStatusText(`Uploading optimized 3D model (${fmtMb(glbFile.size)} MB)...`);
          await uploadFileToMinio(inspectionId, glbFile, 'model.glb', (loaded, total) => {
            const pct = Math.round((loaded / total) * 100);
            setUploadProgress(pct);
            setUploadStatusText(`Uploading 3D Model: ${fmtMb(loaded)} MB / ${fmtMb(total)} MB (${pct}%)...`);
          });
        }

        // 5. Mobile LOD1 Model (model_lod1.glb) if provided
        if (lod1GlbFile) {
          setUploadStatusText(`Uploading mobile LOD1 model (${fmtMb(lod1GlbFile.size)} MB)...`);
          await uploadFileToMinio(inspectionId, lod1GlbFile, 'model_lod1.glb', (loaded, total) => {
            const pct = Math.round((loaded / total) * 100);
            setUploadProgress(pct);
            setUploadStatusText(`Uploading Mobile LOD1: ${fmtMb(loaded)} MB / ${fmtMb(total)} MB (${pct}%)...`);
          });
        }

        // 6. Pre-Processed Panoramas Archive (panoramas.zip)
        if (panoramasZipFile) {
          setUploadStatusText(`Uploading 360° Panoramas Package (${fmtMb(panoramasZipFile.size)} MB)...`);
          await uploadFileToMinio(inspectionId, panoramasZipFile, 'panoramas.zip', (loaded, total) => {
            const pct = Math.round((loaded / total) * 100);
            setUploadProgress(pct);
            setUploadStatusText(`Uploading 360° Panoramas: ${fmtMb(loaded)} MB / ${fmtMb(total)} MB (${pct}%)...`);
          });

          setUploadStatusText('Direct ingestion: unpacking cubemaps & KTX2 textures on server...');
          await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/process-panoramas`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }

        // Brief poll for fast unpack completion (takes 2-4 seconds)
        setUploadStatusText('Finalizing pre-processed tour registration...');
        let finished = false;
        let pollCount = 0;
        while (!finished && pollCount < 20) {
          pollCount++;
          await new Promise(r => setTimeout(r, 1000));
          try {
            const statusRes = await fetch(`${API_URL}/inspections/${inspectionId}/processing-status`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.processingStatus === 'COMPLETED') {
                finished = true;
              } else if (statusData.processingStage) {
                setUploadStatusText(statusData.processingStage);
              }
            }
          } catch (e) {
            // Ignore temporary blips
          }
        }

        setUploadStatusText('Virtual Tour ready! Launching 3D Viewer...');
        setUploadProgress(100);
        await new Promise(r => setTimeout(r, 600));
        navigate(`/engine/${inspectionId}`);
        return;
      }

      // ── 1. Thumbnail (Fast) ──
      if (thumbnailFile) {
        setUploadStatusText('Uploading preview thumbnail...');
        await uploadFileToMinio(inspectionId, thumbnailFile, `thumb_${thumbnailFile.name}`);
        await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ thumbnailUrl: `inspections/${inspectionId}/thumb_${thumbnailFile.name}` })
        });
      }

      // ── 2. Telemetry Coordinates (scans.json) ──
      if (jsonFile && rcJsonFile) {
        setUploadStatusText('Aligning Matterport and scanner coordinates...');
        const mpText = await jsonFile.text();
        const rcText = await rcJsonFile.text();
        const mpData = parseCsvOrJson(mpText);
        const rcData = parseCsvOrJson(rcText);

        const processRes = await fetch(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/process-scans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ mpData, rcData })
        });
        if (!processRes.ok) {
          const errJson = await processRes.json().catch(() => ({}));
          throw new Error(errJson.message || 'Failed to align scan coordinates');
        }
      } else if (jsonFile) {
        setUploadStatusText('Uploading scan coordinates (scans.json)...');
        await uploadFileToMinio(inspectionId, jsonFile, 'scans.json');
      }

      // ── 3. Survey Documents & Ortho/DSM ──
      if (reportFile) {
        setUploadStatusText('Attaching Survey Report...');
        await uploadFileToMinio(inspectionId, reportFile, `reports/${reportFile.name}`);
        await fetch(`${API_URL}/inspections/${inspectionId}/survey/reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            title: `Survey Report (${reportFile.name})`,
            reportType: 'ALIGNMENT',
            fileUrl: `${MINIO_URL}/virtual-inspections/${inspectionId}/reports/${reportFile.name}`
          })
        });
      }

      if (orthoFile) {
        setUploadStatusText('Uploading Orthomosaic raster...');
        await uploadFileToMinio(inspectionId, orthoFile, `ortho_${orthoFile.name}`);
        await fetch(`${API_URL}/inspections/${inspectionId}/survey/meta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ orthoUrl: `inspections/${inspectionId}/ortho_${orthoFile.name}` })
        });
      }

      if (dsmFile) {
        setUploadStatusText('Uploading DSM elevation raster...');
        await uploadFileToMinio(inspectionId, dsmFile, `dsm_${dsmFile.name}`);
        await fetch(`${API_URL}/inspections/${inspectionId}/survey/meta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ dsmUrl: `inspections/${inspectionId}/dsm_${dsmFile.name}` })
        });
      }

      // ── 4. 3D Model (OBJ / GLB / ZIP) Sequential with byte progress ──
      // Resilient background trigger helper with exponential backoff
      const postWithRetry = async (url, options = {}, desc = 'Processing request', retries = 4) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const res = await fetch(url, options);
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              console.warn(`[NewInspection] ${desc} returned HTTP ${res.status}: ${text}`);
            }
            return res;
          } catch (err) {
            if (attempt === retries) throw err;
            console.warn(`[NewInspection] ${desc} network attempt ${attempt} failed, retrying in ${2 * attempt}s...`, err.message);
            await new Promise(r => setTimeout(r, 2000 * attempt));
          }
        }
      };

      if (glbFile) {
        const isZip = glbFile.name.endsWith('.zip');
        const isObj = glbFile.name.endsWith('.obj');
        const isGltf = glbFile.name.endsWith('.gltf');
        const targetName = isZip ? 'model.zip' : (isObj ? 'model.obj' : (isGltf ? 'model.gltf' : 'model.glb'));

        setUploadStatusText(`Uploading 3D model (${fmtMb(glbFile.size)} MB)...`);
        await uploadFileToMinio(inspectionId, glbFile, targetName, (loaded, total) => {
          const pct = Math.round((loaded / total) * 100);
          setUploadProgress(pct);
          setUploadStatusText(`Uploading 3D Model: ${fmtMb(loaded)} MB / ${fmtMb(total)} MB (${pct}%)...`);
        });

        setUploadStatusText('Queuing 3D model decimation and KTX2 compression in background...');
        await postWithRetry(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/process-glb`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ fileName: targetName, compressionMode })
        }, 'Queuing 3D model processing');
      }

      // ── 5. 360° Panoramas & Cubemaps (panoramas.zip) Sequential with byte progress ──
      if (panoramasZipFile) {
        setUploadStatusText(`Uploading 360° Panoramas (${fmtMb(panoramasZipFile.size)} MB)...`);
        await uploadFileToMinio(inspectionId, panoramasZipFile, 'panoramas.zip', (loaded, total) => {
          const pct = Math.round((loaded / total) * 100);
          setUploadProgress(pct);
          setUploadStatusText(`Uploading 360° Panoramas: ${fmtMb(loaded)} MB / ${fmtMb(total)} MB (${pct}%)...`);
        });

        setUploadStatusText('Queuing multi-LOD cubemaps & KTX2 generation in background...');
        await postWithRetry(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/process-panoramas`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }, 'Queuing panorama processing');
      }

      // ── 6. 3D Tileset (if present) ──
      if (tilesetFile) {
        setUploadStatusText(`Uploading 3D Tileset (${fmtMb(tilesetFile.size)} MB)...`);
        if (tilesetFile.name.endsWith('.zip')) {
          await uploadFileToMinio(inspectionId, tilesetFile, 'tileset.zip', (loaded, total) => {
            const pct = Math.round((loaded / total) * 100);
            setUploadProgress(pct);
            setUploadStatusText(`Uploading 3D Tileset: ${fmtMb(loaded)} MB / ${fmtMb(total)} MB (${pct}%)...`);
          });
          setUploadStatusText('Extracting 3D Tileset LODs on server...');
          await postWithRetry(`${API_URL}/projects/${projectId}/inspections/${inspectionId}/process-tileset`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }, 'Queuing tileset processing');
        } else {
          await uploadFileToMinio(inspectionId, tilesetFile, `tileset_${tilesetFile.name}`);
          await fetch(`${API_URL}/inspections/${inspectionId}/survey/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ tilesetUrl: `inspections/${inspectionId}/tileset_${tilesetFile.name}` })
          });
        }
      }

      // If background processing jobs were queued, poll processing-status until complete
      const hasBackgroundJobs = Boolean(glbFile || panoramasZipFile || tilesetFile);
      if (hasBackgroundJobs) {
        setUploadStatusText('Assets uploaded. Initializing background optimization queue...');
        let finished = false;
        const startTime = Date.now();

        while (!finished) {
          await new Promise(r => setTimeout(r, 1500));
          try {
            const statusRes = await fetch(`${API_URL}/inspections/${inspectionId}/processing-status`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.processingStatus === 'PROCESSING' || statusData.processingStatus === 'QUEUED') {
                if (statusData.processingStage) {
                  setUploadStatusText(statusData.processingStage);
                }
                if (typeof statusData.processingProgress === 'number' && statusData.processingProgress > 0) {
                  setUploadProgress(statusData.processingProgress);
                }
              } else if (statusData.processingStatus === 'COMPLETED') {
                setUploadProgress(100);
                setUploadStatusText('3D Digital Twin optimized successfully! Opening engine...');
                finished = true;
              } else if (statusData.processingStatus === 'FAILED') {
                throw new Error(statusData.processingError || 'Background asset optimization failed on server');
              }
            }
          } catch (pollErr) {
            console.warn('Status poll warning:', pollErr);
            if (pollErr.message && pollErr.message.includes('Background asset optimization failed')) {
              throw pollErr;
            }
            if (Date.now() - startTime > 15 * 60 * 1000) {
              throw new Error('Processing timed out after 15 minutes');
            }
          }
        }
      } else {
        setUploadStatusText('Ingestion Complete! Redirecting to Digital Twin Engine...');
      }

      setTimeout(() => {
        navigate(`/engine/${inspectionId}`);
      }, 1200);

    } catch (err) {
      setApiError(err.message);
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
            <button onClick={() => navigate(`/projects/${projectId}`)}>Project Inspections</button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-cyan-400 font-medium">New Digital Twin Mission</span>
          </div>
        </div>

        {/* Step Wizard Bar */}
        <div className="wizard-steps-bar">
          <div className={`wizard-step-item ${!createdInspectionData ? 'active' : 'completed'}`}>
            <span className="wizard-step-number">
              {!createdInspectionData ? '1' : <Check className="h-3.5 w-3.5" />}
            </span>
            <span>Mission Specification</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-700" />
          <div className={`wizard-step-item ${createdInspectionData ? 'active' : ''}`}>
            <span className="wizard-step-number">2</span>
            <span>Deliverables & 3D Assets</span>
          </div>
        </div>

        {apiError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <span className="font-bold">Error:</span>
            <span>{apiError}</span>
          </div>
        )}

        {/* ─── STEP 1: Purpose Selection & Mission Overview ─── */}
        {!createdInspectionData && (
          <form onSubmit={handleSubmit(onSubmit)}>
            
            {/* 1. PURPOSE SELECTOR CARDS */}
            <div style={{ marginBottom: '28px' }}>
              <label className="field-label" style={{ marginBottom: '14px', fontSize: '14px' }}>
                Select Mission Purpose & Technology Stack
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                
                {/* Card A: Industrial Virtual Tour */}
                <div 
                  onClick={() => handleSelectType('VIRTUAL_TOUR')}
                  style={{
                    padding: '24px',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    background: selectedType === 'VIRTUAL_TOUR' ? 'rgba(6, 182, 212, 0.12)' : 'rgba(15, 23, 42, 0.6)',
                    border: selectedType === 'VIRTUAL_TOUR' ? '2px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: selectedType === 'VIRTUAL_TOUR' ? '0 0 25px rgba(6, 182, 212, 0.2)' : 'none',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(6, 182, 212, 0.2)', color: '#38bdf8' }}>
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>Industrial Virtual Tour</h4>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Factories, Plants & Indoor Facilities</span>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>
                    Matterport-style 360° tour with projective mesh transitions, equipment tags, safety zones, and 3D indoor measurements.
                  </p>
                  {selectedType === 'VIRTUAL_TOUR' && (
                    <div style={{ position: 'absolute', top: '16px', right: '16px', color: '#06b6d4' }}>
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  )}
                </div>

                {/* Card B: Drone Photogrammetry & Site Survey */}
                <div 
                  onClick={() => handleSelectType('DRONE_SURVEY')}
                  style={{
                    padding: '24px',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    background: selectedType === 'DRONE_SURVEY' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(15, 23, 42, 0.6)',
                    border: selectedType === 'DRONE_SURVEY' ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: selectedType === 'DRONE_SURVEY' ? '0 0 25px rgba(16, 185, 129, 0.2)' : 'none',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                      <Plane className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>Drone Photogrammetry & GIS</h4>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Construction Sites & Earthworks</span>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>
                    Reality capture with Cesium 3D Tiles, 2D Orthomosaics, elevation heatmaps, slope stability, and earthwork cut/fill calculation.
                  </p>
                  {selectedType === 'DRONE_SURVEY' && (
                    <div style={{ position: 'absolute', top: '16px', right: '16px', color: '#10b981' }}>
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mission Overview Fields */}
            <div className="survey-section-card">
              <div className="survey-section-header">
                <div className="survey-section-icon">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="survey-section-title">Mission Overview</h3>
                  <p className="survey-section-desc">Identification and general parameters for this inspection</p>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label">
                    <span>Title <span className="req">*</span></span>
                  </label>
                  <input
                    type="text"
                    placeholder={selectedType === 'VIRTUAL_TOUR' ? "e.g. Factory Hall A - Turbines & Assembly Line" : "e.g. Sector B Excavation & Foundation Survey"}
                    {...register('title')}
                    className="field-input"
                  />
                  {errors.title && <span className="field-error">{errors.title.message}</span>}
                </div>

                <div className="field-group">
                  <label className="field-label">
                    <span>Access Visibility</span>
                  </label>
                  <select {...register('visibility')} className="field-select">
                    <option value="PRIVATE">Private (Enterprise Members Only)</option>
                    <option value="PUBLIC">Public (Accessible via link)</option>
                  </select>
                </div>
              </div>

              <div className="field-group" style={{ marginBottom: '18px' }}>
                <label className="field-label">
                  <span>Scope Description & Objectives</span>
                </label>
                <textarea
                  rows="2"
                  placeholder={selectedType === 'VIRTUAL_TOUR' ? "e.g. High-definition spatial digital twin for equipment maintenance tracking and safety training." : "e.g. Weekly earthwork cut/fill volume calculation and orthomosaic verification."}
                  {...register('description')}
                  className="field-textarea"
                />
              </div>
            </div>

            {/* Drone Specific Specifications */}
            {selectedType === 'DRONE_SURVEY' && (
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
                      className="field-input"
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Flight Altitude (AGL meters)</label>
                    <input
                      type="number"
                      placeholder="85"
                      {...register('flightAltitude')}
                      className="field-input"
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Coordinate Reference System</label>
                    <input
                      type="text"
                      placeholder="WGS84 / UTM zone 31N (EPSG:32631)"
                      {...register('coordinateSystem')}
                      className="field-input"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="btn-primary-gradient"
                style={{ padding: '12px 28px', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              >
                <span>Continue to 3D Deliverables</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {/* ─── STEP 2: Deliverables Upload Dropzones ─── */}
        {createdInspectionData && (
          <div>
            <div className="survey-section-card" style={{ marginBottom: '24px' }}>
              <div className="survey-section-header">
                <div className="survey-section-icon cyan">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="survey-section-title">
                    {selectedType === 'VIRTUAL_TOUR' ? 'Upload 3D Factory Assets' : 'Upload Photogrammetry Deliverables'}
                  </h3>
                  <p className="survey-section-desc">
                    Attach deliverables for <strong>{createdInspectionData.title}</strong>
                  </p>
                </div>
              </div>

              {/* ─── VIRTUAL TOUR DELIVERABLES ─── */}
              {selectedType === 'VIRTUAL_TOUR' && (
                <div>
                  {/* Prompt: Pre-Processed Assets vs Raw Assets */}
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <label className="field-label" style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                        Virtual Tour Asset Ingestion Mode
                      </label>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Choose whether your assets are already processed or require server transcoding
                      </span>
                    </div>

                    <div className="prompt-selector-grid">
                      {/* Option 1: Already Processed Assets (Recommended) */}
                      <div
                        onClick={() => setIsPreprocessedAssets(true)}
                        style={{
                          padding: '18px 20px',
                          borderRadius: '14px',
                          cursor: 'pointer',
                          background: isPreprocessedAssets ? 'rgba(6, 182, 212, 0.12)' : 'rgba(15, 23, 42, 0.5)',
                          border: isPreprocessedAssets ? '2px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                          boxShadow: isPreprocessedAssets ? '0 0 20px rgba(6, 182, 212, 0.18)' : 'none',
                          transition: 'all 0.2s',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ padding: '8px', borderRadius: '10px', background: isPreprocessedAssets ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.05)', color: '#38bdf8' }}>
                              <Zap className="h-5 w-5" />
                            </div>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                                Upload Already Processed Deliverables
                              </h4>
                              <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600 }}>
                                Fast Direct Ingestion • Ready in Seconds
                              </span>
                            </div>
                          </div>
                          {isPreprocessedAssets && (
                            <div style={{ color: '#06b6d4' }}>
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                          Upload deliverables already generated by the pipeline (<code style={{ color: '#38bdf8' }}>panoramas.zip</code>, <code style={{ color: '#38bdf8' }}>model.glb</code>, <code style={{ color: '#38bdf8' }}>scans.json</code>). Bypasses server transcoding.
                        </p>
                      </div>

                      {/* Option 2: Raw Scan Assets (Process on Server) */}
                      <div
                        onClick={() => setIsPreprocessedAssets(false)}
                        style={{
                          padding: '18px 20px',
                          borderRadius: '14px',
                          cursor: 'pointer',
                          background: !isPreprocessedAssets ? 'rgba(168, 85, 247, 0.12)' : 'rgba(15, 23, 42, 0.5)',
                          border: !isPreprocessedAssets ? '2px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
                          boxShadow: !isPreprocessedAssets ? '0 0 20px rgba(168, 85, 247, 0.18)' : 'none',
                          transition: 'all 0.2s',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ padding: '8px', borderRadius: '10px', background: !isPreprocessedAssets ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255, 255, 255, 0.05)', color: '#c084fc' }}>
                              <Cpu className="h-5 w-5" />
                            </div>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                                Process Raw Assets on Server
                              </h4>
                              <span style={{ fontSize: '11px', color: '#c084fc', fontWeight: 600 }}>
                                Cloud Transcoding • Server Pipeline
                              </span>
                            </div>
                          </div>
                          {!isPreprocessedAssets && (
                            <div style={{ color: '#a855f7' }}>
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                          Upload raw meshes (.glb/.obj/.zip) and raw panoramas. The cloud server will transcode cubemaps and compress textures to Basis Universal KTX2.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ─── CASE A: PRE-PROCESSED DELIVERABLES DROPZONES ─── */}
                  {isPreprocessedAssets ? (
                    <div>
                      <div className="fast-ingestion-banner">
                        <Zap className="h-5 w-5 text-cyan-400 flex-shrink-0" />
                        <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' }}>
                          <strong style={{ color: '#38bdf8' }}>Fast Direct Ingestion Active:</strong> Assets will be stored directly to MinIO storage. You can select the files generated in <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', color: '#34d399' }}>d:\3d-viewer\processed_tour_deliverables\</code>.
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* 1. Panoramas ZIP (panoramas.zip) */}
                        <div className={`upload-dropzone-box ${panoramasZipFile ? 'has-file' : ''}`}>
                          <div className="dropzone-icon-circle" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                            <Camera className="h-6 w-6 text-emerald-400" />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <h4 className="dropzone-title">Panoramas Archive (.zip)</h4>
                            <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>Required</span>
                          </div>
                          <p className="dropzone-desc">panoramas.zip with all 198 stations, cubemaps & KTX2</p>
                          <input 
                            type="file" 
                            accept=".zip"
                            onChange={(e) => setPanoramasZipFile(e.target.files[0])}
                            className="dropzone-file-input"
                          />
                          {panoramasZipFile && (
                            <div className="file-ready-badge">
                              {panoramasZipFile.name} ({formatFileSize(panoramasZipFile.size)})
                            </div>
                          )}
                        </div>

                        {/* 2. Master 3D Model (model.glb) */}
                        <div className={`upload-dropzone-box ${glbFile ? 'has-file' : ''}`}>
                          <div className="dropzone-icon-circle" style={{ background: 'rgba(6, 182, 212, 0.15)' }}>
                            <Boxes className="h-6 w-6 text-cyan-400" />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <h4 className="dropzone-title">Master 3D Model (model.glb)</h4>
                            <span style={{ fontSize: '10px', background: 'rgba(6, 182, 212, 0.2)', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>Required</span>
                          </div>
                          <p className="dropzone-desc">Pre-optimized Draco GLB master mesh for desktop</p>
                          <input 
                            type="file" 
                            accept=".glb"
                            onChange={(e) => setGlbFile(e.target.files[0])}
                            className="dropzone-file-input"
                          />
                          {glbFile && (
                            <div className="file-ready-badge">
                              {glbFile.name} ({formatFileSize(glbFile.size)})
                            </div>
                          )}
                        </div>

                        {/* 3. Mobile LOD1 Model (model_lod1.glb) */}
                        <div className={`upload-dropzone-box ${lod1GlbFile ? 'has-file' : ''}`}>
                          <div className="dropzone-icon-circle" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
                            <Cpu className="h-6 w-6 text-amber-400" />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <h4 className="dropzone-title">Mobile LOD1 Model (.glb)</h4>
                            <span style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Mobile LOD</span>
                          </div>
                          <p className="dropzone-desc">model_lod1.glb lightweight mesh for phones & tablets</p>
                          <input 
                            type="file" 
                            accept=".glb"
                            onChange={(e) => setLod1GlbFile(e.target.files[0])}
                            className="dropzone-file-input"
                          />
                          {lod1GlbFile && (
                            <div className="file-ready-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.35)' }}>
                              {lod1GlbFile.name} ({formatFileSize(lod1GlbFile.size)})
                            </div>
                          )}
                        </div>

                        {/* 4. Scan Coordinates (scans.json) */}
                        <div className={`upload-dropzone-box ${jsonFile ? 'has-file' : ''}`}>
                          <div className="dropzone-icon-circle" style={{ background: 'rgba(99, 102, 241, 0.15)' }}>
                            <FileCheck className="h-6 w-6 text-indigo-400" />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <h4 className="dropzone-title">Scan Telemetry (scans.json)</h4>
                            <span style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>Required</span>
                          </div>
                          <p className="dropzone-desc">Scanner positions & quaternions coordinate data</p>
                          <input 
                            type="file" 
                            accept=".json,.csv"
                            onChange={(e) => setJsonFile(e.target.files[0])}
                            className="dropzone-file-input"
                          />
                          {jsonFile && (
                            <div className="file-ready-badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', borderColor: 'rgba(99, 102, 241, 0.35)' }}>
                              {jsonFile.name} ({formatFileSize(jsonFile.size)})
                            </div>
                          )}
                        </div>

                        {/* 5. Scan Metadata (scan_metadata.json) */}
                        <div className={`upload-dropzone-box ${scanMetadataFile ? 'has-file' : ''}`}>
                          <div className="dropzone-icon-circle" style={{ background: 'rgba(168, 85, 247, 0.15)' }}>
                            <FileText className="h-6 w-6 text-purple-400" />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <h4 className="dropzone-title">Multi-Res Manifest (.json)</h4>
                            <span style={{ fontSize: '10px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Multi-Res</span>
                          </div>
                          <p className="dropzone-desc">scan_metadata.json resolution index and manifests</p>
                          <input 
                            type="file" 
                            accept=".json"
                            onChange={(e) => setScanMetadataFile(e.target.files[0])}
                            className="dropzone-file-input"
                          />
                          {scanMetadataFile && (
                            <div className="file-ready-badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', borderColor: 'rgba(168, 85, 247, 0.4)' }}>
                              {scanMetadataFile.name} ({formatFileSize(scanMetadataFile.size)})
                            </div>
                          )}
                        </div>

                        {/* 6. Dashboard Cover Thumbnail (thumbnail.jpg) */}
                        <div className={`upload-dropzone-box ${thumbnailFile ? 'has-file' : ''}`}>
                          <div className="dropzone-icon-circle" style={{ background: 'rgba(244, 63, 94, 0.15)' }}>
                            <ImageIcon className="h-6 w-6 text-rose-400" />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <h4 className="dropzone-title">Cover Thumbnail (.jpg / .png)</h4>
                            <span style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.1)', color: '#94a3b8', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Optional</span>
                          </div>
                          <p className="dropzone-desc">thumbnail.jpg preview image for project list</p>
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={(e) => setThumbnailFile(e.target.files[0])}
                            className="dropzone-file-input"
                          />
                          {thumbnailFile && (
                            <div className="file-ready-badge" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', borderColor: 'rgba(244, 63, 94, 0.35)' }}>
                              {thumbnailFile.name} ({formatFileSize(thumbnailFile.size)})
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ─── CASE B: RAW UPLOAD & SERVER PROCESSING DROPZONES ─── */
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {/* 1. 3D Building Mesh (GLB / OBJ / ZIP) */}
                      <div className="upload-dropzone-box">
                        <div className="dropzone-icon-circle">
                          <Boxes className="h-6 w-6 text-cyan-400" />
                        </div>
                        <h4 className="dropzone-title">3D Building Mesh (.glb, .obj, .zip)</h4>
                        <p className="dropzone-desc">Matterport OBJ/ZIP or GLB (Auto-converted & Draco compressed)</p>
                        <input 
                          type="file" 
                          accept=".glb,.gltf,.obj,.zip"
                          onChange={(e) => setGlbFile(e.target.files[0])}
                          className="dropzone-file-input"
                        />
                        {glbFile && <div className="file-ready-badge">{glbFile.name} ({formatFileSize(glbFile.size)})</div>}
                      </div>

                      {/* 3D Texture Compression Profile Selector */}
                      <div style={{ gridColumn: '1 / -1', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px 20px', marginTop: '4px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <Cpu className="h-4 w-4 text-cyan-400" />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            3D Mesh Texture Compression Profile (KTX2 Basis Universal)
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          {/* UASTC Card */}
                          <div 
                            onClick={() => setCompressionMode('uastc')}
                            style={{
                              border: compressionMode === 'uastc' ? '2px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.1)',
                              background: compressionMode === 'uastc' ? 'rgba(6, 182, 212, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                              borderRadius: '10px',
                              padding: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px', color: compressionMode === 'uastc' ? '#38bdf8' : '#e2e8f0' }}>
                                🏭 Industrial Facility (UASTC)
                              </span>
                              <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                Recommended
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                              Photorealistic 8-bit RGBA fidelity. Preserves razor-sharp pipe labels, equipment gauges, and metallic machinery reflections with 75% VRAM savings.
                            </p>
                          </div>

                          {/* ETC1S Card */}
                          <div 
                            onClick={() => setCompressionMode('etc1s')}
                            style={{
                              border: compressionMode === 'etc1s' ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                              background: compressionMode === 'etc1s' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                              borderRadius: '10px',
                              padding: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px', color: compressionMode === 'etc1s' ? '#34d399' : '#e2e8f0' }}>
                                🚜 Construction Site & Terrain (ETC1S)
                              </span>
                              <span style={{ fontSize: '11px', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                Ultra Compact
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                              Extreme vector-quantized compression (up to 75% smaller files). Ideal for massive outdoor construction sites, dirt terrains, quarries, and weak 4G/5G connections.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 2. 360° Panoramas & Cubemaps Package (panoramas.zip) */}
                      <div className="upload-dropzone-box">
                        <div className="dropzone-icon-circle">
                          <Camera className="h-6 w-6 text-emerald-400" />
                        </div>
                        <h4 className="dropzone-title">360° Panoramas & Cubemaps (.zip)</h4>
                        <p className="dropzone-desc">Extracted cubemaps & transition panoramas package</p>
                        <input 
                          type="file" 
                          accept=".zip"
                          onChange={(e) => setPanoramasZipFile(e.target.files[0])}
                          className="dropzone-file-input"
                        />
                        {panoramasZipFile && <div className="file-ready-badge">{panoramasZipFile.name} ({formatFileSize(panoramasZipFile.size)})</div>}
                      </div>

                      {/* 3. Scans Telemetry JSON / CSV */}
                      <div className="upload-dropzone-box">
                        <div className="dropzone-icon-circle">
                          <FileCheck className="h-6 w-6 text-indigo-400" />
                        </div>
                        <h4 className="dropzone-title">Scan Telemetry (scans.json)</h4>
                        <p className="dropzone-desc">E57 / Matterport scanner coordinates & quaternions</p>
                        <input 
                          type="file" 
                          accept=".json,.csv"
                          onChange={(e) => setJsonFile(e.target.files[0])}
                          className="dropzone-file-input"
                        />
                        {jsonFile && <div className="file-ready-badge">{jsonFile.name} ({formatFileSize(jsonFile.size)})</div>}
                      </div>

                      {/* 4. Software Registration */}
                      <div className="upload-dropzone-box" style={{ border: rcJsonFile ? '1px solid #a855f7' : '1px dashed rgba(255, 255, 255, 0.15)' }}>
                        <div className="dropzone-icon-circle" style={{ background: 'rgba(168, 85, 247, 0.15)' }}>
                          <Compass className="h-6 w-6 text-purple-400" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <h4 className="dropzone-title">Software Registration (.json, .csv)</h4>
                          <span style={{ fontSize: '10px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Optional</span>
                        </div>
                        <p className="dropzone-desc">RealityCapture / Metashape camera export to realign coordinates</p>
                        <input 
                          type="file" 
                          accept=".json,.csv"
                          onChange={(e) => setRcJsonFile(e.target.files[0])}
                          className="dropzone-file-input"
                        />
                        {rcJsonFile && <div className="file-ready-badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.4)' }}>{rcJsonFile.name} ({formatFileSize(rcJsonFile.size)})</div>}
                      </div>

                      {/* 5. Thumbnail Cover */}
                      <div className="upload-dropzone-box">
                        <div className="dropzone-icon-circle">
                          <ImageIcon className="h-6 w-6 text-amber-400" />
                        </div>
                        <h4 className="dropzone-title">Cover Thumbnail (.jpg / .png)</h4>
                        <p className="dropzone-desc">Preview image for the project dashboard</p>
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => setThumbnailFile(e.target.files[0])}
                          className="dropzone-file-input"
                        />
                        {thumbnailFile && <div className="file-ready-badge">{thumbnailFile.name}</div>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── DRONE SURVEY DELIVERABLES ─── */}
              {selectedType === 'DRONE_SURVEY' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  
                  {/* Cesium 3D Tileset */}
                  <div className="upload-dropzone-box">
                    <div className="dropzone-icon-circle">
                      <Layers className="h-6 w-6 text-cyan-400" />
                    </div>
                    <h4 className="dropzone-title">Cesium 3D Tiles (tileset.zip)</h4>
                    <p className="dropzone-desc">RealityScan / Pix4D continuous LOD mesh</p>
                    <input 
                      type="file" 
                      accept=".zip,.json"
                      onChange={(e) => setTilesetFile(e.target.files[0])}
                      className="dropzone-file-input"
                    />
                    {tilesetFile && <div className="file-ready-badge">{tilesetFile.name} ({formatFileSize(tilesetFile.size)})</div>}
                  </div>

                  {/* 2D Orthomosaic */}
                  <div className="upload-dropzone-box">
                    <div className="dropzone-icon-circle">
                      <Map className="h-6 w-6 text-emerald-400" />
                    </div>
                    <h4 className="dropzone-title">2D Orthomosaic (.tif / .png)</h4>
                    <p className="dropzone-desc">High-resolution georeferenced orthoprojection</p>
                    <input 
                      type="file" 
                      accept=".tif,.tiff,.png,.jpg"
                      onChange={(e) => setOrthoFile(e.target.files[0])}
                      className="dropzone-file-input"
                    />
                    {orthoFile && <div className="file-ready-badge">{orthoFile.name} ({formatFileSize(orthoFile.size)})</div>}
                  </div>

                  {/* DSM / DTM Elevation GeoTIFF */}
                  <div className="upload-dropzone-box">
                    <div className="dropzone-icon-circle">
                      <Sparkles className="h-6 w-6 text-amber-400" />
                    </div>
                    <h4 className="dropzone-title">DSM / DTM Elevation Model</h4>
                    <p className="dropzone-desc">Digital surface/terrain raster GeoTIFF</p>
                    <input 
                      type="file" 
                      accept=".tif,.tiff"
                      onChange={(e) => setDsmFile(e.target.files[0])}
                      className="dropzone-file-input"
                    />
                    {dsmFile && <div className="file-ready-badge">{dsmFile.name}</div>}
                  </div>

                  {/* Survey Quality Report */}
                  <div className="upload-dropzone-box">
                    <div className="dropzone-icon-circle">
                      <FileText className="h-6 w-6 text-purple-400" />
                    </div>
                    <h4 className="dropzone-title">Flight Report (.pdf)</h4>
                    <p className="dropzone-desc">Photogrammetry alignment & quality stats</p>
                    <input 
                      type="file" 
                      accept=".pdf"
                      onChange={(e) => setReportFile(e.target.files[0])}
                      className="dropzone-file-input"
                    />
                    {reportFile && <div className="file-ready-badge">{reportFile.name}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* Progress Bar & Launch Button */}
            {isSubmitting && (
              <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(15, 23, 42, 0.8)', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#38bdf8' }}>
                  <span>{uploadStatusText || 'Uploading assets...'}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#06b6d4', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => navigate(`/engine/${createdInspectionData.id}`)}
                className="engine-btn"
                style={{ padding: '12px 20px', cursor: 'pointer' }}
              >
                Skip Uploads & Launch Engine
              </button>

              <button
                type="button"
                onClick={executeUploadPhase}
                disabled={isSubmitting}
                className="btn-primary-gradient"
                style={{ padding: '12px 28px', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              >
                {selectedType === 'VIRTUAL_TOUR' && isPreprocessedAssets ? (
                  <>
                    <Zap className="h-4 w-4 text-amber-300 fill-amber-300" />
                    <span>Start Fast Ingestion & Launch Mission</span>
                  </>
                ) : (
                  <>
                    <span>Upload & Launch Digital Twin</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
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
