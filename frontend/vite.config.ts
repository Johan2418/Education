import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    // Ensure cache busting with content hash
    rollupOptions: {
      output: {
        // JS chunks with content hash
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js',
        // CSS chunks with content hash
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
})
