import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://localhost:5050';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
      '/share': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});
