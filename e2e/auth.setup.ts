import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_FILE = 'e2e/.auth/user.json';

/** 登录一次并落盘 storageState，供其余用例复用（也避免反复登录触发频率限制） */
setup('登录测试账号', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto('/login');
  await page.getByPlaceholder('请输入邮箱或用户名').fill(process.env.TEST_EMAIL || 'test@poetry.ai');
  await page.getByPlaceholder('请输入密码').fill(process.env.TEST_PASSWORD || 'test123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  await expect(page).toHaveURL(/\/(home|workbench)/, { timeout: 30_000 });
  await page.goto('/workbench');
  await page.context().storageState({ path: AUTH_FILE });
});
