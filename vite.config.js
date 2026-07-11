import { defineConfig } from 'vite';

// base: './' → 서브경로 정적 호스팅(GitHub Pages 등)에서도 자산 경로가 깨지지 않음.
// server.host: true → `npm run dev`가 LAN에 노출되어 같은 와이파이의 아이패드로 접속 가능.
export default defineConfig({
  base: './',
  server: {
    host: true,
  },
});
