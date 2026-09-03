/**
 * Centralised API base URL.
 *
 * In production the frontend is served behind Nginx which reverse-proxies
 * /api/* → backend:3000, so we only need an empty string (relative path).
 *
 * In local development (Vite dev server) we point at localhost:3000.
 *
 * The value can be overridden at build time with the VITE_API_URL env var.
 */
const getDevHost = () => {
  if (typeof window !== 'undefined' && window.location.hostname) {
    return window.location.hostname;
  }
  return 'localhost';
};

export const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? `http://${getDevHost()}:3000/api` : '/api');

export const MINIO_URL =
  import.meta.env.VITE_MINIO_URL ??
  (import.meta.env.DEV ? `http://${getDevHost()}:9000` : '');
