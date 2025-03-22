import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin']
      }
    })
  ],
  base: '/avatar-maker/',
  resolve: {
    alias: {
      '@': '/src',
      'use-sync-external-store/shim/with-selector': 'use-sync-external-store/shim/with-selector.js'
    }
  },
  optimizeDeps: {
    include: [
      '@wagmi/core',
      '@web3modal/wagmi',
      'viem',
      'use-sync-external-store/shim/with-selector.js'
    ]
  },
  build: {
    outDir: 'dist',
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          web3: ['wagmi', 'viem', '@web3modal/wagmi']
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: [
      '*.ngrok-free.app'
    ]
  }
}) 