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
        // 글꼴 조각(Pretendard 92개 3.0MB + Noto Serif KR 125개 4.3MB)은 precache하지
        // 않는다 — 설치 때 7MB를 받게 된다. 화면에 나온 글자의 조각만 처음 볼 때
        // 받아 두고 그 뒤로는 오프라인에서도 캐시에서 읽는다. 아직 못 받은 조각은
        // 기기 글꼴로 대신 그려질 뿐이라 핵심 기능의 네트워크 의존이 아니다(경계 4).
        runtimeCaching: [
          {
            urlPattern: /\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 250 },
            },
          },
        ],
      },
      manifest: {
        name: 'Ivan',
        short_name: 'Ivan',
        description: '네비게이토 주제별 성경암송(TMS) 60구절 — FSRS 간격 반복 + 축자 암기 훈련',
        lang: 'ko',
        display: 'standalone',
        background_color: '#0e121b',
        theme_color: '#0e121b',
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
