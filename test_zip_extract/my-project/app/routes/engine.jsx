import { useNavigate, useParams } from 'react-router';
import ModelAndScansViewer from '../components/ModelAndScansViewer';

export function meta() {
  return [{ title: "Launch Engine | VirtualTwin SaaS" }];
}

export default function EnginePage() {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <button 
        onClick={() => navigate('/dashboard')}
        style={{ position: 'absolute', top: 20, left: 20, zIndex: 100, background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
      >
        ← Dashboard
      </button>

      <ModelAndScansViewer tourId={id} />
    </div>
  );
}
