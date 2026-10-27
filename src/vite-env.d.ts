/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** 6자리 코드 연동 릴레이(worker/pairing-relay.ts) 주소. 비우면 기능이 꺼진다. */
  readonly VITE_PAIRING_RELAY_URL?: string
}
