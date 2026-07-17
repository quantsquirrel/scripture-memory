import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/scripture-memory/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '주제별 성경암송 — 개역한글',
        short_name: '말씀암송',
        description:
          '네비게이토 주제별 성경암송(TMS) 60구절 — FSRS 간격 반복 + 축자 암기 훈련',
        lang: 'ko',
        display: 'standalone',
        background_color: '#10141f',
        theme_color: '#2f3c5c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
