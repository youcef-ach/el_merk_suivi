import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import './dashboard.css';

export function meta() {
  return [
    { title: "Team Members | VirtualTwin SaaS" },
  ];
}

function MembersContent() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'VIEWER' });

  let user = null;
  try {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    user = userStr ? JSON.parse(userStr) : null;
  } catch (err) {}

  const role = user?.role || 'VIEWER';

  useEffect(() => {
    if (role !== 'ADMIN') {
      navigate('/projects');
      return;
    }
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('http://app.alpha.openscaler.net:9251/enterprises/members/list', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch team members');
      const data = await res.json();
      setMembers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('http://app.alpha.openscaler.net:9251/enterprises/members/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to add member');
      }

      setForm({ email: '', password: '', role: 'VIEWER' });
      setIsAdding(false);
      fetchMembers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemove = async (memberId) => {
    if (!window.confirm('Remove this member from your enterprise?')) return;
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`http://app.alpha.openscaler.net:9251/enterprises/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to remove member');
      }
      fetchMembers();
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
            <h1>Team Members</h1>
            <p>Manage admins and viewers within your enterprise.</p>
          </div>

          <button className="btn-primary" onClick={() => setIsAdding(!isAdding)}>
            + Add Member
          </button>
        </div>

        {isAdding && (
          <div className="saas-form" style={{ marginBottom: '30px' }}>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="form-label">Temporary Password</label>
                <input type="text" className="form-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
              </div>
              <div style={{ minWidth: '140px' }}>
                <label className="form-label">Role</label>
                <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '14px' }}>
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn-primary" style={{ height: '44px' }}>Save</button>
              <button type="button" className="btn-secondary" onClick={() => setIsAdding(false)} style={{ height: '44px' }}>Cancel</button>
            </form>
          </div>
        )}

        {error && (
          <div style={{ color: '#ff4a5a', padding: '16px', background: 'rgba(238, 45, 61, 0.1)', borderRadius: '8px', marginBottom: '24px' }}>
            {error}
          </div>
        )}

        {isLoading ? (
          <div style={{ color: '#fff' }}><div className="loading-pulse"></div> Loading team...</div>
        ) : members.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            No members found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {members.map((m) => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px', color: 'white',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: m.role === 'ADMIN' ? 'linear-gradient(135deg, #2D7AEE, #1a5ac4)' : 'linear-gradient(135deg, #444, #222)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase',
                  }}>
                    {m.email[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{m.email}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                       Joined {new Date(m.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold',
                    background: m.role === 'ADMIN' ? 'rgba(45,122,238,0.15)' : 'rgba(255,255,255,0.06)',
                    color: m.role === 'ADMIN' ? '#3a82f6' : 'rgba(255,255,255,0.5)',
                    border: `1px solid ${m.role === 'ADMIN' ? 'rgba(45,122,238,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                    {m.role}
                  </span>
                  {m.id !== user?.id && (
                    <button onClick={() => handleRemove(m.id)} style={{
                      background: 'transparent', border: '1px solid rgba(238,45,61,0.3)', color: '#ff4a5a',
                      padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                    }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function MembersPage() {
  return (
    <ProtectedRoute>
      <MembersContent />
    </ProtectedRoute>
  );
}
