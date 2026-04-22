import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import './auth.css';

export function meta() {
  return [
    { title: "Authentication | 360° Virtual Tour" },
  ];
}

const authSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: '',
      password: '',
    }
  });

  const onSubmit = async (data) => {
    setApiError('');
    setIsLoading(true);

    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    
    try {
      const response = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Authentication failed');
      }

      localStorage.setItem('access_token', result.access_token);
      localStorage.setItem('user', JSON.stringify(result.user));

      navigate('/dashboard');
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setApiError('');
    reset();
  };

  return (
    <div className="auth-container">
      <div className="auth-bg"></div>
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>

      <div className="auth-card">
        <div className="auth-header">
          <h1>{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
          <p>{isLogin ? 'Access your 3D digital twins.' : 'Join the Matterport experience.'}</p>
        </div>

        {apiError && <div className="auth-error">{apiError}</div>}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="input-group">
            <span className="input-label">Email Address</span>
            <input
              type="email"
              className="auth-input"
              placeholder="operator@domain.com"
              {...register("email")}
            />
            {errors.email && <span style={{ color: '#ff4a5a', fontSize: '12px' }}>{errors.email.message}</span>}
          </div>

          <div className="input-group">
            <span className="input-label">Password</span>
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              {...register("password")}
            />
            {errors.password && <span style={{ color: '#ff4a5a', fontSize: '12px' }}>{errors.password.message}</span>}
          </div>

          <button 
            type="submit" 
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? 'Authenticating...' : (isLogin ? 'Sign In Target' : 'Register')}
          </button>
        </form>

        <div className="auth-toggle">
          {isLogin ? "Don't have an account? " : "Already registered? "}
          <span className="auth-toggle-link" onClick={toggleAuthMode}>
            {isLogin ? 'Register here' : 'Sign in here'}
          </span>
        </div>
      </div>
    </div>
  );
}
