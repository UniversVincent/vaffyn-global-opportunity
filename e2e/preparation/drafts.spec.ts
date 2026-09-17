import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lang', JSON.stringify('en')));
});

test('drafts are editable, cancellable, appendable, and never sent', async ({ page, baseURL }) => {
  const backendRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || url.origin !== baseURL) {
      backendRequests.push(request.url());
    }
  });
  await page.goto('/prepare');
  const input = page.getByRole('textbox', { name: 'Message input' });
  await expect(input).toBeEditable();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Find job opportunities' }).click();
  const question = await input.inputValue();
  expect(question).toContain('original source');
  await expect(input).toBeFocused();
  await input.fill('My experience and a specific job description.');
  await page.getByRole('button', { name: 'Prepare my materials' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(input).toHaveValue('My experience and a specific job description.');
  await page.getByRole('button', { name: 'Prepare my materials' }).click();
  await page.getByRole('button', { name: 'Add to draft' }).click();
  await expect(input).toHaveValue(/^My experience and a specific job description\.\n\nHelp me/);
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Understand a job posting' }).click();
  await page.getByRole('button', { name: 'Replace draft' }).click();
  await expect(input).toHaveValue(/^Help me understand a specific job posting\./);
  await input.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Not sent');

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, 'utf8')).toBe(await input.inputValue());
  expect(download.suggestedFilename()).toBe('overseas-question.txt');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(input).toHaveValue('');
  expect(backendRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('clipboard failure is reported and does not erase text', async ({ page }) => {
  await page.goto('/prepare');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
  });
  await page.getByRole('textbox').fill('Keep this draft');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Failed to copy to clipboard');
  await expect(page.getByRole('textbox')).toHaveValue('Keep this draft');
});

test('separate browser contexts do not share question drafts', async ({
  browser,
  page,
  baseURL,
}) => {
  await page.goto('/prepare');
  await page.getByRole('textbox').fill('Private test draft');
  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`${baseURL}/prepare`);
    await expect(otherPage.getByRole('textbox')).toHaveValue('');
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(storage).not.toContain('Private test draft');
  } finally {
    await otherContext.close();
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`layout and accessibility at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/prepare');
    await expect(page.getByRole('heading', { name: 'Overseas work & life' })).toBeVisible();
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      imagesLoaded: Array.from(document.images).every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    }));
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.imagesLoaded).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('light.png'), fullPage: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => localStorage.setItem('color-theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({ path: testInfo.outputPath('dark.png'), fullPage: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
