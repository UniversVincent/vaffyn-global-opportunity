import {
  guestRequestSchema,
  localAccountSchema,
  overseasProfileSchema,
} from 'librechat-data-provider';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GuestService, Identity } from './service';
import { z } from 'zod';

export const accountToken = (request: IncomingMessage): string | undefined =>
  request.headers.cookie?.match(/(?:^|;\s*)vaffyn_local=([a-f0-9]{64})(?:;|$)/u)?.[1];
export function guestIdentity(request: IncomingMessage, service: GuestService): Identity {
  const token = accountToken(request);
  const username = service.accounts?.user(token);
  const id = request.headers.cookie?.match(/(?:^|;\s*)vaffyn_guest=([a-f0-9]{64})(?:;|$)/u)?.[1];
  return {
    id,
    username,
    valid: username ? () => service.accounts?.user(token) === username : undefined,
  };
}

export async function handleGuestRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: GuestService,
): Promise<boolean> {
  const route = request.url ?? '';
  if (!route.startsWith('/api/guest/')) return false;
  const send = (status: number, body: string) => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(body);
  };
  const cookie = (id?: string) => {
    if (id && /^[a-f0-9]{64}$/u.test(id))
      response.setHeader(
        'Set-Cookie',
        `vaffyn_guest=${id}; HttpOnly; SameSite=Strict; Path=/api/guest; Max-Age=86400`,
      );
  };
  const identity = guestIdentity(request, service);
  if (request.method === 'GET' && route === '/api/guest/capabilities') {
    send(200, JSON.stringify(service.capabilities()));
    return true;
  }
  if (request.method === 'GET' && route === '/api/guest/state') {
    const result = service.state(identity);
    cookie(result.sessionId);
    send(200, JSON.stringify(result.state));
    return true;
  }
  if (!request.headers.origin) {
    send(403, '{"error":"LOCAL_ORIGIN_REQUIRED"}');
    return true;
  }
  if (request.method === 'DELETE' && route === '/api/guest/session') {
    service.clear(identity.id, identity);
    send(200, '{"cleared":true}');
    return true;
  }
  if (
    !['POST', 'PUT'].includes(request.method ?? '') ||
    request.headers['content-type'] !== 'application/json'
  ) {
    send(404, '{"error":"NOT_FOUND"}');
    return true;
  }
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 128 * 1024) {
      send(413, '{"status":"invalid_request"}');
      return true;
    }
    chunks.push(buffer);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (request.method === 'POST' && route === '/api/guest/account/logout') {
      service.accounts?.logout(accountToken(request));
      service.forgetIdentity(identity);
      service.clear(identity.id, { id: identity.id }, false);
      response.setHeader(
        'Set-Cookie',
        'vaffyn_local=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0',
      );
      send(200, '{"status":"ok"}');
      return true;
    }
    if (
      request.method === 'POST' &&
      ['/api/guest/account/login', '/api/guest/account/register'].includes(route)
    ) {
      if (!service.accounts) {
        send(200, '{"status":"unavailable"}');
        return true;
      }
      const parsed = localAccountSchema.safeParse(body);
      if (!parsed.success) {
        send(200, '{"status":"invalid_credentials"}');
        return true;
      }
      const result = await service.accounts.authenticate(
        route.endsWith('/register') ? 'register' : 'login',
        parsed.data,
        JSON.stringify(service.initialData()),
      );
      if (result.status !== 'ok') {
        send(200, JSON.stringify(result));
        return true;
      }
      // Do not silently merge the guest's transcript or profile into the account.
      if (identity.username) service.forgetIdentity(identity);
      else service.clear(identity.id);
      service.accounts.logout(accountToken(request));
      response.setHeader(
        'Set-Cookie',
        `vaffyn_local=${result.token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=86400`,
      );
      send(
        200,
        JSON.stringify({ status: 'ok', state: service.state({ username: result.username }).state }),
      );
      return true;
    }
    if (request.method === 'PUT' && route === '/api/guest/profile') {
      const parsed = overseasProfileSchema.safeParse(body);
      if (!parsed.success) {
        send(400, '{"status":"invalid_request"}');
        return true;
      }
      const current = service.state(identity);
      cookie(current.sessionId);
      send(
        200,
        JSON.stringify(service.updateProfile(parsed.data, { ...identity, id: current.sessionId })),
      );
      return true;
    }
    if (request.method === 'POST' && route === '/api/guest/proposals/dismiss') {
      const parsed = z.object({ requestId: z.string().uuid() }).strict().safeParse(body);
      if (!parsed.success) {
        send(400, '{"status":"invalid_request"}');
        return true;
      }
      send(200, JSON.stringify(service.dismissProposal(parsed.data.requestId, identity)));
      return true;
    }
    if (request.method !== 'POST' || route !== '/api/guest/turn') {
      send(404, '{"error":"NOT_FOUND"}');
      return true;
    }
    const parsed = guestRequestSchema.safeParse(body);
    if (!parsed.success) {
      send(400, '{"status":"invalid_request"}');
      return true;
    }
    const result = await service.turn(parsed.data, identity.id, identity);
    cookie(result.sessionId);
    send(200, JSON.stringify(result.outcome));
  } catch {
    send(400, '{"status":"invalid_request"}');
  }
  return true;
}
