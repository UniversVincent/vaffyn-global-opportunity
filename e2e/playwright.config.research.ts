import path from 'node:path';
import { defineConfig } from '@playwright/test';

const production = process.env.RESEARCH_BUILD === 'true';
const mode = production ? 'production' : 'development';
const port = production ? 3192 : 3190;
const outputRoot = `specs/.test-results/research/${mode}`;

export default defineConfig({
  testDir: './research',
  outputDir: `./${outputRoot}`,
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.resolve(__dirname, outputRoot, 'results.json') }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: 'chrome',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node ../node_modules/vite/bin/vite.js ${production ? 'preview' : ''} --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: path.resolve(__dirname, '../client'),
    url: `http://127.0.0.1:${port}/research`,
    reuseExistingServer: true,
    timeout: 120000,
    env: { NODE_ENV: 'development', HOST: '127.0.0.1', BACKEND_PORT: '3191' },
  },
});
