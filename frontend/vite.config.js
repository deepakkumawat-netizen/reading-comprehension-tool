import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    proxy: { '/api': 'http://localhost:8003', '/mcp': 'http://localhost:8003' }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Hashed filenames so the browser never serves a stale bundle after
        // a deploy — each build produces a different filename like
        // assets/index-abc123.js and index.html references the new one.
        entryFileNames: 'assets/index-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      }
    }
  }
})
