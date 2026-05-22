import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import './dashboard.css';

export function meta() {
  return [
    { title: "Create Inspection | VirtualTwin SaaS" },
  ];
}

const createInspectionSchema = z.object({
  title: z.string().min(3, { message: "Title requires a minimum of 3 characters" }).max(100),
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
});

function NewInspectionContent() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdInspectionData, setCreatedInspectionData] = useState(null);

  // Phase 2 Upload states
  const [uploadProgress, setUploadProgress] = useState(0);
  const glbInputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const rcJsonInputRef = useRef(null);
  const imagesInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(createInspectionSchema),
    defaultValues: {
      title: '',
      description: '',
      visibility: 'PRIVATE',
    }
  });

  const onSubmit = async (data) => {
    setApiError('');
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`http://localhost:3000/projects/${projectId}/inspections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('You lack ADMIN privileges.');
        }
        throw new Error(result.message || 'Creation rejected by backend schema');
      }

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

    // 1. Get Presigned URL
    const presignRes = await fetch(`http://localhost:3000/projects/${projectId}/inspections/${inspectionId}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ fileName })
    });

    if (!presignRes.ok) throw new Error("Failed to secure presigned upload link");
    const { presignedUrl } = await presignRes.json();

    // 2. PUT File
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

    const glbFile = glbInputRef.current?.files[0];
    const jsonFile = jsonInputRef.current?.files[0];
    const rcJsonFile = rcJsonInputRef.current?.files[0];
    const imageFiles = imagesInputRef.current?.files;
    const thumbnailFile = thumbnailInputRef.current?.files[0];
    const videoFile = videoInputRef.current?.files[0];

    try {
      const inspectionId = createdInspectionData.id;
      let totalFiles = 
        (glbFile ? 1 : 0) + 
        (jsonFile ? 1 : 0) + 
        (thumbnailFile ? 1 : 0) + 
        (videoFile ? 1 : 0) + 
        (imageFiles ? imageFiles.length : 0);
      let completed = 0;
      
      if (totalFiles === 0) {
         navigate(`/projects/${projectId}`);
         return;
      }

      const incrementProgress = () => {
        completed++;
        setUploadProgress(Math.round((completed / totalFiles) * 100));
      };

      // --- Run GLB, scans, thumbnail, and video uploads in PARALLEL ---
      const parallelTasks = [];

      if (glbFile) {
        parallelTasks.push((async () => {
          await uploadFileToMinio(inspectionId, glbFile, 'ultimate_final.glb');
          const token = localStorage.getItem('access_token');
          const processRes = await fetch(`http://localhost:3000/projects/${projectId}/inspections/${inspectionId}/process-glb`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!processRes.ok) {
            console.error('Failed to optimize GLB model');
          }
          incrementProgress();
        })());
      }

      if (jsonFile && rcJsonFile) {
        parallelTasks.push((async () => {
          const mpText = await jsonFile.text();
          const rcText = await rcJsonFile.text();
          const token = localStorage.getItem('access_token');
          const processRes = await fetch(`http://localhost:3000/projects/${projectId}/inspections/${inspectionId}/process-scans`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ mpData: JSON.parse(mpText), rcData: JSON.parse(rcText) })
          });
          if (!processRes.ok) {
            const errBody = await processRes.json().catch(() => ({}));
            throw new Error(errBody.message || `Failed to process and upload scans mapping (${processRes.status})`);
          }
          incrementProgress();
        })());
      } else if (jsonFile) {
        parallelTasks.push(
          uploadFileToMinio(inspectionId, jsonFile, 'scans.json').then(incrementProgress)
        );
      }

      if (thumbnailFile) {
        parallelTasks.push((async () => {
          await uploadFileToMinio(inspectionId, thumbnailFile, `thumb_${thumbnailFile.name}`);
          const token = localStorage.getItem('access_token');
          await fetch(`http://localhost:3000/projects/${projectId}/inspections/${inspectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ thumbnailUrl: `inspections/${inspectionId}/thumb_${thumbnailFile.name}` })
          });
          incrementProgress();
        })());
      }

      if (videoFile) {
        parallelTasks.push((async () => {
          await uploadFileToMinio(inspectionId, videoFile, `video_${videoFile.name}`);
          const token = localStorage.getItem('access_token');
          await fetch(`http://localhost:3000/projects/${projectId}/inspections/${inspectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ videoUrl: `inspections/${inspectionId}/video_${videoFile.name}` })
          });
          incrementProgress();
        })());
      }

      // Fire all non-image uploads simultaneously
      await Promise.all(parallelTasks);

      // Concurrency-limited batching for image uploads (20 at a time)
      if (imageFiles && imageFiles.length > 0) {
        const CONCURRENCY = 20;
        const filesArray = Array.from(imageFiles);

        for (let i = 0; i < filesArray.length; i += CONCURRENCY) {
          const batch = filesArray.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map(async (file) => {
            try {
              await uploadFileToMinio(inspectionId, file, `images/${file.name}`);
              incrementProgress();
            } catch (err) {
              console.error(`Failed to upload ${file.name}:`, err);
              throw err;
            }
          }));
        }
      }

      navigate(`/projects/${projectId}`);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="saas-container">
      <Navbar />
      <main className="dashboard-main">
        <div className="dashboard-header" style={{ marginBottom: '40px', borderBottom: 'none' }}>
          <div>
            <button
              onClick={() => navigate(`/projects/${projectId}`)}
              style={{ background: 'transparent', border: 'none', color: '#3a82f6', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: 0 }}
            >
              ← Return to Project Details
            </button>
            <div className="dashboard-title">
              <h1>Initialize New Inspection</h1>
              <p>Bind title, access patterns, and meta boundaries for your latest virtual inspection.</p>
            </div>
          </div>
        </div>

        <div className="saas-form">
          {apiError && (
            <div style={{ color: '#ff4a5a', padding: '16px', background: 'rgba(238, 45, 61, 0.1)', borderRadius: '8px', marginBottom: '24px', border: '1px solid rgba(238, 45, 61, 0.2)' }}>
              {apiError}
            </div>
          )}

          {!createdInspectionData ? (
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="form-group">
                <label className="form-label">Inspection Title *</label>
                <input type="text" className="form-input" placeholder="e.g. Zone A Scan" {...register("title")} />
                {errors.title && <span style={{ color: '#ff4a5a', fontSize: '13px', display: 'block', marginTop: '6px' }}>{errors.title.message}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Brief Description</label>
                <textarea className="form-input" placeholder="Optional background meta data" rows="4" style={{ resize: 'vertical' }} {...register("description")} />
              </div>

              <div className="form-group">
                <label className="form-label">Architecture Visibility Parameters *</label>
                <select className="form-select" {...register("visibility")}>
                  <option value="PRIVATE">PRIVATE ARCHITECTURE - Locked exclusively to Authorized ID / Admins</option>
                  <option value="PUBLIC">PUBLIC BROADCAST - Bypass JWT limits for anonymous visibility globally</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" onClick={() => navigate(`/projects/${projectId}`)} className="btn-secondary" style={{ flexBasis: '30%' }} disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flexBasis: '70%' }} disabled={isSubmitting}>
                  {isSubmitting ? 'Deploying to Server...' : 'Execute Deployment'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <h2 style={{ color: 'white', marginBottom: '16px' }}>Upload Architecture & Media Assets</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '24px' }}>Metadata securely recorded. Now inject the binary payload structure into the VirtualTwin Engine.</p>

              <div className="form-group">
                <label className="form-label">GLB Mesh File (Virtual Tour)</label>
                <input type="file" ref={glbInputRef} accept=".glb" style={{ color: 'white', padding: '12px 0' }} />
              </div>

              <div className="form-group">
                <label className="form-label">scans.json Mapping (Matterport)</label>
                <input type="file" ref={jsonInputRef} accept=".json" style={{ color: 'white', padding: '12px 0' }} />
              </div>

              <div className="form-group">
                <label className="form-label">RealityCapture Mapping (csvjson.json)</label>
                <input type="file" ref={rcJsonInputRef} accept=".json" style={{ color: 'white', padding: '12px 0' }} />
              </div>

              <div className="form-group">
                <label className="form-label">Panorama Textures (Images)</label>
                <input type="file" multiple ref={imagesInputRef} accept="image/*" style={{ color: 'white', padding: '12px 0' }} />
              </div>
              
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '24px 0' }}></div>

              <div className="form-group">
                <label className="form-label">Thumbnail Image (Optional - Shown on grid)</label>
                <input type="file" ref={thumbnailInputRef} accept="image/*" style={{ color: 'white', padding: '12px 0' }} />
              </div>

              <div className="form-group">
                <label className="form-label">Inspection Video (Optional - Mp4/Webm)</label>
                <input type="file" ref={videoInputRef} accept="video/*" style={{ color: 'white', padding: '12px 0' }} />
              </div>

              {isSubmitting && (
                <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '12px', borderRadius: '6px', overflow: 'hidden', marginTop: '16px' }}>
                  <div style={{ height: '100%', background: '#3a82f6', width: `${uploadProgress}%`, transition: 'width 0.3s ease' }} />
                </div>
              )}

              <div style={{ display: 'flex', marginTop: '32px' }}>
                <button
                  type="button"
                  onClick={executeUploadPhase}
                  className="btn-primary"
                  style={{ width: '100%' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? `Streaming Engine Data (${uploadProgress}%)...` : 'Commence Data Stream'}
                </button>
              </div>
            </div>
          )}
        </div>
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
