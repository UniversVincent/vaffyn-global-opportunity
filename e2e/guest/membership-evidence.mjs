import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const relative = (filename) => path.relative(root, filename).split(path.sep).join('/');
const hash = async (filename) => ({
  path: relative(filename),
  sha256: createHash('sha256')
    .update(await readFile(filename))
    .digest('hex'),
});
async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(filename)));
    else found.push(filename);
  }
  return found;
}
const reports = [];
for (const name of [
  'membership-unit.json',
  'membership-client-unit.json',
  'guest/development/results.json',
  'guest/production/results.json',
]) {
  const filename = path.join(root, 'e2e/specs/.test-results', name);
  const value = JSON.parse(await readFile(filename, 'utf8'));
  if (name.endsWith('-unit.json')) {
    if (!value.success || value.numFailedTests || value.numPendingTests)
      throw new Error('Unit validation incomplete');
    reports.push({
      ...(await hash(filename)),
      passed: value.numPassedTests,
      suites: value.numPassedTestSuites,
    });
  } else {
    if (
      value.stats.unexpected ||
      value.stats.flaky ||
      value.stats.skipped ||
      value.errors.length ||
      value.stats.expected !== 13
    )
      throw new Error('Browser validation incomplete');
    reports.push({ ...(await hash(filename)), stats: value.stats });
  }
}
const sourceFiles = [
  'client/index.html',
  'client/src/routes/index.tsx',
  'client/src/components/Nav/Language.tsx',
  'client/src/components/Chat/Input/StarterList.tsx',
  'packages/client/src/components/Dialog.tsx',
  'packages/client/src/components/Textarea.tsx',
  'packages/data-provider/src/types/guest.ts',
  'packages/data-provider/src/data-service.ts',
  'packages/data-provider/src/api-endpoints.ts',
  'packages/data-schemas/src/preview/store.cts',
  'packages/data-schemas/tsconfig.preview.json',
  'packages/api/tsconfig.research.json',
  'packages/api/src/research/server.ts',
  'client/src/locales/en/translation.json',
  'client/src/locales/zh-Hans/translation.json',
  'client/src/locales/zh-Hant/translation.json',
  'client/dist/index.html',
  'e2e/playwright.config.guest.ts',
  'e2e/guest/guest.spec.ts',
  'e2e/guest/membership-evidence.mjs',
  'privatecloud/guest-preview.env.example',
].map((filename) => path.join(root, filename));
for (const directory of [
  'client/src/components/Overseas/Guest',
  'client/src/data-provider/Guest',
  'packages/api/src/guest',
])
  sourceFiles.push(...(await files(path.join(root, directory))));
const codeFiles = [];
for (const filename of sourceFiles.sort()) codeFiles.push(await hash(filename));
const artifacts = [];
for (const mode of ['development', 'production'])
  for (const filename of await files(path.join(root, 'e2e/specs/.test-results/guest', mode)))
    if (filename.endsWith('.png')) artifacts.push(await hash(filename));
const capabilities = await (await fetch('http://127.0.0.1:3191/api/guest/capabilities')).json();
const blocked = await fetch('http://127.0.0.1:3191/api/research/sample');
if (
  capabilities.chatAvailable !== false ||
  capabilities.accountsAvailable !== true ||
  blocked.status !== 403
)
  throw new Error('Runtime gates do not match the verified scope');
const evidence = {
  recordedAt: new Date().toISOString(),
  scope:
    'Loopback chat UX, synthetic model contracts, real isolated SQLite test accounts, profile confirmation and authorization. Not live AI/STT/search/payment/public deployment or production user migration.',
  apiCapabilities: capabilities,
  anonymousResearchStatus: blocked.status,
  reports,
  codeFiles,
  artifacts,
};
const destination = path.join(
  root,
  'docs/overseas-ai/evidence/20260913/chat-membership-validation.json',
);
await writeFile(destination, JSON.stringify(evidence, null, 2) + '\n');
console.log(
  JSON.stringify({
    path: relative(destination),
    reports: reports.length,
    sourceFiles: codeFiles.length,
    screenshots: artifacts.length,
  }),
);
