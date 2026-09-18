import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // The workspace is served by Nginx below /text2image/.  Keeping this base
  // path prevents production HTML from requesting its JS/CSS at /assets/.
  base: process.env.VITE_BASE_PATH || '/text2image/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Preserve the production subpath during local development.
      '/text2image/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/text2image\/api/, '/api')
      },
      // Backwards-compatible local proxy for direct API checks.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  }
})
