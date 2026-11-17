import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 開發時把 /api 轉給後端，瀏覽器只面對同一個來源（cookie 不需跨站設定）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_TARGET || 'http://localhost:3000' },
  },
});
