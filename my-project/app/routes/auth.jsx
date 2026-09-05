import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Lock } from 'lucide-react';
import './auth.css';
import { API_URL } from '../config/api';

export function meta() {
  return [
    { title: "Authentication | VirtualTwin SaaS" },
  ];
}

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

const registerSchema = z.object({
  enterpriseName: z.string().min(2, { message: "Enterprise name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Resolve target redirect URL
  const rawRedirect = searchParams.get('redirect') || location.state?.from?.pathname;
  const redirectTarget = rawRedirect ? decodeURIComponent(rawRedirect) : '/dashboard';

  // If already authenticated with a valid token, immediately navigate to target
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (token) {
      navigate(redirectTarget, { replace: true });
    }
  }, [navigate, redirectTarget]);

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { enterpriseName: '', email: '', password: '', confirmPassword: '' },
  });

  const onLogin = async (data) => {
    setApiError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Authentication failed');

      localStorage.setItem('access_token', result.access_token);
      localStorage.setItem('user', JSON.stringify(result.user));
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (data) => {
    setApiError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/register-enterprise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enterpriseName: data.enterpriseName,
          email: data.email,
          password: data.password,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Registration failed');

      localStorage.setItem('access_token', result.access_token);
      localStorage.setItem('user', JSON.stringify(result.user));
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setApiError('');
    loginForm.reset();
    registerForm.reset();
  };

  return (
    <div className="auth-container">
      <div className="auth-bg"></div>
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>

      <div className="auth-card">
        {rawRedirect && (
          <div className="auth-redirect-notice">
            <Lock className="auth-redirect-notice-icon" />
            <div className="auth-redirect-notice-text">
              <span className="auth-redirect-notice-title">Authentication Required</span>
              <span className="auth-redirect-notice-subtitle">Sign in to access your digital twin inspection</span>
            </div>
          </div>
        )}

        <div className="auth-header">
          <h1>{isLogin ? 'Welcome Back' : 'Register Enterprise'}</h1>
          <p>{isLogin
            ? 'Sign in to access your 3D digital twin workspace.'
            : 'Create your enterprise account to start managing inspections.'}
          </p>
        </div>

        {apiError && <div className="auth-error">{apiError}</div>}

        {isLogin ? (
          <form onSubmit={loginForm.handleSubmit(onLogin)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="input-group">
              <span className="input-label">Email Address</span>
              <input type="email" className="auth-input" placeholder="admin@enterprise.com" {...loginForm.register("email")} />
              {loginForm.formState.errors.email && <span style={{ color: '#ff4a5a', fontSize: '12px' }}>{loginForm.formState.errors.email.message}</span>}
            </div>

            <div className="input-group">
              <span className="input-label">Password</span>
              <input type="password" className="auth-input" placeholder="••••••••" {...loginForm.register("password")} />
              {loginForm.formState.errors.password && <span style={{ color: '#ff4a5a', fontSize: '12px' }}>{loginForm.formState.errors.password.message}</span>}
            </div>

            <button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={registerForm.handleSubmit(onRegister)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="input-group">
              <span className="input-label">Enterprise Name</span>
              <input type="text" className="auth-input" placeholder="Your Company / Organization" {...registerForm.register("enterpriseName")} />
              {registerForm.formState.errors.enterpriseName && <span style={{ color: '#ff4a5a', fontSize: '12px' }}>{registerForm.formState.errors.enterpriseName.message}</span>}
            </div>

            <div className="input-group">
              <span className="input-label">Admin Email</span>
              <input type="email" className="auth-input" placeholder="admin@enterprise.com" {...registerForm.register("email")} />
              {registerForm.formState.errors.email && <span style={{ color: '#ff4a5a', fontSize: '12px' }}>{registerForm.formState.errors.email.message}</span>}
            </div>

            <div className="input-group">
              <span className="input-label">Password</span>
              <input type="password" className="auth-input" placeholder="••••••••" {...registerForm.register("password")} />
              {registerForm.formState.errors.password && <span style={{ color: '#ff4a5a', fontSize: '12px' }}>{registerForm.formState.errors.password.message}</span>}
            </div>

            <div className="input-group">
              <span className="input-label">Confirm Password</span>
              <input type="password" className="auth-input" placeholder="••••••••" {...registerForm.register("confirmPassword")} />
              {registerForm.formState.errors.confirmPassword && <span style={{ color: '#ff4a5a', fontSize: '12px' }}>{registerForm.formState.errors.confirmPassword.message}</span>}
            </div>

            <button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? 'Creating Enterprise...' : 'Create Enterprise Account'}
            </button>
          </form>
        )}

        <div className="auth-toggle">
          {isLogin ? "Don't have an enterprise account? " : "Already registered? "}
          <span className="auth-toggle-link" onClick={toggleAuthMode}>
            {isLogin ? 'Register here' : 'Sign in here'}
          </span>
        </div>
      </div>
    </div>
  );
}
