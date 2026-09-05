import { Navigate, useLocation } from 'react-router';
import { useState, useEffect } from 'react';

/**
 * Enterprise-grade ProtectedRoute wrapper. 
 * If the user's localStorage token is missing, they are redirected to /auth
 * with a redirect target preserving the current location and search params.
 */
export default function ProtectedRoute({ children }) {
  const [isMounted, setIsMounted] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null; // Prevents SSR/CSR hydration mismatched rendered branches
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  if (!token) {
    const redirectParam = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirectParam}`} state={{ from: location }} replace />;
  }

  // Render the securely restricted components natively
  return children;
}
