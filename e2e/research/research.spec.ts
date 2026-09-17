import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ResearchResponse, ResearchReport } from 'librechat-data-provider';

test('research navigation warns before leaving an unsaved preparation draft', async ({ page }) => {
  await page.goto('/prepare');
  await page.getByRole('textbox').fill('只用于测试的未发送草稿');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: '主题证据资料包', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('只用于测试的未发送草稿');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: '主题证据资料包', exact: true }).click();
  await expect(page).toHaveURL(/\/research$/u);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '新西兰签证体检：公开办理流程资料包',
  );
  await page.getByRole('link', { name: '问题准备', exact: true }).click();
  await expect(page).toHaveURL(/\/prepare$/u);
});

test('real sources, evidence expansion and downloaded canonical report agree', async ({
  page,
  baseURL,
}, testInfo) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.origin !== baseURL ||
      (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/research/sample'))
    ) {
      external.push(request.url());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/research');
  await expect(
    page.getByRole('heading', { name: '新西兰签证体检：公开办理流程资料包' }),
  ).toBeVisible();
  const response = await page.request.get('/api/research/sample');
  expect(response.status()).toBe(200);
  const { report }: ResearchResponse = await response.json();
  expect(report.sources).toHaveLength(5);
  expect(report.claims.every((claim) => claim.status === 'verified')).toBe(true);
  await page.getByTestId('claim-identity').getByText('查看依据', { exact: true }).click();
  await expect(page.getByTestId('claim-identity').getByRole('blockquote')).toHaveText(
    'The document must be an original',
  );
  await expect(page.getByRole('heading', { name: '缺失与未确认事项' })).toBeVisible();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出资料包', exact: true }).click();
  const download = await event;
  expect(download.suggestedFilename()).toContain(report.id.slice(0, 12));
  const filename = await download.path();
  expect(filename).not.toBeNull();
  const bytes = await readFile(filename!);
  const files = unzipSync(bytes);
  const exported: ResearchReport = JSON.parse(strFromU8(files['report.json']));
  expect(exported).toEqual(report);
  await testInfo.attach('topic-evidence-pack.zip', { body: bytes, contentType: 'application/zip' });
  await expect(page.getByRole('status')).toHaveText(
    '资料包已下载。这是一份固定快照，不会自动更新。',
  );
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.setContent(strFromU8(files['report.html']));
  await expect(page.getByRole('heading', { name: report.title, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('export-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('export-mobile.png'), fullPage: true });
});

test('refresh button makes a bounded live check and shows a new timestamp', async ({ page }) => {
  await page.goto('/research');
  const before: ResearchResponse = await (await page.request.get('/api/research/sample')).json();
  const cooldown = Math.max(0, Date.parse(before.nextRefreshAt) - Date.now());
  if (cooldown > 0) {
    await page.waitForTimeout(cooldown + 1100);
  }
  const response = page.waitForResponse(
    (result) =>
      result.url().endsWith('/api/research/sample/refresh') && result.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '检查资料更新', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const after: ResearchResponse = await result.json();
  expect(after.report.sources[0].checkedAt).not.toBe(before.report.sources[0].checkedAt);
  expect(after.report.sources.every((source) => source.status === 'verified')).toBe(true);
  await expect(page.getByText('本次核查后有一分钟冷却时间。')).toBeVisible();
  await expect(page.getByRole('button', { name: '检查资料更新', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '版本', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText(before.report.id.slice(0, 12));
});

test('language switch changes controls, retains original evidence and exposes report language', async ({
  page,
}) => {
  await page.goto('/research');
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export pack', exact: true })).toBeVisible();
  await expect(
    page.getByText('Report language: Simplified Chinese.', { exact: false }),
  ).toBeVisible();
  await page.getByTestId('claim-identity').getByText('View evidence', { exact: true }).click();
  await expect(page.getByRole('blockquote')).toHaveText('The document must be an original');
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '繁體中文', exact: true }).click();
  await expect(page.getByRole('button', { name: '匯出資料包', exact: true })).toBeVisible();
  await expect(page.getByRole('blockquote')).toHaveText('The document must be an original');
});

test('unavailable API and rejected archive are explicit errors, never fake success', async ({
  page,
}) => {
  await page.route('**/api/research/sample', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"RESEARCH_UNAVAILABLE"}',
    }),
  );
  await page.goto('/research');
  await expect(page.getByRole('alert')).toContainText('本地研究服务暂不可用');
  await expect(page.getByRole('button', { name: '导出资料包', exact: true })).toHaveCount(0);
  await page.unroute('**/api/research/sample');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.route('**/api/research/sample/archive/**', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: '{"error":"ARCHIVE_NEEDS_RECHECK"}',
    }),
  );
  await page.getByRole('button', { name: '导出资料包', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('导出失败或来源权限需要重新核验');
});

for (const width of [1440, 390, 320]) {
  for (const theme of ['dark', 'light']) {
    test(`reading, sources and versions fit ${width}px ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.addInitScript((value) => localStorage.setItem('color-theme', value), theme);
      await page.goto('/research');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        '新西兰签证体检：公开办理流程资料包',
      );
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      const brand = page.locator('header img').first();
      await expect(brand).toBeVisible();
      expect(
        await brand.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      ).toBe(true);
      for (const label of ['阅读', '来源', '版本']) {
        await page.getByRole('tab', { name: label, exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (label === '来源') {
          await page.getByText('版本指纹与许可', { exact: true }).first().click();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
        await page.screenshot({ path: testInfo.outputPath(`${label}.png`), fullPage: true });
      }
      await page.getByRole('tab', { name: '阅读', exact: true }).click();
      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations).toEqual([]);
    });
  }
}
