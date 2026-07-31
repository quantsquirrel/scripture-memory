import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/scripture-memory/',
  // vitest는 tests/만 본다 — e2e/는 Playwright 러너 몫이고 *.spec.ts 기본 패턴에
  // 걸려 vitest가 집어 가면 실패한다.
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // 커버리지 목표는 도메인 코어다 — 규칙이 여기 있고, 어댑터·뷰는 E2E가 본다
      include: ['src/domain/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '주제별 성경암송 — 개역한글',
        short_name: '말씀암송',
        description: '네비게이토 주제별 성경암송(TMS) 60구절 — FSRS 간격 반복 + 축자 암기 훈련',
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
