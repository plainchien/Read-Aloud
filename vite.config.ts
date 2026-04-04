import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { kokoroTtsDevProxy } from './vite-plugin-kokoro-tts'
import { publicApiDevProxy } from './vite-plugin-public-api'

const useRemoteApiProxy = Boolean(process.env.VITE_API_BASE?.trim())

export default defineConfig({
  base: "/readaloud/",
  plugins: [
    // 纯 npm run dev：在 5173 上直接处理 TTS，无需 vercel dev；设 VITE_API_BASE 时改用下方 proxy
    ...(useRemoteApiProxy ? [] : [kokoroTtsDevProxy(), publicApiDevProxy()]),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  server: {
    port: 5173,
    // Run with: npm run dev -- --host   (to access from mobile on same WiFi)
    // 仅当 VITE_API_BASE 设置时：把 /api 与 /readaloud/api 转到已部署环境
    proxy: process.env.VITE_API_BASE
      ? {
          "/api": { target: process.env.VITE_API_BASE, changeOrigin: true },
          "/readaloud/api": {
            target: process.env.VITE_API_BASE,
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/readaloud\/api/, "/api"),
          },
        }
      : undefined,
  },
})
