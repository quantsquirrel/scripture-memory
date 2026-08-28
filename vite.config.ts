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
      workbox: {
        // 개역한글 전문 청크가 workbox 기본 한도 2 MiB를 넘는다. 넘으면
        // vite-plugin-pwa가 경고가 아니라 빌드 실패로 죽고, 한도만 낮춰
        // 넘어가면 precache에서 조용히 빠져 오프라인에서 사슬 본문이 빈다
        // (하드 경계 4). 묵상 탭이 닿는 절은 66권 전부에 흩어져 있어
        // 런타임 캐시로는 1년에 63일이 깨진다 — 통째로 미리 받는다.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Ivan',
        short_name: 'Ivan',
        description: '네비게이토 주제별 성경암송(TMS) 60구절 — FSRS 간격 반복 + 축자 암기 훈련',
        lang: 'ko',
        display: 'standalone',
        background_color: '#0b1120',
        theme_color: '#0b1120',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
