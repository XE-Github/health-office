import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor'
          }

          if (id.includes('@tensorflow/tfjs-core')) {
            return 'tfjs-core'
          }

          if (id.includes('@tensorflow/tfjs-converter')) {
            return 'tfjs-converter'
          }

          if (id.includes('@tensorflow/tfjs-backend-webgl')) {
            return 'tfjs-backend-webgl'
          }

          if (id.includes('@tensorflow/tfjs-backend-cpu')) {
            return 'tfjs-backend-cpu'
          }

          if (
            id.includes('@tensorflow-models/face-landmarks-detection') ||
            id.includes('@tensorflow-models/pose-detection')
          ) {
            return 'vision-models'
          }

          if (
            id.includes('@mediapipe/face_mesh') ||
            id.includes('@mediapipe/pose') ||
            id.includes('/src/shims/mediapipe-')
          ) {
            return 'mediapipe-runtime'
          }

          if (id.includes('@mediapipe/tasks-vision')) {
            return 'mediapipe-tasks'
          }

          if (id.includes('node_modules/three') || id.includes('node_modules\\three')) {
            return 'three-workspace'
          }
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@mediapipe/face_mesh': path.resolve(
        __dirname,
        'src/shims/mediapipe-face-mesh.ts',
      ),
      '@mediapipe/pose': path.resolve(__dirname, 'src/shims/mediapipe-pose.ts'),
    },
  },
})
