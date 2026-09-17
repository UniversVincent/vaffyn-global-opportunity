import fs from 'node:fs';
import path from 'node:path';
import { isLocaleLoadError } from './assets';

describe('Optional language assets', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.invalid/assets/locale-zh-Hant.abc.js',
    'Failed to fetch dynamically imported module: https://example.invalid/chat/assets/locale-fr.abc.js?v=1',
    'Unable to preload /assets/locale-zh-Hans.abc.js',
    'Failed to fetch dynamically imported module: http://127.0.0.1/src/locales/zh-Hant/translation.json?import',
  ])('leaves translation failure to the existing English fallback: %s', (message) => {
    expect(isLocaleLoadError(new Error(message))).toBe(true);
  });

  it.each([
    'Failed to fetch dynamically imported module: https://example.invalid/assets/index.abc.js',
    'Unable to preload /assets/hooks.abc.js',
    'Unexpected error',
  ])('preserves core asset recovery: %s', (message) => {
    expect(isLocaleLoadError(new Error(message))).toBe(false);
  });

  it('does not classify an absent error as an optional translation', () => {
    expect(isLocaleLoadError()).toBe(false);
    expect(isLocaleLoadError(null)).toBe(false);
  });

  it('preserves the HTML placeholder used by the existing server language injector', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain('<html lang="en-US">');
    expect(html.replace(/lang="en-US"/g, 'lang="zh-Hant"')).toContain('<html lang="zh-Hant">');
  });
});
