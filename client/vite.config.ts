import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.HALO_API_TARGET ?? 'http://127.0.0.1:4000';
// Pinned so `vite --config client/vite.config.ts` works from the repo root too.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/uploads': { target: API_TARGET, changeOrigin: false },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
