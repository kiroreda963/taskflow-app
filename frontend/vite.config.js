import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the API runs separately on :3000; in production Express serves both.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: { environment: 'node' },
});
