import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavyweight vendors into their own chunks so login + patient
        // list don't pull plotly (~3 MB) and three (~2 MB) into the initial
        // bundle. Wave routes import these lazily via React.lazy in App.tsx.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('plotly')) return 'plotly'
            if (id.includes('/three/') || id.includes('@react-three') || id.includes('postprocessing')) return 'three'
            if (id.includes('@fontsource')) return 'fonts'
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router')) return 'react'
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      // host has a low fs.inotify.max_user_watches; fall back to polling
      usePolling: true,
      interval: 1000,
      ignored: ['**/node_modules/**', '**/dist/**', '**/backend/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // No rewrite — backend mounts routers under /api in both dev and prod.
      },
    },
  },
})
