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
      '@': '/src'
    }
  },
  optimizeDeps: {
    include: [
      '@wagmi/core',
      '@web3modal/wagmi',
      'viem'
    ]
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/]
    },
    rollupOptions: {
      input: {
        main: 'index.html',
        'playground-gallery': 'playground-gallery.html',
        'based': 'based.html',
        'customs': 'customs.html',
        'details': 'details.html',
        'ogmfers': 'ogmfers.html'
      }
    }
  },
  server: {
    proxy: {
      '/cybermfers': {
        target: 'https://cybermfers.sfo3.digitaloceanspaces.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path
      }
    },
    host: true,
    port: 5173,
    allowedHosts: [
      '*.ngrok-free.app'
    ]
  }
}) 