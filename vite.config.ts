import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend dev server proxies /api to the Express agent server so the
// OpenRouter key never leaves the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5183,
    proxy: {
      '/api': {
        target: 'http://localhost:3033',
        changeOrigin: true
      }
    }
  },
  build: { outDir: 'dist' }
})
