import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react({
    jsxImportSource: '@emotion/react',
    babel: {
      plugins: ['@emotion/babel-plugin']
    }
  })],
  base: '/avatar-maker/',
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
    port: 5173
  }
}) 