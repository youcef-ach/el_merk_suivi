import { useNavigate } from 'react-router';
import './navbar.css';

export default function Navbar() {
  const navigate = useNavigate();
  
  let user = null;
  try {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    user = userStr ? JSON.parse(userStr) : null;
  } catch (err) {
    console.error("Invalid user identity payload", err);
  }

  const role = user?.role || 'VIEWER';

  const handleSignOut = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    navigate('/auth', { replace: true });
  };

  return (
    <nav className="glass-navbar">
      <div className="navbar-container">
        <div className="navbar-logo">
          <span className="logo-icon">▲</span>
          <span className="logo-text">VirtualTwin</span>
        </div>

        <div className="navbar-links">
          <button className="nav-btn" onClick={() => navigate('/')}>3D Tours</button>
          
          <button className="nav-btn nav-btn-admin">Studio Manager</button>
          <button className="nav-btn nav-btn-admin">Permissions</button>
        </div>

        <div className="navbar-actions">
          <div className="user-badge">{role === 'ADMIN' ? 'Admin' : 'Viewer'}</div>
          <button className="signout-btn" onClick={handleSignOut}>Sign Out</button>
        </div>
      </div>
    </nav>
  );
}
