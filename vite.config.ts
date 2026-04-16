import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { kokoroTtsDevProxy } from './vite-plugin-kokoro-tts'
import { publicApiDevProxy } from './vite-plugin-public-api'

const useRemoteApiProxy = Boolean(process.env.VITE_API_BASE?.trim())

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname)
  Object.assign(process.env, loadEnv(mode, repoRoot, ''))

  return {
    base: '/readaloud/',
    plugins: [
      ...(useRemoteApiProxy ? [] : [kokoroTtsDevProxy(), publicApiDevProxy()]),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
    server: {
      port: 5173,
      host: true,
      strictPort: false,
      proxy: process.env.VITE_API_BASE
        ? {
            '/api': { target: process.env.VITE_API_BASE, changeOrigin: true },
            '/readaloud/api': {
              target: process.env.VITE_API_BASE,
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/readaloud\/api/, '/api'),
            },
          }
        : undefined,
    },
  }
})
