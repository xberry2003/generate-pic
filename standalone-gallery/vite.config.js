import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/gallery/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/text2image/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/text2image\/api/, '/api'),
      },
    },
  },
})
