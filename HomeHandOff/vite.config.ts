import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const runtimeEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const apiPort = Number(runtimeEnv.HH_API_PORT || 3001);
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(runtimeEnv.HH_VITE_PORT || 5173),
    strictPort: false,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  },
});
