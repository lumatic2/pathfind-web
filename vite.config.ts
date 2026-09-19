import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * 공개 사이트 빌드 — **정적 전용**이다 (M18, 2026-09-20).
 *
 * 대회가 끝나(2026-09-19 심사·발표 종료) 이 사이트는 제출물이 아니라 **프로젝트 소개**다.
 * 그래서 서버리스 함수(`api/`)와 Solar 호출 배선을 걷어냈고, 앱은 미리 녹화해 둔 조사 세 벌을
 * 재생한다(`frontend/src/lib/demo-player.ts`). 실행 중 밖으로 나가는 요청은 없다.
 *
 * ⚠ 참조 구현(`mabc-2026/reference-app`)의 설정을 그대로 가져오지 않는다 — 그쪽은 `server/*.mjs`
 *   9종을 물고 도는 개발 서버용이다. 여기에는 그 서버가 없다.
 * ⚠ 소스 경로는 `frontend/src` 를 유지한다 — `tsconfig.json` 의 `paths`·`include` 와
 *   `verify:design` 이 이 경로를 가리킨다. 바꾸면 타입 검사가 빈 대상을 돌고 초록으로 통과한다.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 데모 재생을 항상 켠다 — 이 레포의 빌드는 공개 사이트 하나뿐이다.
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('1') },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'frontend/src') },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        landing: path.resolve(import.meta.dirname, 'index.html'),
        app: path.resolve(import.meta.dirname, 'app.html'),
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 5199 },
});
