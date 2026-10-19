/**
 * The scene probes: the real 3D warehouse components in jsdom with only the
 * GL renderer faked (see h.jsx). Slow — real-time waits — so they are their
 * own run:  npm run test:scene
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  root: frontend,
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify('probe') },
  resolve: {
    alias: {
      '@src': path.join(frontend, 'src'),
      // One copy of the reconciler for the scene and for the mocks that wrap it.
      '@react-three/fiber': path.join(frontend, 'node_modules/@react-three/fiber/dist/react-three-fiber.esm.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['scene-probes/*.probe.jsx'],
    setupFiles: ['./src/test-setup.js'],
    testTimeout: 110000,
    hookTimeout: 30000,
    // They share one fake renderer's frame log.
    fileParallelism: false,
    server: { deps: { inline: [/@react-three[\\/]/, /three-stdlib/] } },
  },
});
