import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 真实浏览器端到端测试。
 * - webServer 自动启动/复用现有的 Vite 开发服务器（端口 28310，即项目固定端口），测试结束后由 Playwright 统一回收。
 * - 每个用例使用全新浏览器上下文：localStorage 天然隔离；用例内再显式清空，确保可重复连续运行。
 * - 在无 root 的环境里，Chromium 缺失的系统库以无 root 方式解压到 .playwright-libs（已 gitignore），
 *   通过 LD_LIBRARY_PATH 注入浏览器进程；目录不存在时（如 CI 已装系统库）则不注入。
 */
function localChromiumLdPath(): string | undefined {
  const root = path.resolve(__dirname, '.playwright-libs');
  if (!fs.existsSync(root)) {
    return undefined;
  }
  const dirs = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.includes('.so')) {
        dirs.add(path.dirname(full));
      }
    }
  };
  walk(root);
  if (dirs.size === 0) {
    return undefined;
  }
  const existing = process.env.LD_LIBRARY_PATH ? `${process.env.LD_LIBRARY_PATH}:` : '';
  return `${existing}${[...dirs].join(':')}`;
}

const ldPath = localChromiumLdPath();

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://localhost:28310',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      env: ldPath ? { ...process.env, LD_LIBRARY_PATH: ldPath } : process.env,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:28310/resumes',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
