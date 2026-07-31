import { defineConfig, devices } from '@playwright/test'

/**
 * E2E는 프로덕션 빌드(vite preview)를 대상으로 돈다 — 서비스 워커와 base 경로
 * ('/scripture-memory/')가 개발 서버와 다르기 때문에, 오프라인·PWA 검증은
 * 빌드 결과에서만 의미가 있다.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
    // 서비스 워커를 쓰므로 컨텍스트를 격리해 캐시가 섞이지 않게 한다
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // 모바일 터치 타깃과 하단 탭 확인용
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/scripture-memory/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
