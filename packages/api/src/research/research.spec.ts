import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import type { Server } from 'node:http';
import {
  claims,
  sources,
  policyReview,
  licenseUrl,
  robotsUrl,
  freshnessMs,
  cooldownMs,
} from './registry';
import { ResearchService, supportsCitation } from './service';
import { createResearchServer } from './server';
import { createArchive, renderReport } from './export';
import { validateSourceUrl } from './fetch';
import { extractPage, digest } from './parser';
import { ResearchStore } from './store';

const html = (body: string) =>
  `<html><script>untrusted()</script><nav>IGNORE NAV</nav><main><div class="content-page__main"><h1>Public procedure</h1><p>${'Public information. '.repeat(15)}</p>${body}</div></main><footer>IGNORE FOOTER</footer></html>`;
const fixedTime = new Date('2026-09-13T11:00:00.000Z');
const originalHashes = sources.map((source) => source.reviewedHash);
const originalPolicy = { ...policyReview };
let store: ResearchStore;
let service: ResearchService;
let now: Date;
let documents: Map<string, string>;
let calls: string[];
let server: Server | undefined;

beforeEach(async () => {
  store = new ResearchStore(await fs.mkdtemp(path.join(os.tmpdir(), 'vaffyn-research-test-')));
  await store.initialize();
  now = new Date(fixedTime);
  calls = [];
  documents = new Map([
    [robotsUrl, 'User-agent: *\nDisallow: /private\n'],
    [licenseUrl, html('<h2>License</h2><p>Fixture permission</p>')],
  ]);
  for (const source of sources) {
    const citations = claims.flatMap((claim) =>
      claim.citations.filter((citation) => citation.sourceId === source.id),
    );
    const body = html(
      citations
        .map((citation) => `<h2>${citation.section}</h2><p>${citation.quotation}</p>`)
        .join('') + '<a href="https://www.immigration.govt.nz/fixture.pdf">Related form</a>',
    );
    documents.set(source.url, body);
    source.reviewedHash = extractPage(body, source.url).hash;
  }
  policyReview.robotsHash = digest(
    JSON.stringify({
      sections: [{ heading: 'robots.txt', text: documents.get(robotsUrl) }],
      links: [],
    }),
  );
  policyReview.licenseHash = extractPage(documents.get(licenseUrl) ?? '', licenseUrl).hash;
  service = new ResearchService(
    store,
    async (url) => {
      calls.push(url);
      const body = documents.get(url);
      if (!body) {
        throw new Error('EXTERNAL_SOURCE_FAILED');
      }
      return { body, lastModified: 'Sun, 13 Sep 2026 00:00:00 GMT' };
    },
    () => now,
  );
});

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error ? reject(error) : resolve())),
    );
    server = undefined;
  }
  sources.forEach((source, index) => {
    source.reviewedHash = originalHashes[index];
  });
  Object.assign(policyReview, originalPolicy);
  const target = path.resolve(store.directory);
  if (
    path.dirname(target) !== path.resolve(os.tmpdir()) ||
    !path.basename(target).startsWith('vaffyn-research-test-')
  ) {
    throw new Error('UNSAFE_TEST_CLEANUP');
  }
  await fs.rm(target, { recursive: true });
});

test('extracts only structured main content, ignores active HTML, and fingerprints links', () => {
  const page = extractPage(
    html(
      '<h2>Identity</h2><p>Original &amp; valid</p><script>BAD</script><a href="javascript:alert(1)">unsafe</a><a href="/one">One</a>',
    ),
    sources[0].url,
  );
  expect(page.text).toContain('Original & valid');
  expect(page.text).not.toMatch(/IGNORE|BAD|untrusted/);
  expect(page.links).toEqual([{ title: 'One', url: 'https://www.immigration.govt.nz/one' }]);
  expect(
    extractPage(
      html('<h2>Identity</h2><p>Original &amp; valid</p><a href="/two">One</a>'),
      sources[0].url,
    ).hash,
  ).not.toBe(page.hash);
});

test('fails closed when the source layout or title is missing', () => {
  expect(() => extractPage('<main>Fallback text</main>', sources[0].url)).toThrow(
    'CONTENT_LAYOUT_CHANGED',
  );
  expect(() =>
    extractPage('<div class="content-page__main">Incomplete</div>', sources[0].url),
  ).toThrow('CONTENT_INCOMPLETE');
});

test.each([
  'http://127.0.0.1/private',
  'https://127.0.0.1/',
  'https://www.immigration.govt.nz.evil.test/',
  'https://user:pass@www.immigration.govt.nz/robots.txt',
  `${sources[0].url}?target=private`,
  'https://www.immigration.govt.nz/_list-collection-search/',
  'file:///etc/passwd',
])('rejects unapproved URL %s', (url) => {
  expect(() => validateSourceUrl(url)).toThrow();
});

test('requires an exact section and nonempty quote; a matching phrase elsewhere is insufficient', () => {
  const page = extractPage(
    html('<h2>Correct section</h2><p>original evidence</p>'),
    sources[0].url,
  );
  expect(supportsCitation(page, 'Correct section', 'original evidence')).toBe(true);
  expect(supportsCitation(page, 'Wrong section', 'original evidence')).toBe(false);
  expect(supportsCitation(page, 'Correct section', '')).toBe(false);
});

test('a fresh read has bounded sources, real support checks, no implied policy effective date, and visible gaps', async () => {
  const { report } = await service.refresh();
  expect(calls).toEqual([robotsUrl, licenseUrl, ...sources.map((source) => source.url)]);
  expect(report.claims.every((claim) => claim.status === 'verified')).toBe(true);
  expect(
    report.sources.every((source) => source.effectiveAt === null && source.versionCount === 1),
  ).toBe(true);
  expect(report.gaps.map((gap) => gap.id)).toEqual(
    expect.arrayContaining(['directory', 'eligibility', 'attachments']),
  );
  expect(report.gaps.some((gap) => gap.url?.endsWith('/fixture.pdf'))).toBe(true);
  expect(report.complete).toBe(false);
});

test('reuses an unchanged source version and blocks rapid duplicate fetches', async () => {
  const first = await service.refresh();
  await expect(service.refresh()).rejects.toThrow('REFRESH_COOLDOWN');
  now = new Date(now.getTime() + cooldownMs + 1);
  const second = await service.refresh();
  expect(second.report.sources.map((source) => source.hash)).toEqual(
    first.report.sources.map((source) => source.hash),
  );
  expect(second.report.sources.every((source) => source.versionCount === 1)).toBe(true);
  expect(second.report.sources[0].checkedAt).not.toBe(first.report.sources[0].checkedAt);
});

test('a changed source keeps old evidence immutable and invalidates review even if the quotation survives', async () => {
  const first = await service.refresh();
  const source = sources[3];
  documents.set(
    source.url,
    (documents.get(source.url) ?? '').replace('</div>', '<p>New exception.</p></div>'),
  );
  now = new Date(now.getTime() + cooldownMs + 1);
  const changed = await service.refresh();
  expect(changed.report.sources[3].status).toBe('review_required');
  expect(changed.report.sources[3].versionCount).toBe(2);
  expect(changed.report.claims.find((claim) => claim.id === 'identity')?.status).toBe(
    'review_required',
  );
  expect(await store.report(first.report.id)).toEqual(first.report);
  expect(await store.page(source.id, first.report.sources[3].hash ?? '')).toBeDefined();
});

test('a failed child page preserves last successful time and is not silently replaced by old success', async () => {
  const first = await service.refresh();
  documents.delete(sources[3].url);
  now = new Date(now.getTime() + cooldownMs + 1);
  const failed = await service.refresh();
  expect(failed.report.sources[3].status).toBe('unavailable');
  expect(failed.report.sources[3].checkedAt).toBe(first.report.sources[3].checkedAt);
  expect(failed.report.sources[3].lastAttemptAt).not.toBe(first.report.sources[3].lastAttemptAt);
  expect(failed.report.gaps.some((gap) => gap.id === 'source-identity')).toBe(true);
});

test('freshness expires without a new request and never upgrades checked time', async () => {
  const first = await service.refresh();
  now = new Date(now.getTime() + freshnessMs + 1);
  const stale = await service.current();
  expect(stale.report.claims.every((claim) => claim.status !== 'verified')).toBe(true);
  expect(stale.report.sources[0].checkedAt).toBe(first.report.sources[0].checkedAt);
  expect(calls).toHaveLength(7);
});

test('policy review expiry is independent of a successful live fetch', async () => {
  now = new Date('2026-11-01T00:00:00.000Z');
  const { report } = await service.refresh();
  expect(report.sources.every((source) => source.status === 'review_required')).toBe(true);
});

test('a robots change stops crawling and disables original exports', async () => {
  await service.refresh();
  calls.length = 0;
  documents.set(robotsUrl, 'User-agent: *\nDisallow: /\n');
  now = new Date(now.getTime() + cooldownMs + 1);
  const { report } = await service.refresh();
  expect(calls).toEqual([robotsUrl]);
  expect(report.sources.every((source) => source.rights === 'link_only')).toBe(true);
  const files = unzipSync(Buffer.from(createArchive(report).base64, 'base64'));
  expect(Object.keys(files).some((name) => name.startsWith('excerpts/'))).toBe(false);
  expect(
    report.claims.every((claim) => claim.citations.every((citation) => citation.quotation === '')),
  ).toBe(true);
});

test('license changes stop content collection rather than inferring continued permission', async () => {
  documents.set(licenseUrl, html('<h2>Permission</h2><p>Changed terms.</p>'));
  const { report } = await service.refresh();
  expect(calls).toEqual([robotsUrl, licenseUrl]);
  expect(report.sources.every((source) => source.rights === 'link_only')).toBe(true);
});

test('archive is a real ZIP containing the identical report, source index, and only bounded excerpts', async () => {
  const { report } = await service.refresh();
  const archive = createArchive(report);
  const bytes = Buffer.from(archive.base64, 'base64');
  expect(digest(bytes)).toBe(archive.sha256);
  const files = unzipSync(bytes);
  expect(JSON.parse(strFromU8(files['report.json']))).toEqual(report);
  expect(strFromU8(files['report.html'])).toContain(report.id);
  expect(strFromU8(files['source-index.csv'])).toContain('effectiveAt');
  expect(Object.keys(files).filter((name) => name.startsWith('excerpts/'))).toHaveLength(5);
  expect(Object.keys(files).some((name) => /\.pdf$/u.test(name))).toBe(false);
  expect(strFromU8(files['excerpts/identity.txt'])).not.toContain('Public information.');
});

test('export escapes source text and protects spreadsheet cells from formulas', async () => {
  const { report } = await service.refresh();
  report.claims[0].explanation = '<script>alert(1)</script>';
  report.sources[0].title = '=HYPERLINK("bad")';
  expect(renderReport(report)).not.toContain('<script>');
  expect(renderReport(report)).toContain('&lt;script&gt;');
  const files = unzipSync(Buffer.from(createArchive(report).base64, 'base64'));
  expect(strFromU8(files['source-index.csv'])).toContain("'=HYPERLINK");
});

test('detects evidence corruption and refuses path traversal', async () => {
  const { report } = await service.refresh();
  const source = report.sources[0];
  const file = path.join(store.directory, 'snapshots', `${source.id}-${source.hash}.json`);
  const page = await store.page(source.id, source.hash ?? '');
  page.sections[0].text = 'Tampered';
  await fs.writeFile(file, JSON.stringify(page));
  await expect(store.page(source.id, source.hash ?? '')).rejects.toThrow(
    'SNAPSHOT_INTEGRITY_FAILED',
  );
  expect((await service.current()).report.sources[0].status).toBe('unavailable');
  await expect(store.report('../../state')).rejects.toThrow('INVALID_RECORD_ID');
});

async function request(
  route: string,
  method = 'GET',
  headers: http.OutgoingHttpHeaders = {},
  body = '',
) {
  if (!server) {
    server = createResearchServer(service, undefined, () => true);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  }
  const port = (server.address() as { port: number }).port;
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}${route}`, { method, headers }, (res) => {
      let text = '';
      res.on('data', (chunk: Buffer) => {
        text += chunk.toString('utf8');
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('real local HTTP rejects cross-site calls, arbitrary topics, credentials, and individual inputs', async () => {
  expect((await request('/api/research/sample', 'GET', { Host: 'evil.test' })).status).toBe(403);
  expect(
    (await request('/api/research/sample', 'GET', { Origin: 'https://evil.test' })).status,
  ).toBe(403);
  expect((await request('/api/research/sample?question=eligible')).status).toBe(404);
  expect(
    (
      await request(
        '/api/research/sample/refresh',
        'POST',
        { Origin: 'http://127.0.0.1:3190', 'Content-Type': 'application/json' },
        '{"question":"eligible"}',
      )
    ).status,
  ).toBe(400);
  expect((await request('/api/research/sample/refresh', 'POST', {}, '{}')).status).toBe(403);
  const good = await request(
    '/api/research/sample/refresh',
    'POST',
    { Origin: 'http://127.0.0.1:3190', 'Content-Type': 'application/json' },
    '{}',
  );
  expect(good.status).toBe(200);
  expect(good.body).not.toMatch(/api[_-]?key|authorization|stack/i);
});

test('a historical archive is blocked when the current license is no longer approved', async () => {
  const { report } = await service.refresh();
  documents.set(licenseUrl, html('<h2>License</h2><p>Permission changed</p>'));
  now = new Date(now.getTime() + cooldownMs + 1);
  await service.refresh();
  expect((await request(`/api/research/sample/archive/${report.id}`)).status).toBe(409);
});
