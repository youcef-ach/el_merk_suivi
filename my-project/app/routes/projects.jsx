import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import './dashboard.css';
import { API_URL } from '../config/api';

export function meta() {
  return [
    { title: "Enterprise Projects | VirtualTwin SaaS" },
  ];
}

function ProjectsContent() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  let user = null;
  try {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    user = userStr ? JSON.parse(userStr) : null;
  } catch (err) {}
  
  const role = user?.role || 'VIEWER';

  useEffect(() => {
    fetchProjects();
  }, [navigate]);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('access_token');
          navigate('/auth');
          return;
        }
        throw new Error('Failed to fetch projects grid');
      }

      const data = await response.json();
      setProjects(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newProjectName })
      });

      if (!response.ok) throw new Error("Failed to create project.");
      
      setNewProjectName('');
      setIsCreating(false);
      fetchProjects();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="saas-container">
      <Navbar />
      <main className="dashboard-main">
        <div className="dashboard-header">
          <div className="dashboard-title">
            <h1>Active Chantier Projects</h1>
            <p>Select a project to explore its 3D inspections and media.</p>
          </div>
          
          {role === 'ADMIN' && (
            <button className="btn-primary" onClick={() => setIsCreating(!isCreating)}>
              + Create Project
            </button>
          )}
        </div>

        {isCreating && (
           <div className="saas-form" style={{ marginBottom: '30px' }}>
              <form onSubmit={handleCreateProject} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                 <div style={{ flex: 1 }}>
                    <label className="form-label">Project Name</label>
                    <input type="text" className="form-input" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} required />
                 </div>
                 <button type="submit" className="btn-primary">Save</button>
                 <button type="button" className="btn-secondary" onClick={() => setIsCreating(false)}>Cancel</button>
              </form>
           </div>
        )}

        {error && (
          <div style={{ color: '#ff4a5a', padding: '16px', background: 'rgba(238, 45, 61, 0.1)', borderRadius: '8px', marginBottom: '24px' }}>
            {error}
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', color: '#fff' }}>
            <div className="loading-pulse"></div> Generating Data Grid...
          </div>
        ) : projects.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            No projects found assigned to your enterprise.
          </div>
        ) : (
          <div className="tours-grid">
            {projects.map((proj) => (
              <div key={proj.id} className="tour-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${proj.id}`)}>
                <div className="tour-card-header">
                  <h3 className="tour-title" title={proj.name}>{proj.name}</h3>
                </div>
                
                <p className="tour-desc">
                  {proj.description || "Project / Chantier space"}
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="badge-public" style={{ background: 'rgba(58,130,246,0.15)', color: '#3a82f6', border: '1px solid rgba(58,130,246,0.3)' }}>
                    {proj._count?.inspections || 0} Inspections
                  </span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                     Created: {new Date(proj.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <ProtectedRoute>
      <ProjectsContent />
    </ProtectedRoute>
  );
}
