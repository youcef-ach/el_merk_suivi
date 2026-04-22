import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import './dashboard.css';

export function meta() {
  return [
    { title: "Tours Dashboard | VirtualTwin SaaS" },
  ];
}

function DashboardContent() {
  const navigate = useNavigate();
  const [tours, setTours] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  let user = null;
  try {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    user = userStr ? JSON.parse(userStr) : null;
  } catch (err) {}
  
  const role = user?.role || 'VIEWER';

  useEffect(() => {
    const fetchTours = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch('http://localhost:3000/tours', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('access_token');
            navigate('/auth');
            return;
          }
          throw new Error('Failed to fetch tours grid');
        }

        const data = await response.json();
        setTours(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTours();
  }, [navigate]);

  const handleDeleteTour = async (tourId) => {
    if (!window.confirm("Warning: Purging this architecture will permanently delete its S3 references and metadata. Proceed?")) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`http://localhost:3000/tours/${tourId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 403) throw new Error("You lack authorization to purge this architecture. Only Creators/Admins allowed.");
        throw new Error("Failed to purge architecture from server.");
      }

      setTours((prev) => prev.filter(t => t.id !== tourId));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="saas-container">
      <Navbar />
      
      <main className="dashboard-main">
        <div className="dashboard-header">
          <div className="dashboard-title">
            <h1>Active Projects</h1>
            <p>Manage and explore your digital twin models.</p>
          </div>
          
          <button className="btn-primary" onClick={() => navigate('/tours/new')}>
            + Create New Tour
          </button>
        </div>

        {error && (
          <div style={{ color: '#ff4a5a', padding: '16px', background: 'rgba(238, 45, 61, 0.1)', borderRadius: '8px', marginBottom: '24px' }}>
            {error}
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', color: '#fff' }}>
            <div className="loading-pulse"></div> Generating Data Grid...
          </div>
        ) : tours.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            No Virtual Tours found assigned to your scope.
          </div>
        ) : (
          <div className="tours-grid">
            {tours.map((tour) => (
              <div key={tour.id} className="tour-card">
                <div className="tour-card-header">
                  <h3 className="tour-title" title={tour.title}>{tour.title}</h3>
                  <span className={tour.visibility === 'PUBLIC' ? 'badge-public' : 'badge-private'}>
                    {tour.visibility}
                  </span>
                </div>
                
                <p className="tour-desc">
                  {tour.description || "No description provided for this scanned environment."}
                </p>

                <div className="tour-actions">
                  <button className="btn-secondary" onClick={() => navigate(`/engine/${tour.id}`)}>
                    Launch Engine
                  </button>
                  <button className="btn-secondary" onClick={() => navigate(`/studio/${tour.id}`)}>
                    Edit Studio
                  </button>
                  <button className="btn-danger" onClick={() => handleDeleteTour(tour.id)}>
                    Purge
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
