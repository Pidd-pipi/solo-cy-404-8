import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 端到端页面测试：jsdom 环境 + 真实页面/路由/store/localStorage。
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/e2e/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['tests/e2e/setup.ts'],
    globals: false,
    css: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: 'threads',
    poolOptions: { threads: { singleFork: true } },
  },
});
