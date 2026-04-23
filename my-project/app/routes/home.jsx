import { Navigate } from 'react-router';

export function meta() {
  return [
    { title: "VirtualTwin SaaS" },
    { name: "description", content: "Enterprise 3D inspection platform" },
  ];
}

export default function HomePage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return <Navigate to={token ? '/dashboard' : '/auth'} replace />;
}