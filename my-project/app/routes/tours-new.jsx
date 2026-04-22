import { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import './dashboard.css';

export function meta() {
  return [
    { title: "Create Studio | VirtualTwin SaaS" },
  ];
}

const createTourSchema = z.object({
  title: z.string().min(3, { message: "Tour title requires a minimum of 3 characters" }).max(100),
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
});

function NewTourContent() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTourData, setCreatedTourData] = useState(null);

  // Phase 2 Upload states
  const [uploadProgress, setUploadProgress] = useState(0);
  const glbInputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const imagesInputRef = useRef(null);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(createTourSchema),
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
      const response = await fetch('http://localhost:3000/tours', {
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
          throw new Error('You lack ADMIN studio creation privileges.');
        }
        throw new Error(result.message || 'Creation rejected by backend schema');
      }

      setCreatedTourData(result);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadFileToMinio = async (tourId, file, overrideFileName = null) => {
    const token = localStorage.getItem('access_token');
    const fileName = overrideFileName || file.name;

    // 1. Get Presigned URL
    const presignRes = await fetch(`http://localhost:3000/tours/${tourId}/upload-url`, {
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
    if (!createdTourData) return;
    setApiError('');
    setIsSubmitting(true);

    const glbFile = glbInputRef.current?.files[0];
    const jsonFile = jsonInputRef.current?.files[0];
    const imageFiles = imagesInputRef.current?.files;

    if (!glbFile || !glbFile.name.endsWith('.glb')) {
      setApiError('Valid .glb architectural model is required.');
      setIsSubmitting(false);
      return;
    }
    if (!jsonFile || !jsonFile.name.endsWith('.json')) {
      setApiError('Valid scans.json metadata matrix is required.');
      setIsSubmitting(false);
      return;
    }

    try {
      const tourId = createdTourData.id;
      let totalFiles = 2 + (imageFiles ? imageFiles.length : 0);
      let completed = 0;

      const incrementProgress = () => {
        completed++;
        setUploadProgress(Math.round((completed / totalFiles) * 100));
      };

      // Ensure GLB and JSON upload safely
      await uploadFileToMinio(tourId, glbFile, 'ultimate_final.glb');
      incrementProgress();
      await uploadFileToMinio(tourId, jsonFile, 'scans.json');
      incrementProgress();

      // Use a concurrency-limited batching approach for image uploads
      if (imageFiles && imageFiles.length > 0) {
        const CONCURRENCY = 10; // Number of parallel uploads
        const filesArray = Array.from(imageFiles);

        for (let i = 0; i < filesArray.length; i += CONCURRENCY) {
          const batch = filesArray.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map(async (file) => {
            try {
              await uploadFileToMinio(tourId, file, `images/${file.name}`);
              incrementProgress();
            } catch (err) {
              console.error(`Failed to upload ${file.name}:`, err);
              throw err; // Stop the entire process if an upload fails
            }
          }));
        }
      }

      // Route to dashboard dynamically on finish
      navigate('/dashboard');
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
              onClick={() => navigate('/dashboard')}
              style={{ background: 'transparent', border: 'none', color: '#3a82f6', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: 0 }}
            >
              ← Return to Dashboard
            </button>
            <div className="dashboard-title">
              <h1>Initialize New Tour</h1>
              <p>Bind title, access patterns, and meta boundaries for your latest pipeline asset.</p>
            </div>
          </div>
        </div>

        <div className="saas-form">
          {apiError && (
            <div style={{ color: '#ff4a5a', padding: '16px', background: 'rgba(238, 45, 61, 0.1)', borderRadius: '8px', marginBottom: '24px', border: '1px solid rgba(238, 45, 61, 0.2)' }}>
              {apiError}
            </div>
          )}

          {!createdTourData ? (
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="form-group">
                <label className="form-label">Studio Title *</label>
                <input type="text" className="form-input" placeholder="e.g. 500 West Corporate Center" {...register("title")} />
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
                <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary" style={{ flexBasis: '30%' }} disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flexBasis: '70%' }} disabled={isSubmitting}>
                  {isSubmitting ? 'Deploying to Server...' : 'Execute Deployment'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <h2 style={{ color: 'white', marginBottom: '16px' }}>Upload Architecture Assets</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '24px' }}>Tour securely recorded. Now inject the binary payload structure into the VirtualTwin Engine.</p>

              <div className="form-group">
                <label className="form-label">GLB Mesh File *</label>
                <input type="file" ref={glbInputRef} accept=".glb" style={{ color: 'white', padding: '12px 0' }} />
              </div>

              <div className="form-group">
                <label className="form-label">scans.json Mapping *</label>
                <input type="file" ref={jsonInputRef} accept=".json" style={{ color: 'white', padding: '12px 0' }} />
              </div>

              <div className="form-group">
                <label className="form-label">Panorama Textures (Images) *</label>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Select all scan images (e.g. scan_0_nx.jpg) simultaneously.</p>
                <input type="file" multiple ref={imagesInputRef} accept="image/*" style={{ color: 'white', padding: '12px 0' }} />
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

export default function NewTourPage() {
  return (
    <ProtectedRoute>
      <NewTourContent />
    </ProtectedRoute>
  );
}
