import https from 'node:https';
import { createSSRFSafeAgents } from '../auth/agent';
import { licenseUrl, robotsUrl, sources } from './registry';

export interface FetchResult {
  body: string;
  lastModified: string | null;
}

const allowedUrls = new Set([robotsUrl, licenseUrl, ...sources.map((source) => source.url)]);

export function validateSourceUrl(value: string): URL {
  const url = new URL(value);
  if (
    !allowedUrls.has(url.href) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    url.search
  ) {
    throw new Error('SOURCE_NOT_APPROVED');
  }
  return url;
}

export function fetchSource(value: string, redirects = 0): Promise<FetchResult> {
  const url = validateSourceUrl(value);
  const { httpAgent, httpsAgent } = createSSRFSafeAgents(null, null, { blockLiteralHosts: true });
  return new Promise<FetchResult>((resolve, reject) => {
    const request = https.get(
      url,
      {
        agent: httpsAgent,
        signal: AbortSignal.timeout(15_000),
        headers: {
          'User-Agent': 'VaffynResearchPreview/1.0 (bounded public-source verification)',
          Accept: value === robotsUrl ? 'text/plain' : 'text/html',
          'Accept-Encoding': 'identity',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.resume();
          if (redirects >= 2 || !response.headers.location) {
            reject(new Error('REDIRECT_LIMIT'));
            return;
          }
          try {
            const target = validateSourceUrl(new URL(response.headers.location, url).href);
            resolve(fetchSource(target.href, redirects + 1));
          } catch (error) {
            reject(error);
          }
          return;
        }
        const expected = value === robotsUrl ? 'text/plain' : 'text/html';
        if (status !== 200 || !response.headers['content-type']?.includes(expected)) {
          response.resume();
          reject(new Error('SOURCE_RESPONSE_INVALID'));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) {
            response.destroy(new Error('SOURCE_TOO_LARGE'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            lastModified: response.headers['last-modified'] ?? null,
          }),
        );
        response.on('error', reject);
      },
    );
    request.on('error', reject);
    request.on('close', () => {
      httpAgent.destroy();
      httpsAgent.destroy();
    });
  });
}
