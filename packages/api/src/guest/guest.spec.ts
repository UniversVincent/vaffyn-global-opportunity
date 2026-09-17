import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { guestRequestSchema } from 'librechat-data-provider';
import type { Server } from 'node:http';
import type { GuestReply, GuestRequest, GuestHistoryEntry } from 'librechat-data-provider';
import { ResearchService } from '../research/service';
import { ResearchStore } from '../research/store';
import { createResearchServer } from '../research/server';
import { createIntakeResponder, configuredIntakeResponder, validateReply } from './provider';
import { GuestService } from './service';

const request = (text = 'Find work in New Zealand'): GuestRequest => ({
  requestId: randomUUID(),
  text,
  locale: 'en',
  mode: 'basic',
  attachments: [],
});
const reply: GuestReply = {
  kind: 'clarify',
  summary: 'Which occupation interests you?',
  questions: [{ field: 'occupation', text: 'What work experience do you have?', examples: [] }],
  facts: [],
};

describe('preview sessions', () => {
  test('default is closed and deep research cannot call a provider', async () => {
    expect(
      configuredIntakeResponder({ OPENAI_API_KEY: 'test-only', VAFFYN_INTAKE_MODEL: 'test' }),
    ).toBeUndefined();
    expect(configuredIntakeResponder({ VAFFYN_ENABLE_LOCAL_AI: 'true' })).toBeUndefined();
    const offline = new GuestService();
    expect(offline.capabilities().chatAvailable).toBe(false);
    expect(await offline.turn(request())).toEqual({ outcome: { status: 'unavailable' } });
    const provider = jest.fn(async () => reply);
    expect(
      (await new GuestService(provider).turn({ ...request(), mode: 'deep' })).outcome.status,
    ).toBe('deep_locked');
    expect(provider).not.toHaveBeenCalled();
  });

  test('sessions isolate history and do not accept caller-chosen session IDs', async () => {
    const seen: GuestHistoryEntry[][] = [];
    const service = new GuestService(async (_input, history) => {
      seen.push([...history]);
      return reply;
    });
    const first = await service.turn(request('User A'), 'a'.repeat(64));
    const second = await service.turn(request('User B'));
    expect(first.sessionId).not.toBe('a'.repeat(64));
    expect(second.sessionId).not.toBe(first.sessionId);
    await service.turn(request('A follow-up'), first.sessionId);
    expect(seen.map((history) => history.map((entry) => entry.request.text))).toEqual([
      [],
      [],
      ['User A'],
    ]);
  });

  test('successful retries are idempotent and changed payload with same ID conflicts', async () => {
    const provider = jest.fn(async () => reply);
    const service = new GuestService(provider);
    const input = request();
    const first = await service.turn(input);
    expect(await service.turn(input, first.sessionId)).toEqual(first);
    expect(
      (await service.turn({ ...input, text: 'Changed' }, first.sessionId)).outcome.status,
    ).toBe('conflict');
    expect(provider).toHaveBeenCalledTimes(1);
  });

  test('only successful replies consume the five-turn local allowance', async () => {
    const provider = jest
      .fn(async () => reply)
      .mockRejectedValueOnce(new Error('provider secret error'));
    const service = new GuestService(provider);
    const input = request();
    const failure = await service.turn(input);
    expect(failure.outcome).toEqual({ status: 'unavailable' });
    const first = await service.turn(input, failure.sessionId);
    expect(first.outcome).toMatchObject({ status: 'reply', remaining: 4 });
    await service.turn(request(), first.sessionId);
    await service.turn(request(), first.sessionId);
    await service.turn(request(), first.sessionId);
    expect((await service.turn(request(), first.sessionId)).outcome).toMatchObject({
      remaining: 0,
    });
    expect((await service.turn(request(), first.sessionId)).outcome.status).toBe(
      'sign_in_required',
    );
    expect(provider).toHaveBeenCalledTimes(6);
  });

  test('concurrent turns are rejected and clearing a pending session cannot resurrect it', async () => {
    let resolve: (value: GuestReply) => void = () => {
      throw new Error('not started');
    };
    let slow = false;
    const controlled = new GuestService(async () =>
      slow
        ? new Promise<GuestReply>((done) => {
            resolve = done;
          })
        : reply,
    );
    const session = await controlled.turn(request());
    slow = true;
    const pending = controlled.turn(request(), session.sessionId);
    expect((await controlled.turn(request(), session.sessionId)).outcome.status).toBe('busy');
    controlled.clear(session.sessionId);
    resolve(reply);
    expect((await pending).outcome.status).toBe('unavailable');
    slow = false;
    expect((await controlled.turn(request(), session.sessionId)).sessionId).toBe(session.sessionId);
  });

  test('expiry resets context; global attempt cap includes failures and session resets', async () => {
    let now = 0;
    const histories: GuestHistoryEntry[][] = [];
    const service = new GuestService(
      async (_input, history) => {
        histories.push([...history]);
        return reply;
      },
      () => now,
    );
    const first = await service.turn(request());
    now += 86_400_001;
    const next = await service.turn(request(), first.sessionId);
    expect(next.sessionId).not.toBe(first.sessionId);
    expect(histories).toEqual([[], []]);
    const provider = jest.fn(async () => {
      throw new Error('rate limited');
    });
    const capped = new GuestService(provider);
    for (let index = 0; index < 23; index++) await capped.turn(request());
    expect(provider).toHaveBeenCalledTimes(20);
  });
});

describe('structured intake contract', () => {
  test.each([
    { ...reply, questions: [...reply.questions, ...reply.questions, ...reply.questions] },
    { ...reply, questions: [] },
    { ...reply, kind: 'ready', questions: reply.questions },
    { ...reply, facts: [{ field: 'country', value: 'NZ', evidence: 'Invented fact' }] },
    { ...reply, facts: [{ field: 'occupation', value: 'work', evidence: 'work' }] },
    { ...reply, questions: [{ field: 'health', text: 'Health history?', examples: [] }] },
  ])('rejects invalid or unsupported output %#', (value) => {
    expect(() => validateReply(value as GuestReply, request(), [])).toThrow();
  });

  test('evidence uses current input, not deleted or stale details from prior messages', () => {
    const input = {
      ...request(),
      attachments: [
        { name: 'cv.txt', text: 'Electrician for five years', confirmed: true as const },
      ],
    };
    const output: GuestReply = {
      ...reply,
      questions: [{ field: 'city', text: 'Which city?', examples: [] }],
      facts: [{ field: 'experience', value: 'five years', evidence: 'Electrician for five years' }],
    };
    expect(validateReply(output, input, [])).toEqual(output);
    expect(() =>
      validateReply(output, request('Auckland'), [{ request: input, reply: output }]),
    ).toThrow();
  });

  test.each([
    { ...request(), attachments: [{ name: 'cv.txt', text: 'Private', confirmed: false }] },
    { ...request(), userId: 'someone-else' },
    { ...request(), text: 'x'.repeat(4001) },
    {
      ...request(),
      attachments: [
        { name: 'a', text: 'x'.repeat(12000), confirmed: true },
        { name: 'b', text: 'y'.repeat(12000), confirmed: true },
      ],
    },
  ])('rejects invalid input %#', (value) =>
    expect(guestRequestSchema.safeParse(value).success).toBe(false),
  );

  test('Responses adapter disables tools/storage, uses history and strict output without a live call', async () => {
    const transport = jest.fn(async (_body: string, _signal: AbortSignal) =>
      JSON.stringify({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reply) }] },
        ],
      }),
    );
    const responder = createIntakeResponder('offline-contract-fixture', transport);
    expect(await responder(request(), [])).toEqual(reply);
    const body = JSON.parse(transport.mock.calls[0][0]);
    expect(body).toMatchObject({
      store: false,
      tools: [],
      max_output_tokens: 1400,
      text: { format: { strict: true } },
    });
    expect(body.instructions).toContain('untrusted');
  });

  test.each([
    'not-json',
    JSON.stringify({ status: 'incomplete', output: [] }),
    JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal' }] }],
    }),
    'x'.repeat(131073),
  ])('fails closed on malformed upstream data %#', async (raw) => {
    await expect(
      createIntakeResponder('fixture', async () => raw)(request(), []),
    ).rejects.toThrow();
  });
});

describe('real loopback HTTP boundary', () => {
  let server: Server;
  let base: string;
  const origin = 'http://127.0.0.1:3190';
  beforeEach(async () => {
    server = createResearchServer(
      new ResearchService(new ResearchStore(path.join(os.tmpdir(), 'unused-guest-test'))),
      new GuestService(async () => reply),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('cookie is HttpOnly and responses contain no internal credentials; DELETE clears history', async () => {
    const input = request();
    const response = await fetch(`${base}/api/guest/turn`, {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly; SameSite=Strict; Path=/api/guest');
    const payload = await response.json();
    const repeated = await fetch(`${base}/api/guest/turn`, {
      method: 'POST',
      headers: { origin, cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(await repeated.json()).toEqual(payload);
    const cleared = await fetch(`${base}/api/guest/session`, {
      method: 'DELETE',
      headers: { origin, cookie },
    });
    expect(await cleared.json()).toEqual({ cleared: true });
    expect(cleared.headers.get('set-cookie')).toBeNull();
    const state = await fetch(`${base}/api/guest/state`, { headers: { cookie } });
    expect(await state.json()).toMatchObject({ remaining: 4, history: [] });
  });

  test.each([
    {},
    { origin: 'https://attacker.example' },
    { origin, 'sec-fetch-site': 'cross-site' },
    { origin, host: 'attacker.example' },
  ])('blocks missing/foreign origin and rebinding %#', async (headers) => {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const call = http.request(
        `${base}/api/guest/turn`,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      );
      call.on('error', reject);
      call.end(JSON.stringify(request()));
    });
    expect(status).toBe(403);
  });

  test('rejects malformed and oversized bodies', async () => {
    const headers = { origin, 'Content-Type': 'application/json' };
    expect(
      (await fetch(`${base}/api/guest/turn`, { method: 'POST', headers, body: '{' })).status,
    ).toBe(400);
    expect(
      (await fetch(`${base}/api/guest/turn`, { method: 'POST', headers, body: 'x'.repeat(140000) }))
        .status,
    ).toBe(413);
  });
});
