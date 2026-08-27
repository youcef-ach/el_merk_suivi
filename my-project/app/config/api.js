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
export const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? 'http://localhost:3000/api' : '/api');

/**
 * Centralised MinIO / object-storage base URL.
 *
 * In production Nginx proxies /virtual-inspections/* and /virtual-tours/*
 * directly to the MinIO container, so we use an empty string (relative path).
 *
 * In local development we point at localhost:9000.
 */
export const MINIO_URL =
  import.meta.env.VITE_MINIO_URL ??
  (import.meta.env.DEV ? 'http://localhost:9000' : '');
