import { test, expect } from '@playwright/test';

/** 1. 未登录访问工作台应被重定向到登录页（不依赖登录态，先清空 storageState） */
test.describe('未登录访问控制', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('未登录访问 /workbench 重定向到登录页', async ({ page }) => {
    await page.goto('/workbench');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByPlaceholder('请输入邮箱或用户名')).toBeVisible();
  });
});

/** 2. 登录后进入工作台，侧边栏可见核心模块 */
test('登录后进入工作台并渲染侧边栏', async ({ page }) => {
  await page.goto('/workbench');
  await expect(page).toHaveURL(/\/workbench/);
  for (const label of ['智能注解', '风格迁移', '背诵闯关', '诗词测验']) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }
});

/** 3. 诗词测验：进入后渲染标题并给出题目（选项或填空） */
test('诗词测验可进入并渲染题目', async ({ page }) => {
  await page.goto('/workbench/quiz');
  await expect(page.getByRole('heading', { name: '诗词测验' })).toBeVisible();
  // 题目容器出现即视为渲染成功（AI 出题较慢，这里只等同题面）
  await expect(page.getByText(/选择题|填空题|鉴赏题|第\s*1\s*题/).first()).toBeVisible({ timeout: 30_000 });
});

/** 首次进入可能弹出新手引导，会遮挡点击 */
async function dismissGuide(page: import('@playwright/test').Page) {
  const skip = page.getByRole('button', { name: /跳过引导|跳过/ });
  if (await skip.count()) {
    await skip.first().click().catch(() => {});
  }
}

/** 4. 背诵闯关：按学段出题，开始后可换一首 */
test('背诵闯关可进入并可换一首', async ({ page }) => {
  await page.goto('/workbench/recite');
  await dismissGuide(page);
  await expect(page.getByRole('heading', { name: '背诵闯关' })).toBeVisible();
  await expect(page.getByText(/当前学段/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /开始闯关/ }).click();
  const switchBtn = page.getByRole('button', { name: /换一首/ });
  await expect(switchBtn).toBeVisible({ timeout: 30_000 });
  await switchBtn.click();
  // 换题后仍处于答题状态（学段提示在开局页，答题页不再显示）
  await expect(page.getByRole('button', { name: /交卷/ })).toBeVisible({ timeout: 30_000 });
});

/** 5. 数据大屏：检索趋势卡片与图表切换器可用 */
test('数据大屏渲染检索趋势并可切换图表形态', async ({ page }) => {
  await page.goto('/workbench/stats');
  await dismissGuide(page);
  await expect(page.getByText(/检索热力/).first()).toBeVisible({ timeout: 30_000 });
  for (const shape of ['折线', '柱状', '热力']) {
    const btn = page.getByRole('button', { name: shape });
    if (await btn.count()) {
      await btn.first().click();
    }
  }
  await expect(page.getByText(/检索热力/).first()).toBeVisible();
});
