import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow the Arena/e2b preview proxy hosts
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:4000',
        changeOrigin: true,
        ws: true,            // live collaboration socket at /api/collab
      },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
