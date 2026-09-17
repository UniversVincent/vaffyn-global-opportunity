import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('fresh English browsers start in Chinese; switching preserves the draft and persists the choice', async ({
  page,
  baseURL,
}) => {
  const unexpectedRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== baseURL || url.pathname.startsWith('/api/')) {
      unexpectedRequests.push(request.url());
    }
  });
  await page.goto('/prepare');
  await expect(page).toHaveTitle('Vaffyn');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await expect(page.getByRole('heading', { name: '出海工作与生活' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '语言' })).toHaveText('简体中文');
  await page.getByRole('button', { name: '寻找具体岗位' }).click();
  const text = await page.getByRole('textbox').inputValue();
  expect(text).toContain('不要替我投递');

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overseas work & life' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '繁體中文', exact: true }).click();
  await expect(page.getByRole('heading', { name: '海外工作與生活' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await page.getByRole('button', { name: '準備求職資料' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('已有尚未傳送的草稿');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await page.getByRole('button', { name: '清除', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清除', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.getByRole('textbox')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe(JSON.stringify('zh-Hant'));
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overseas work & life' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox')).toHaveText('English');
  expect(unexpectedRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('a failed language load keeps the draft and reports the actual fallback language', async ({
  page,
}) => {
  await page.route(
    /\/(?:src\/locales\/zh-Hant\/translation\.json|assets\/locale-zh-Hant\.[^/]+\.js)/,
    (route) => route.abort('failed'),
  );
  await page.goto('/prepare');
  await page.getByRole('textbox').fill('合成草稿，不可因语言包失败而丢失');
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '繁體中文', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Unable to load this language. Please try again.',
  );
  await expect(page.getByRole('combobox')).toHaveText('English');
  await expect(page.getByRole('textbox')).toHaveValue('合成草稿，不可因语言包失败而丢失');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '简体中文', exact: true }).click();
  await expect(page.getByRole('heading', { name: '出海工作与生活' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Chinese draft actions, confirmation and failures stay localized', async ({ page }) => {
  await page.goto('/prepare');
  await page.getByRole('textbox').fill('只保留这段合成测试文字');
  await page.getByRole('button', { name: '准备求职材料' }).click();
  await page.getByRole('button', { name: '追加到草稿', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue(/^只保留这段合成测试文字\n\n帮我/);
  await page.getByRole('button', { name: '解读岗位要求' }).click();
  await page.getByRole('button', { name: '替换草稿', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue(/^帮我理解一个具体岗位/);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('synthetic denied')) },
      configurable: true,
    });
  });
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('复制失败，草稿仍保留在页面中。');
  await page.getByRole('button', { name: '清除', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('清除这份草稿？');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('textbox')).not.toHaveValue('');
});

test('translation failures do not disable recovery for broken core assets', async ({ page }) => {
  await page.goto('/prepare');
  await expect(page.getByRole('textbox')).toBeEditable();
  const result = await page.evaluate(() => {
    const target = window as Window & { __lcRecoverStaleAssets?: () => boolean };
    const original = target.__lcRecoverStaleAssets;
    let recoveries = 0;
    target.__lcRecoverStaleAssets = () => {
      recoveries += 1;
      return true;
    };
    const dispatch = (message: string) => {
      const event = new Event('vite:preloadError', { cancelable: true }) as Event & {
        payload: Error;
      };
      event.payload = new Error(message);
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    try {
      const dispatchResourceError = (asset: string) => {
        const link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = asset;
        const event = new Event('error');
        Object.defineProperty(event, 'target', { value: link });
        window.dispatchEvent(event);
      };
      dispatchResourceError('/assets/locale-zh-Hant.test.js');
      const optionalResourceRecoveries = recoveries;
      dispatchResourceError('/assets/index.test.js');
      const optionalPrevented = dispatch(
        'Failed to fetch dynamically imported module: /assets/locale-zh-Hant.test.js',
      );
      const corePrevented = dispatch(
        'Failed to fetch dynamically imported module: /assets/index.test.js',
      );
      return { recoveries, optionalPrevented, corePrevented, optionalResourceRecoveries };
    } finally {
      target.__lcRecoverStaleAssets = original;
    }
  });
  expect(result).toEqual({
    recoveries: 2,
    optionalPrevented: false,
    corePrevented: true,
    optionalResourceRecoveries: 0,
  });
});

test('customer metadata and loaded icons use the product brand', async ({ page, request }) => {
  await page.goto('/prepare');
  await expect(page.getByRole('banner')).toContainText('Vaffyn');
  await expect(page.locator('body')).not.toContainText(
    /LibreChat|OpenAI|Apify|React Query Devtools/i,
  );
  const icons = await page
    .locator('head link[rel="icon"], head link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  expect(icons.length).toBeGreaterThan(0);
  for (const url of icons) {
    expect(url).toContain('/assets/vaffyn');
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/');
  }
  if (process.env.PREPARATION_BUILD === 'true') {
    const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
    const response = await request.get(new URL(manifestUrl!, page.url()).href);
    const manifest = await response.json();
    expect(manifest.name).toBe('Vaffyn');
    expect(manifest.short_name).toBe('Vaffyn');
    for (const icon of manifest.icons) {
      expect(icon.src).toContain('assets/vaffyn');
      expect((await request.get(new URL(icon.src, page.url()).href)).ok()).toBe(true);
    }
  }
});

for (const width of [1440, 390, 320]) {
  test(`Chinese and Traditional Chinese layouts at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto('/prepare');
    await expect(page.getByRole('heading', { name: '出海工作与生活' })).toBeVisible();
    for (const mode of ['light', 'dark']) {
      if (mode === 'dark') {
        await page.getByRole('button', { name: '切换明暗主题' }).click();
        await expect(page.locator('html')).toHaveClass(/dark/);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await page
          .locator('header img')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`zh-Hans-${mode}.png`), fullPage: true });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: '繁體中文', exact: true }).click();
    await expect(page.getByRole('heading', { name: '海外工作與生活' })).toBeVisible();
    await page.getByRole('button', { name: '尋找具體職缺' }).click();
    await page.getByRole('button', { name: '準備求職資料' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath('zh-Hant-dialog.png'), fullPage: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('login shell is branded, Chinese-first and switchable with a synthetic config', async ({
  page,
}, testInfo) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/config') {
      await route.fulfill({
        json: {
          appTitle: 'LibreChat',
          emailLoginEnabled: true,
          registrationEnabled: true,
          socialLogins: [],
          interface: {},
        },
      });
      return;
    }
    await route.fulfill({ status: path.includes('refresh') ? 401 : 200, json: null });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByRole('banner')).toContainText('Vaffyn');
  await expect(page).toHaveTitle('Vaffyn');
  await expect(page.getByRole('combobox')).toHaveText('简体中文');
  await expect(page.locator('body')).not.toContainText('LibreChat');
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('listbox')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
});
