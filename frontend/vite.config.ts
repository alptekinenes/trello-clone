/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Explicit IPv4: on this machine `localhost` alone binds only to ::1,
    // and browsers that resolve localhost to 127.0.0.1 cannot connect.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Same origin for API and app, so the httpOnly refresh cookie works in dev.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
