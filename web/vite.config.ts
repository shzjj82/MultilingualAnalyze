import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://127.0.0.1:5179',
    },
  },
  build: {
    outDir: path.resolve(root, '../ui'),
    emptyOutDir: true,
    sourcemap: true,
  },
})
