import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { GuestRequest, GuestReply, GuestState } from 'librechat-data-provider';

const fixtureReply: GuestReply = {
  kind: 'clarify',
  summary: '先聊聊你现在的工作，再看看有哪些方向。',
  questions: [
    {
      field: 'occupation',
      text: '你目前做什么工作？主要负责什么？',
      examples: ['财务分析', '设备维护'],
    },
  ],
  facts: [{ field: 'education', value: 'IT 本科', evidence: 'IT 本科' }],
};

async function fixture(page: Page, failOnce = false) {
  const state: GuestState = {
    membership: 'guest',
    username: null,
    remaining: 5,
    limit: 5,
    profile: { revision: 0, entries: [] },
    history: [],
    reviewedRequests: [],
  };
  const sent: GuestRequest[] = [];
  let failed = false;
  await page.route('**/api/guest/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/capabilities'))
      return route.fulfill({
        json: {
          chatAvailable: true,
          transcriptionAvailable: false,
          accountsAvailable: true,
          deepAvailable: false,
          preview: true,
        },
      });
    if (path.endsWith('/state')) return route.fulfill({ json: state });
    if (path.endsWith('/profile')) {
      const body = route.request().postDataJSON();
      state.profile = { ...body, revision: body.revision + 1 };
      state.reviewedRequests = state.history.map((entry) => entry.request.requestId);
      return route.fulfill({ json: { status: 'ok', profile: state.profile } });
    }
    if (path.endsWith('/session')) {
      state.history = [];
      return route.fulfill({ json: { cleared: true } });
    }
    if (path.endsWith('/proposals/dismiss')) {
      state.reviewedRequests.push(route.request().postDataJSON().requestId);
      return route.fulfill({ json: { status: 'ok' } });
    }
    if (path.endsWith('/turn')) {
      const request: GuestRequest = route.request().postDataJSON();
      sent.push(request);
      if (failOnce && !failed) {
        failed = true;
        return route.fulfill({ json: { status: 'unavailable' } });
      }
      state.remaining--;
      const reply = state.history.length ? { ...fixtureReply, facts: [] } : fixtureReply;
      state.history.push({ request, reply });
      return route.fulfill({
        json: {
          status: 'reply',
          reply,
          remaining: state.remaining,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: 'fixture does not implement this action' },
    });
  });
  return { state, sent };
}

test('chat-first dark homepage; short editable prompts; no sample, downloads, file upload or paid tools', async ({
  page,
}) => {
  const posts: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天想了解什么？');
  await expect(page.locator('input[type=file], a[download]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /资料包|sample|下载/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /深度研究|上传|导出/ })).toHaveCount(0);
  await page.getByRole('button', { name: '了解海外工作', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('我想去国外工作，先从哪里开始？');
  await page.getByRole('textbox').fill('我想去国外工作。我做设备维护。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('没有发送');
  await expect(page.getByRole('textbox')).toHaveValue('我想去国外工作。我做设备维护。');
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.locator('header img').evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
});

test('starter selection preserves existing draft until explicit replace or append', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('我的原稿');
  await page.getByRole('button', { name: '看懂一个政策', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('我的原稿');
  await page.getByRole('button', { name: '看懂一个政策', exact: true }).click();
  await page.getByRole('button', { name: /追加/ }).click();
  await expect(page.getByRole('textbox')).toHaveValue(/我的原稿.*\n.*帮我看懂/s);
});

test('five replies then login with editable fields; no sixth request; new chat does not replenish', async ({
  page,
}) => {
  const { state, sent } = await fixture(page);
  await page.goto('/');
  for (let index = 0; index < 5; index++) {
    await page.getByRole('textbox').fill(`IT 本科，第 ${index + 1} 个问题`);
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(page.getByText(`免费体验还剩 ${4 - index} 次`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('5 次体验已用完，登录或免费注册后继续。')).toBeVisible();
  await page.getByRole('textbox').fill('第六个问题保留草稿');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByLabel('用户名', { exact: true })).toBeVisible();
  await expect(page.getByLabel('密码', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  expect(sent).toHaveLength(5);
  await page.getByRole('button', { name: '创建新对话', exact: true }).click();
  await page.getByRole('button', { name: '清除', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(state.remaining).toBe(0);
  await expect(page.getByText('免费体验还剩 0 次', { exact: true })).toBeVisible();
});

test('profile extraction needs confirmation; correction, decline and deletion are explicit', async ({
  page,
}, testInfo) => {
  const { state } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('textbox').fill('IT 本科，现在做财务分析');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('你目前做什么工作？');
  expect(state.profile.entries).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('mobile-conversation-fixture.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '核对我的资料', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('待确认');
  await page.locator('#profile-education').fill('本科信息技术，工作经验另说');
  expect(state.profile.entries).toEqual([]);
  await page.getByRole('button', { name: '确认并保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.profile.entries).toEqual([
    { field: 'education', value: '本科信息技术，工作经验另说', status: 'confirmed' },
  ]);
  await page.getByRole('button', { name: '我的海外档案', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '确认并保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.profile.entries[0].status).toBe('declined');
  await page.getByRole('button', { name: '我的海外档案', exact: true }).click();
  await page.getByRole('button', { name: '删除 学历与专业', exact: true }).click();
  await page.getByRole('button', { name: '确认并保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.profile.entries).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: '核对我的资料', exact: true })).toHaveCount(0);
});

test('failed reply keeps draft/request ID, retry succeeds without duplicate charge', async ({
  page,
}) => {
  const { sent } = await fixture(page, true);
  await page.goto('/');
  await page.getByRole('textbox').fill('IT 本科');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('草稿已保留');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('log')).toBeVisible();
  expect(sent[0]).toEqual(sent[1]);
  await page.getByRole('button', { name: '财务分析', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('财务分析');
  expect(sent).toHaveLength(2);
});

test('actual local registration/login/profile persistence/logout, isolated from existing site accounts', async ({
  page,
}) => {
  const username = 'e2e_' + randomUUID().replace(/-/g, '').slice(0, 16);
  const password = 'Local synthetic passphrase 123!';
  await page.goto('/');
  await page.getByRole('textbox').fill('登录后再继续问的问题');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '还没有账号？免费注册', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('再次输入密码', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: '免费注册', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('今天还可聊 10 次', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('登录后再继续问的问题');
  await page.getByRole('textbox').fill('');
  await page.getByRole('button', { name: '我的海外档案', exact: true }).click();
  await page.getByRole('button', { name: '补充一项', exact: true }).click();
  await page.locator('#profile-occupation').fill('测试财务分析师');
  await page.getByRole('button', { name: '确认并保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '我的海外档案', exact: true }).click();
  await expect(page.locator('#profile-occupation')).toHaveValue('测试财务分析师');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByText('免费体验还剩 5 次', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByLabel('用户名', { exact: true })).toBeVisible();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('今天还可聊 10 次', { exact: true })).toBeVisible();
});

test('direct research routes require membership; plan screen cannot buy or self-upgrade', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url());
  });
  await page.goto('/research');
  await expect(page).toHaveURL(/membership=1/);
  await expect(page.getByRole('dialog')).toContainText('暂未开放购买');
  await expect(page.getByRole('dialog')).toContainText('普通会员');
  await expect(page.getByRole('dialog')).toContainText('高级会员');
  await expect(page.getByRole('dialog')).not.toContainText('增加研究额度');
  expect((await page.request.get('/api/research/sample')).status()).toBe(403);
  expect((await page.request.get('/api/research/sample/archive/' + 'a'.repeat(64))).status()).toBe(
    403,
  );
  expect(posts).toEqual([]);
});

test('settings switches language and appearance without losing composer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('保留草稿');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'What would you like to explore?',
  );
  await expect(page.getByRole('textbox')).toHaveValue('保留草稿');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: /繁體中文/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今天想了解什麼？');
});

test('voice remains local with honest transcription state and no download affordance', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['microphone']);
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '录音试听', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('语音转文字尚未接通');
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: /停止录音/ })).toBeVisible();
  await page.getByRole('button', { name: /停止录音/ }).click();
  await expect(page.locator('audio[controls]')).toBeVisible();
  await expect(page.locator('a[download]')).toHaveCount(0);
  await page.getByRole('button', { name: '删除', exact: true }).click();
  expect(posts).toEqual([]);
});

test('mobile account and profile dialogs remain usable, scrollable and accessible', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '还没有账号？免费注册', exact: true }).click();
  await expect(page.getByLabel('再次输入密码', { exact: true })).toBeVisible();
  let bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(666);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('mobile-registration.png'), fullPage: true });
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '我的海外档案', exact: true }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '学历与专业', exact: true }).click();
  await page.getByRole('button', { name: '补充一项', exact: true }).click();
  await page.locator('#profile-education').fill('仅测试：本科信息技术，工作经历需要另行确认');
  await expect(page.getByRole('dialog')).toContainText('待确认');
  bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(666);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('mobile-profile.png'), fullPage: true });
});

for (const viewport of [
  { width: 1440, height: 900, theme: 'dark' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 320, height: 740, theme: 'light' },
])
  test(`layout and accessibility ${viewport.width} ${viewport.theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((theme) => localStorage.setItem('color-theme', theme), viewport.theme);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('textbox')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const composer = await page.getByRole('textbox').boundingBox();
    const prompt = await page
      .getByRole('button', { name: '了解海外工作', exact: true })
      .boundingBox();
    expect(composer!.height).toBeGreaterThan(prompt!.height * 2);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`homepage-${viewport.width}-${viewport.theme}.png`),
      fullPage: true,
    });
  });
