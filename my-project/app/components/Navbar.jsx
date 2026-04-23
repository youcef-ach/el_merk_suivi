import { useNavigate, useLocation } from 'react-router';
import './navbar.css';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  
  let user = null;
  try {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    user = userStr ? JSON.parse(userStr) : null;
  } catch (err) {
    console.error("Invalid user identity payload", err);
  }

  const role = user?.role || 'VIEWER';
  const enterpriseName = user?.enterpriseName || 'Enterprise';

  const handleSignOut = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    navigate('/auth', { replace: true });
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav className="glass-navbar">
      <div className="navbar-container">
        <div className="navbar-logo" onClick={() => navigate('/projects')} style={{ cursor: 'pointer' }}>
          <span className="logo-icon">▲</span>
          <span className="logo-text">VirtualTwin</span>
        </div>

        <div className="navbar-links">
          <button className={`nav-btn ${isActive('/projects') ? 'nav-btn-active' : ''}`} onClick={() => navigate('/projects')}>
            Projects
          </button>
          {role === 'ADMIN' && (
            <button className={`nav-btn ${isActive('/members') ? 'nav-btn-active' : ''}`} onClick={() => navigate('/members')}>
              Team
            </button>
          )}
        </div>

        <div className="navbar-actions">
          <div className="user-badge">{role === 'ADMIN' ? 'Admin' : 'Viewer'}</div>
          <button className="signout-btn" onClick={handleSignOut}>Sign Out</button>
        </div>
      </div>
    </nav>
  );
}
