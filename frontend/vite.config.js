import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Visible build marker so we can confirm which version is actually live.
    // Vercel sets VERCEL_GIT_COMMIT_SHA at build time; falls back to a timestamp locally.
    __BUILD_ID__: JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) ||
        new Date().toISOString().slice(0, 16).replace('T', ' ')
    ),
  },
  server: {
    // Loopback only. Binding every interface put the dev server on the office
    // network, and vite 5 has a Windows-only `server.fs.deny` bypass that reads
    // files outside the project — `backend/.env` included. To reach it from a
    // phone or tablet on purpose: `npm run dev -- --host`.
    host: 'localhost',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        followRedirects: true,
        headers: { origin: 'http://localhost:3000' },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
    globals: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
