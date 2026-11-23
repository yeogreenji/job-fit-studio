import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 프로젝트 사이트(https://yeogreenji.github.io/job-fit-studio/)에서도 열리도록
// Actions 빌드에서만 하위 경로를 base로 잡고, 로컬 dev는 그대로 '/'를 씁니다.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/job-fit-studio/' : '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5183, host: true },
  preview: { port: 4183, host: true },
  build: {
    // 화면 코드와 라이브러리를 나눠 첫 로딩과 캐시를 개선합니다.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
