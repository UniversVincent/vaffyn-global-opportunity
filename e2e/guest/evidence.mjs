import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const relative = (filename) => path.relative(root, filename).split(path.sep).join('/');
const hashFile = async (filename) => ({
  path: relative(filename),
  sha256: createHash('sha256')
    .update(await readFile(filename))
    .digest('hex'),
});
async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(filename)));
    else files.push(filename);
  }
  return files;
}

const results = [];
for (const name of [
  'guest-research-unit.json',
  'documents-unit.json',
  'guest/development/results.json',
  'guest/production/results.json',
  'research/development/results.json',
  'research/production/results.json',
]) {
  const filename = path.join(root, 'e2e/specs/.test-results', name);
  const report = JSON.parse(await readFile(filename, 'utf8'));
  if (name.endsWith('unit.json')) {
    if (!report.success || report.numFailedTests || report.numPendingTests)
      throw new Error(`Incomplete unit report: ${name}`);
    results.push({
      ...(await hashFile(filename)),
      passed: report.numPassedTests,
      suites: report.numPassedTestSuites,
    });
  } else {
    if (
      report.stats.unexpected ||
      report.stats.flaky ||
      report.stats.skipped ||
      report.errors.length ||
      !report.stats.expected
    )
      throw new Error(`Incomplete browser report: ${name}`);
    results.push({ ...(await hashFile(filename)), stats: report.stats });
  }
}
const files = [
  'client/src/routes/index.tsx',
  'client/src/data-provider/index.ts',
  'client/src/locales/en/translation.json',
  'client/src/locales/zh-Hans/translation.json',
  'client/src/locales/zh-Hant/translation.json',
  'client/package.json',
  'package-lock.json',
  'packages/data-provider/src/types/guest.ts',
  'packages/data-provider/src/types/research.ts',
  'packages/data-provider/src/api-endpoints.ts',
  'packages/data-provider/src/data-service.ts',
  'packages/data-provider/src/keys.ts',
  'packages/data-provider/src/index.ts',
  'packages/api/tsconfig.research.json',
  'client/dist/index.html',
  'client/dist/assets/vaffyn.svg',
  'e2e/playwright.config.guest.ts',
  'e2e/playwright.config.research.ts',
  'privatecloud/guest-preview.env.example',
].map((filename) => path.join(root, filename));
for (const directory of [
  'client/src/components/Overseas',
  'client/src/data-provider/Guest',
  'client/src/data-provider/Research',
  'packages/api/src/guest',
  'packages/api/src/research',
  'e2e/guest',
  'e2e/research',
])
  files.push(...(await collect(path.join(root, directory))));
const hashes = [];
for (const filename of files.sort()) hashes.push(await hashFile(filename));
const artifacts = [];
for (const feature of ['guest', 'research']) {
  for (const mode of ['development', 'production']) {
    const directory = path.join(root, 'e2e/specs/.test-results', feature, mode);
    for (const filename of await collect(directory)) {
      if (/\.(png|zip)$/u.test(filename)) artifacts.push(await hashFile(filename));
    }
  }
}
const response = await fetch('http://127.0.0.1:3191/api/guest/capabilities');
const capabilities = await response.json();
if (!response.ok || capabilities.chatAvailable !== false)
  throw new Error('Preview must remain offline');
const output = {
  recordedAt: new Date().toISOString(),
  scope:
    'Local guest chat UI, ephemeral intake contract, local document and audio drafts, fixed public research sample. Not live AI, STT, account, payment or public-release acceptance.',
  apiCapabilities: capabilities,
  reports: results,
  codeFiles: hashes,
  artifacts,
};
const destination = path.join(
  root,
  'docs/overseas-ai/evidence/20260913/guest-research-validation.json',
);
await writeFile(destination, JSON.stringify(output, null, 2) + '\n', { encoding: 'utf8' });
console.log(
  JSON.stringify({
    path: relative(destination),
    reports: results.length,
    files: hashes.length,
    chatAvailable: capabilities.chatAvailable,
  }),
);
