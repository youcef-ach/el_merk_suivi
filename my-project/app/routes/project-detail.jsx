import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import './dashboard.css';

export function meta() {
  return [
    { title: "Project Inspections | VirtualTwin SaaS" },
  ];
}

function ProjectDetailContent() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Reprocess Scans Modal State
  const [reprocessInspection, setReprocessInspection] = useState(null);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessError, setReprocessError] = useState('');
  const mpFileRef = useRef(null);
  const rcFileRef = useRef(null);

  let user = null;
  try {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    user = userStr ? JSON.parse(userStr) : null;
  } catch (err) {}
  
  const role = user?.role || 'VIEWER';

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`http://localhost:3000/api/projects/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('access_token');
          navigate('/auth');
          return;
        }
        throw new Error('Failed to fetch project details');
      }

      const data = await response.json();
      setProject(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteInspection = async (id) => {
    if (!window.confirm("Warning: Purging this inspection will permanently delete its S3 references. Proceed?")) return;

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`http://localhost:3000/api/projects/${projectId}/inspections/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Failed to purge inspection.");
      fetchProject(); // refresh
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCloneInspection = async (id) => {
    if (!window.confirm("This will duplicate the inspection, preserving S3 files. Proceed?")) return;

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`http://localhost:3000/api/projects/${projectId}/inspections/${id}/clone`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Failed to clone inspection.");
      fetchProject(); // refresh
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReprocessSubmit = async () => {
    if (!reprocessInspection) return;
    const mpFile = mpFileRef.current?.files[0];
    const rcFile = rcFileRef.current?.files[0];

    if (!mpFile || !rcFile) {
      setReprocessError("You must provide both the Matterport JSON and the RealityCapture JSON to reprocess.");
      return;
    }

    setReprocessError('');
    setIsReprocessing(true);

    try {
      const mpText = await mpFile.text();
      const rcText = await rcFile.text();
      const token = localStorage.getItem('access_token');

      const processRes = await fetch(`http://localhost:3000/api/projects/${projectId}/inspections/${reprocessInspection.id}/process-scans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mpData: JSON.parse(mpText), rcData: JSON.parse(rcText) })
      });

      if (!processRes.ok) {
        const errBody = await processRes.json().catch(() => ({}));
        throw new Error(errBody.message || `Failed to process scans (${processRes.status})`);
      }

      setReprocessInspection(null);
      alert("Scans successfully reprocessed! Changes will reflect when reloading the 3D Engine.");
      fetchProject();
    } catch (err) {
      setReprocessError(err.message);
    } finally {
      setIsReprocessing(false);
    }
  };

  if (isLoading) return <div className="saas-container"><Navbar /><div style={{padding: '120px 24px', color: 'white'}}>Loading Project...</div></div>;
  if (error) return <div className="saas-container"><Navbar /><div style={{padding: '120px 24px', color: 'red'}}>{error}</div></div>;
  if (!project) return null;

  return (
    <div className="saas-container">
      <Navbar />
      <main className="dashboard-main">
        <div className="dashboard-header">
          <div>
            <button
              onClick={() => navigate('/projects')}
              style={{ background: 'transparent', border: 'none', color: '#3a82f6', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: 0 }}
            >
              ← All Projects
            </button>
            <div className="dashboard-title">
              <h1>{project.name}</h1>
              <p>{project.description || "Project / Chantier space"}</p>
            </div>
          </div>
          
          <button className="btn-primary" onClick={() => navigate(`/projects/${projectId}/inspections/new`)}>
            + Create Inspection
          </button>
        </div>

        {project.inspections?.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            No inspections found in this project.
          </div>
        ) : (
          <div className="tours-grid">
            {project.inspections.map((insp) => (
              <div key={insp.id} className="tour-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ position: 'relative', width: '100%', height: '180px', backgroundColor: '#111' }}>
                   {insp.thumbnailUrl ? (
                      <img src={`http://localhost:9000/virtual-inspections/${insp.thumbnailUrl}`} alt={insp.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                   ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>
                         No Thumbnail
                      </div>
                   )}
                   {insp.videoUrl && (
                      <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(238, 45, 61, 0.9)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                         VIDEO
                      </div>
                   )}
                </div>

                <div style={{ padding: '20px' }}>
                   <div className="tour-card-header" style={{ marginBottom: '8px' }}>
                     <h3 className="tour-title" title={insp.title}>{insp.title}</h3>
                     <span className={insp.visibility === 'PUBLIC' ? 'badge-public' : 'badge-private'}>
                       {insp.visibility}
                     </span>
                   </div>
                   
                   <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>
                      Created: {new Date(insp.createdAt).toLocaleDateString()}
                   </div>
   
                   <p className="tour-desc" style={{ marginBottom: '20px' }}>
                     {insp.description || "No description provided."}
                   </p>
   
                   <div className="tour-actions" style={{ flexWrap: 'wrap' }}>
                     <Link to={`/engine/${insp.id}`} className="btn-secondary" style={{textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1}}>
                       3D Engine
                     </Link>
                     {role === 'ADMIN' && (
                       <Link to={`/studio/${insp.id}`} className="btn-secondary" style={{textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1}}>
                         Studio
                       </Link>
                     )}
                     {insp.videoUrl && (
                        <button className="btn-secondary" onClick={() => setSelectedVideo(`http://localhost:9000/virtual-inspections/${insp.videoUrl}`)} style={{ borderColor: '#3a82f6', color: '#3a82f6' }}>
                          Watch Video
                        </button>
                     )}
                     {role === 'ADMIN' && (
                       <>
                         <button className="btn-secondary" onClick={() => handleCloneInspection(insp.id)}>
                           Clone
                         </button>
                         <button className="btn-secondary" onClick={() => setReprocessInspection(insp)}>
                           Reprocess Scans
                         </button>
                         <button className="btn-danger" onClick={() => handleDeleteInspection(insp.id)}>
                           Purge
                         </button>
                       </>
                     )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedVideo && (
           <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <button onClick={() => setSelectedVideo(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: 'white', fontSize: '32px', cursor: 'pointer' }}>×</button>
              <video src={selectedVideo} controls autoPlay style={{ maxWidth: '90%', maxHeight: '80%' }} />
           </div>
        )}

        {reprocessInspection && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e1e1e', padding: '32px', borderRadius: '12px', width: '500px', maxWidth: '90%', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h2 style={{ color: 'white', marginBottom: '8px' }}>Reprocess Scans</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '24px', fontSize: '14px' }}>
                Re-upload the raw Matterport and RealityCapture JSON files to recalculate the coordinates for <strong>{reprocessInspection.title}</strong>. This will instantly update the 3D Engine for all users.
              </p>

              {reprocessError && (
                <div style={{ color: '#ff4a5a', padding: '12px', background: 'rgba(238, 45, 61, 0.1)', borderRadius: '6px', marginBottom: '20px', fontSize: '13px' }}>
                  {reprocessError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Matterport Mapping (scans.json / raw_scans.json) *</label>
                <input type="file" ref={mpFileRef} accept=".json" style={{ color: 'white', padding: '12px 0', display: 'block' }} />
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">RealityCapture Mapping (csvjson.json) *</label>
                <input type="file" ref={rcFileRef} accept=".json" style={{ color: 'white', padding: '12px 0', display: 'block' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setReprocessInspection(null)} disabled={isReprocessing}>
                  Cancel
                </button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={handleReprocessSubmit} disabled={isReprocessing}>
                  {isReprocessing ? 'Processing...' : 'Upload & Reprocess'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <ProtectedRoute>
      <ProjectDetailContent />
    </ProtectedRoute>
  );
}
