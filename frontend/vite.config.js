import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    proxy: { '/api': 'http://localhost:8003', '/mcp': 'http://localhost:8003' }
  },
  build: { outDir: 'dist' }
})
