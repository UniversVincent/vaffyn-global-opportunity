import path from 'node:path';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sources, policyReview, robotsUrl, licenseUrl } from './registry';
import { ResearchService } from './service';
import { ResearchStore } from './store';
import { createArchive } from './export';
import { extractPage, digest } from './parser';
import { fetchSource } from './fetch';
import { configuredIntakeResponder } from '../guest/provider';
import { handleGuestRequest, guestIdentity } from '../guest/routes';
import { GuestService } from '../guest/service';
import { LocalAccounts } from '../guest/accounts';
import { PreviewStore } from '../../../data-schemas/preview-dist/store.cjs';
import { hasResearchAccess } from 'librechat-data-provider';

const prefix = '/api/research/sample';
const origins = new Set([
  'http://127.0.0.1:3190',
  'http://127.0.0.1:3192',
  ...(process.env.VAFFYN_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

export function createResearchServer(
  service: ResearchService,
  guest = new GuestService(),
  researchAllowed = (request: IncomingMessage) => {
    const identity = guestIdentity(request, guest);
    return (
      Boolean(identity.username) &&
      hasResearchAccess(guest.state(identity).state.membership, 'export')
    );
  },
): http.Server {
  const send = (response: ServerResponse, status: number, body: string): void => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    response.end(body);
  };
  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const expectedHost = `127.0.0.1:${(request.socket.address() as { port: number }).port}`;
    if (
      request.headers.host !== expectedHost ||
      request.headers['sec-fetch-site'] === 'cross-site' ||
      (request.headers.origin && !origins.has(request.headers.origin))
    ) {
      send(response, 403, '{"error":"LOCAL_ORIGIN_REQUIRED"}');
      return;
    }
    if (await handleGuestRequest(request, response, guest)) {
      return;
    }
    const url = request.url ?? '';
    if (url.startsWith('/api/research/') && !researchAllowed(request)) {
      send(response, 403, '{"error":"MEMBERSHIP_REQUIRED"}');
      return;
    }
    if (request.method === 'GET' && url === prefix) {
      send(response, 200, JSON.stringify(await service.current()));
      return;
    }
    if (request.method === 'POST' && url === `${prefix}/refresh`) {
      if (!request.headers.origin || request.headers['content-type'] !== 'application/json') {
        send(response, 403, '{"error":"LOCAL_ORIGIN_REQUIRED"}');
        return;
      }
      let body = '';
      for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 32) {
          send(response, 413, '{"error":"BODY_NOT_ALLOWED"}');
          return;
        }
      }
      if (body !== '{}') {
        send(response, 400, '{"error":"TOPIC_ONLY_NO_PERSONAL_INPUT"}');
        return;
      }
      send(response, 200, JSON.stringify(await service.refresh()));
      return;
    }
    const archive = url.match(/^\/api\/research\/sample\/archive\/([a-f0-9]{64})$/u);
    if (request.method === 'GET' && archive) {
      const report = await service.store.report(archive[1]);
      const current = await service.current();
      const allowed = new Set(
        current.report.sources
          .filter((source) => source.rights === 'attribution_excerpt')
          .map((source) => source.id),
      );
      if (
        report.sources.some(
          (source) => source.rights === 'attribution_excerpt' && !allowed.has(source.id),
        )
      ) {
        send(response, 409, '{"error":"ARCHIVE_NEEDS_RECHECK"}');
        return;
      }
      send(response, 200, JSON.stringify(createArchive(report)));
      return;
    }
    send(response, 404, '{"error":"NOT_FOUND"}');
  };
  const server = http.createServer((request, response) => {
    void handler(request, response).catch((error: Error) => {
      const cooldown = error.message === 'REFRESH_COOLDOWN';
      send(
        response,
        cooldown ? 429 : 503,
        JSON.stringify({ error: cooldown ? 'REFRESH_COOLDOWN' : 'RESEARCH_UNAVAILABLE' }),
      );
    });
  });
  server.requestTimeout = 150_000;
  server.headersTimeout = 10_000;
  server.maxRequestsPerSocket = 100;
  return server;
}

async function inspect(): Promise<void> {
  const robots = await fetchSource(robotsUrl);
  const hash = digest(
    JSON.stringify({ sections: [{ heading: 'robots.txt', text: robots.body }], links: [] }),
  );
  console.log(JSON.stringify({ id: 'robots', hash, text: robots.body }, null, 2));
  if (hash !== policyReview.robotsHash) {
    return;
  }
  const license = extractPage((await fetchSource(licenseUrl)).body, licenseUrl);
  console.log(JSON.stringify({ id: 'license', ...license }, null, 2));
  if (license.hash !== policyReview.licenseHash) {
    return;
  }
  for (const source of sources) {
    const page = extractPage((await fetchSource(source.url)).body, source.url);
    console.log(JSON.stringify({ id: source.id, ...page }, null, 2));
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--inspect')) {
    await inspect();
    return;
  }
  const directory = process.env.RESEARCH_DATA_DIR;
  if (!directory || !path.isAbsolute(directory)) {
    throw new Error('Set RESEARCH_DATA_DIR to a separate absolute public-evidence directory');
  }
  const store = new ResearchStore(directory);
  await store.initialize();
  const service = new ResearchService(store);
  if (process.argv.includes('--refresh')) {
    const { report } = await service.refresh();
    console.log(
      JSON.stringify(
        {
          id: report.id,
          sources: report.sources.map(({ id, hash, status }) => ({ id, hash, status })),
          claims: report.claims.map(({ id, status }) => ({ id, status })),
        },
        null,
        2,
      ),
    );
    return;
  }
  const accountsDirectory = process.env.VAFFYN_LOCAL_ACCOUNTS_DIR;
  if (
    accountsDirectory &&
    (!path.isAbsolute(accountsDirectory) ||
      path.resolve(accountsDirectory).startsWith(path.resolve(directory) + path.sep) ||
      path.resolve(accountsDirectory) === path.resolve(directory))
  ) {
    throw new Error('Local accounts require a separate absolute private directory');
  }
  const server = createResearchServer(
    service,
    new GuestService(
      configuredIntakeResponder(process.env),
      Date.now,
      accountsDirectory
        ? new LocalAccounts(new PreviewStore(path.join(accountsDirectory, 'preview.sqlite')))
        : undefined,
    ),
  );
  server.listen(3191, '127.0.0.1', () =>
    console.log('Local preview API: http://127.0.0.1:3191/api/guest/capabilities'),
  );
}

if (require.main === module) {
  void main().catch(() => {
    console.error(
      'Research sample failed. Check local configuration and reviewed source definitions; no credentials are required.',
    );
    process.exitCode = 1;
  });
}
