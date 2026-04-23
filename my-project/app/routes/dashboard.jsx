import { Navigate } from 'react-router';
import ProtectedRoute from '../components/ProtectedRoute';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Navigate to="/projects" replace />
    </ProtectedRoute>
  );
}
