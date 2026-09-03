import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import { 
  Building2, 
  Plane, 
  Layers, 
  Plus, 
  ArrowLeft, 
  Video, 
  Copy, 
  RotateCw, 
  Trash2,
  Calendar,
  Compass,
  Clock
} from 'lucide-react';
import './dashboard.css';
import { API_URL, MINIO_URL } from '../config/api';

export function meta() {
  return [
    { title: "Project Inspections | VirtualTwin SaaS" },
  ];
}

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

function ProjectDetailContent() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'VIRTUAL_TOUR' | 'DRONE_SURVEY'

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
      const response = await fetch(`${API_URL}/projects/${projectId}`, {
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
      const response = await fetch(`${API_URL}/projects/${projectId}/inspections/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Failed to purge inspection.");
      fetchProject();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCloneInspection = async (id) => {
    if (!window.confirm("This will duplicate the inspection, preserving S3 files. Proceed?")) return;

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/projects/${projectId}/inspections/${id}/clone`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Failed to clone inspection.");
      fetchProject();
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

      const processRes = await fetch(`${API_URL}/projects/${projectId}/inspections/${reprocessInspection.id}/process-scans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mpData: parseCsvOrJson(mpText), rcData: parseCsvOrJson(rcText) })
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

  const allInspections = project.inspections || [];
  const virtualTours = allInspections.filter(i => i.type === 'VIRTUAL_TOUR' || (!i.tilesetUrl && !i.orthoUrl && i.glbModelUrl));
  const droneSurveys = allInspections.filter(i => i.type === 'DRONE_SURVEY' || Boolean(i.tilesetUrl || i.orthoUrl));

  const filteredInspections = activeTab === 'VIRTUAL_TOUR' 
    ? virtualTours 
    : activeTab === 'DRONE_SURVEY' 
      ? droneSurveys 
      : allInspections;

  return (
    <div className="saas-container">
      <Navbar />
      <main className="dashboard-main">
        
        {/* Header Section */}
        <div className="dashboard-header" style={{ marginBottom: '24px' }}>
          <div>
            <button
              onClick={() => navigate('/projects')}
              style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: 0 }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to All Projects</span>
            </button>
            <div className="dashboard-title">
              <h1>{project.name}</h1>
              <p>{project.description || "Industrial facilities & Construction site digital twins"}</p>
            </div>
          </div>
          
          <button 
            className="btn-primary" 
            onClick={() => navigate(`/projects/${projectId}/inspections/new`)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus className="h-4 w-4" />
            <span>New Mission</span>
          </button>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('ALL')}
            className={`engine-btn ${activeTab === 'ALL' ? 'engine-btn-cyan' : ''}`}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            All Missions ({allInspections.length})
          </button>

          <button
            onClick={() => setActiveTab('VIRTUAL_TOUR')}
            className={`engine-btn ${activeTab === 'VIRTUAL_TOUR' ? 'engine-btn-cyan' : ''}`}
            style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Building2 className="h-3.5 w-3.5 text-cyan-400" />
            <span>Industrial Virtual Tours ({virtualTours.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('DRONE_SURVEY')}
            className={`engine-btn ${activeTab === 'DRONE_SURVEY' ? 'engine-btn-emerald' : ''}`}
            style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plane className="h-3.5 w-3.5 text-emerald-400" />
            <span>Drone Photogrammetry & GIS ({droneSurveys.length})</span>
          </button>
        </div>

        {filteredInspections.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            No missions found under this category.
          </div>
        ) : (
          <div className="tours-grid">
            {filteredInspections.map((insp) => {
              const isTour = insp.type === 'VIRTUAL_TOUR' || (!insp.tilesetUrl && !insp.orthoUrl && insp.glbModelUrl);

              return (
                <div key={insp.id} className="tour-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ position: 'relative', width: '100%', height: '180px', backgroundColor: '#111' }}>
                    {insp.thumbnailUrl ? (
                      <img 
                        src={`${MINIO_URL}/virtual-inspections/${insp.thumbnailUrl}`} 
                        alt={insp.title} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>
                        {isTour ? <Building2 className="h-12 w-12 text-slate-700" /> : <Plane className="h-12 w-12 text-slate-700" />}
                      </div>
                    )}

                    {/* Purpose Badge on Image */}
                    <div style={{ position: 'absolute', top: 12, left: 12 }}>
                      <span className={`engine-badge ${isTour ? 'badge-tour' : 'badge-drone'}`}>
                        {isTour ? '🏭 Virtual Tour' : '🛰️ Drone Survey'}
                      </span>
                    </div>

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

                    {/* Deliverables Badges */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      {insp.glbModelUrl && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', border: '1px solid rgba(6, 182, 212, 0.3)', fontFamily: 'monospace' }}>
                          3D MESH
                        </span>
                      )}
                      {insp.scansJsonUrl && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)', fontFamily: 'monospace' }}>
                          360 SCANS
                        </span>
                      )}
                      {insp.tilesetUrl && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)', fontFamily: 'monospace' }}>
                          3D TILES
                        </span>
                      )}
                      {insp.orthoUrl && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontFamily: 'monospace' }}>
                          ORTHOMOSAIC
                        </span>
                      )}
                      {insp.surveyDate && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', fontFamily: 'monospace' }}>
                          Flight: {new Date(insp.surveyDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>Created: {new Date(insp.createdAt).toLocaleDateString()} at {new Date(insp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <p className="tour-desc" style={{ marginBottom: '20px' }}>
                      {insp.description || "No description provided."}
                    </p>

                    <div className="tour-actions" style={{ flexWrap: 'wrap' }}>
                      <Link 
                        to={`/engine/${insp.id}`} 
                        className="btn-secondary" 
                        style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, background: isTour ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)', borderColor: isTour ? 'rgba(6, 182, 212, 0.4)' : 'rgba(16, 185, 129, 0.4)', color: isTour ? '#38bdf8' : '#34d399', fontWeight: 600 }}
                      >
                        {isTour ? 'Launch 360 Tour' : 'Launch GIS Engine'}
                      </Link>

                      {isTour && role === 'ADMIN' && (
                        <Link to={`/studio/${insp.id}`} className="btn-secondary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          Studio
                        </Link>
                      )}

                      {insp.videoUrl && (
                        <button className="btn-secondary" onClick={() => setSelectedVideo(`${MINIO_URL}/virtual-inspections/${insp.videoUrl}`)} style={{ borderColor: '#3a82f6', color: '#3a82f6' }}>
                          Video
                        </button>
                      )}

                      {role === 'ADMIN' && (
                        <>
                          <button className="btn-secondary" onClick={() => handleCloneInspection(insp.id)} title="Duplicate">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {isTour && (
                            <button className="btn-secondary" onClick={() => setReprocessInspection(insp)} title="Reprocess Scans">
                              <RotateCw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button className="btn-danger" onClick={() => handleDeleteInspection(insp.id)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
                Re-upload the raw Matterport and RealityCapture JSON files to recalculate the coordinates for <strong>{reprocessInspection.title}</strong>.
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
