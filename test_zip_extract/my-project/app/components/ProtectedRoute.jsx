import { Navigate } from 'react-router';
import { useState, useEffect } from 'react';

/**
 * A highly-secured Layout wrapper. 
 * If the user's localStorage token is missing, they are brutally redirected to /auth
 * before sensitive layout child components even attempt to render.
 */
export default function ProtectedRoute({ children }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null; // Prevents SSR/CSR hydration mismatched rendered branches
  }

  const token = localStorage.getItem('access_token');

  if (!token) {
    return <Navigate to="/auth" replace />;
  }

  // Render the securely restricted components natively
  return children;
}
