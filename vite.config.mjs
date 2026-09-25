import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = 'http://127.0.0.1:4317';
function localProxy(websocket = false) {
  return {
    target: backend,
    changeOrigin: true,
    ws: websocket,
    configure(proxy) {
      const sameOrigin = (proxyRequest, request) => {
        // Keep the production same-origin guard intact through the loopback dev proxy.
        if (request.headers.origin && /^http:\/\/(127\.0\.0\.1|localhost):4319$/.test(request.headers.origin)) {
          proxyRequest.setHeader('Origin', backend);
        }
      };
      proxy.on('proxyReq', sameOrigin);
      proxy.on('proxyReqWs', sameOrigin);
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4319,
    strictPort: true,
    proxy: { '/api': localProxy(), '/editor': localProxy(true) },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
