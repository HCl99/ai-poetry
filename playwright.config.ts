import { defineConfig, devices } from '@playwright/test';

/**
 * 本机没装 Playwright 自带的 Chromium 时，可用系统浏览器跑：
 *   PowerShell: $env:E2E_CHANNEL="msedge"; npx playwright test
 * CI（ubuntu）保持默认 Chromium，不设置该变量即可。
 */
function launchUse(): Record<string, unknown> {
  return process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL as 'msedge' | 'chrome' } : {};
}

/**
 * 主流程 E2E：复用已在 3000 端口运行的 dev server；CI 里会自行启动。
 * 登录态在 auth.setup.ts 里生成一次，其余用例复用，避免触发登录频率限制。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: launchUse() },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json', ...launchUse() },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
