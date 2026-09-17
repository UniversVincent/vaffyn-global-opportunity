import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { membershipLimits, hasResearchAccess } from 'librechat-data-provider';
import type { GuestReply, GuestRequest, OverseasProfile } from 'librechat-data-provider';
import { PreviewStore } from '../../../data-schemas/preview-dist/store.cjs';
import { LocalAccounts } from './accounts';
import { GuestService } from './service';
import { validateReply, createIntakeResponder } from './provider';
import { createResearchServer } from '../research/server';
import { ResearchService } from '../research/service';
import { ResearchStore } from '../research/store';

const input = (text = 'I have a degree in IT'): GuestRequest => ({
  requestId: randomUUID(),
  text,
  mode: 'basic',
  locale: 'en',
  attachments: [],
});
const reply: GuestReply = {
  kind: 'clarify',
  summary: 'What work have you actually done?',
  questions: [{ field: 'occupation', text: 'What is your current job?', examples: [] }],
  facts: [{ field: 'education', value: 'IT degree', evidence: 'degree in IT' }],
};
const simple: GuestReply = {
  kind: 'ready',
  summary: 'Research brief only.',
  questions: [],
  facts: [],
};
const password = 'Synthetic test passphrase 123!';

test('tier matrix: only advanced can upload/export/deep research or add credits', () => {
  expect(membershipLimits).toEqual({ guest: 5, free: 10, standard: 100, advanced: 200 });
  for (const tier of ['guest', 'free', 'standard', 'advanced'] as const)
    for (const feature of ['deep', 'upload', 'export', 'extended'] as const)
      expect(hasResearchAccess(tier, feature)).toBe(tier === 'advanced');
});

test('ordinary answers need no profile questionnaire', () => {
  const answer: GuestReply = {
    kind: 'answer',
    summary: 'Let us practice a short introduction.',
    questions: [],
    facts: [],
  };
  expect(validateReply(answer, input('Help me practice English'), [])).toEqual(answer);
});

test('new chat preserves quota and confirmed profile; AI facts are proposals until explicit confirmation', async () => {
  const seen: OverseasProfile[] = [];
  const service = new GuestService(async (_request, _history, profile) => {
    seen.push(structuredClone(profile!));
    return reply;
  });
  const first = await service.turn(input());
  expect(service.state({ id: first.sessionId }).state.profile.entries).toEqual([]);
  service.updateProfile(
    { revision: 0, entries: [{ field: 'education', value: 'IT degree', status: 'confirmed' }] },
    { id: first.sessionId },
  );
  service.clear(first.sessionId);
  expect(service.state({ id: first.sessionId }).state).toMatchObject({
    remaining: 4,
    history: [],
    profile: { revision: 1 },
  });
  await service.turn(input(), first.sessionId);
  expect(seen[1].entries).toEqual([
    { field: 'education', value: 'IT degree', status: 'confirmed' },
  ]);
  expect(seen[1].entries.some((entry) => entry.field === 'occupation')).toBe(false);
  expect(service.updateProfile({ revision: 0, entries: [] }, { id: first.sessionId }).status).toBe(
    'conflict',
  );
  expect(service.updateProfile({ revision: 1, entries: [] }, { id: first.sessionId }).status).toBe(
    'ok',
  );
});

test('new chat also removes old response bodies from retry receipts without replenishing usage', async () => {
  const service = new GuestService(async () => simple);
  const request = input();
  const first = await service.turn(request);
  service.clear(first.sessionId);
  expect((await service.turn(request, first.sessionId)).outcome.status).toBe('conflict');
  expect(service.state({ id: first.sessionId }).state.remaining).toBe(4);
});

test('one to three relevant questions allowed; confirmed or declined fields cannot be asked again', () => {
  const three: GuestReply = {
    ...reply,
    facts: [],
    questions: ['occupation', 'experience', 'education'].map((field) => ({
      field: field as 'occupation',
      text: field,
      examples: [],
    })),
  };
  expect(validateReply(three, input(), [])).toEqual(three);
  expect(() =>
    validateReply(
      {
        ...three,
        questions: [...three.questions, { field: 'budget', text: 'Budget?', examples: [] }],
      },
      input(),
      [],
    ),
  ).toThrow();
  for (const status of ['confirmed', 'declined'] as const) {
    expect(() =>
      validateReply(reply, input(), [], {
        revision: 1,
        entries: [{ field: 'occupation', value: 'Analyst', status }],
      }),
    ).toThrow();
  }
  expect(
    validateReply(reply, input(), [
      {
        request: input(),
        reply: { ...reply, facts: [{ field: 'occupation', value: 'IT worker', evidence: 'IT' }] },
      },
    ]),
  ).toEqual(reply);
});

test('model request separates confirmed profile from transcript, keeps licensed-service boundary and disables tools', async () => {
  let body = '';
  const responder = createIntakeResponder('synthetic-model', async (value) => {
    body = value;
    return JSON.stringify({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(simple) }] },
      ],
    });
  });
  const profile: OverseasProfile = {
    revision: 2,
    entries: [{ field: 'education', value: 'IT', status: 'confirmed' }],
  };
  await responder(input(), [], profile);
  const sent = JSON.parse(body);
  expect(JSON.parse(sent.input[0].content).confirmedProfile).toEqual(profile);
  expect(sent.instructions).toContain('Membership never changes this boundary');
  expect(sent.instructions).toContain('An IT degree is not IT work experience');
  expect(sent.tools).toEqual([]);
});

test('guest/free/standard attachment requests are denied before calling any provider', async () => {
  for (const tier of ['guest', 'free', 'standard'] as const) {
    const responder = jest.fn(async () => simple);
    const service = new GuestService(responder, Date.now, undefined, () => tier);
    const result = await service.turn(
      {
        ...input(),
        attachments: [{ name: 'cv.txt', text: 'private synthetic text', confirmed: true }],
      },
      undefined,
      tier === 'guest' ? {} : { username: 'synthetic' },
    );
    expect(result.outcome.status).toBe('feature_locked');
    expect(responder).not.toHaveBeenCalled();
  }
});

describe('isolated local accounts', () => {
  let directory: string;
  let store: PreviewStore;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vaffyn-accounts-test-'));
    store = new PreviewStore(path.join(directory, 'test.sqlite'));
  });
  afterEach(async () => {
    store.close();
    const target = path.resolve(directory);
    if (
      path.dirname(target) !== path.resolve(os.tmpdir()) ||
      !path.basename(target).startsWith('vaffyn-accounts-test-')
    )
      throw new Error('UNSAFE_TEST_PATH');
    await fs.rm(target, { recursive: true });
  });

  test('failed persistence does not claim a profile save or consume a reply allowance', async () => {
    const accounts = new LocalAccounts(store);
    const service = new GuestService(async () => simple, Date.now, accounts);
    await accounts.authenticate(
      'register',
      { username: 'alice', password },
      JSON.stringify(service.initialData()),
    );
    const old = service.state({ username: 'alice' }).state;
    const failing = jest.spyOn(store, 'save').mockImplementation(() => {
      throw new Error('synthetic disk full');
    });
    expect(() =>
      service.updateProfile(
        { revision: 0, entries: [{ field: 'education', value: 'IT', status: 'confirmed' }] },
        { username: 'alice' },
      ),
    ).toThrow();
    expect(service.state({ username: 'alice' }).state.profile).toEqual(old.profile);
    expect((await service.turn(input(), undefined, { username: 'alice' })).outcome.status).toBe(
      'unavailable',
    );
    expect(service.state({ username: 'alice' }).state.remaining).toBe(10);
    failing.mockRestore();
  });

  test('processed proposals remain processed after profile deletion and service restart', async () => {
    const accounts = new LocalAccounts(store);
    const service = new GuestService(async () => reply, Date.now, accounts);
    await accounts.authenticate(
      'register',
      { username: 'alice', password },
      JSON.stringify(service.initialData()),
    );
    const request = input();
    await service.turn(request, undefined, { username: 'alice' });
    expect(service.dismissProposal(request.requestId, { username: 'alice' }).status).toBe('ok');
    service.updateProfile({ revision: 0, entries: [] }, { username: 'alice' });
    const restarted = new GuestService(async () => reply, Date.now, accounts);
    expect(restarted.state({ username: 'alice' }).state).toMatchObject({
      profile: { entries: [] },
      reviewedRequests: [request.requestId],
    });
    expect(restarted.dismissProposal(randomUUID(), { username: 'alice' }).status).toBe('conflict');
  });

  test('passwords salted/hashed, sessions rotated, logout revokes and account data survives restart', async () => {
    const accounts = new LocalAccounts(store);
    const service = new GuestService(async () => simple, Date.now, accounts);
    const registered = await accounts.authenticate(
      'register',
      { username: 'alice', password },
      JSON.stringify(service.initialData()),
    );
    expect(registered.status).toBe('ok');
    if (registered.status !== 'ok') throw new Error('registration failed');
    expect(accounts.user(registered.token)).toBe('alice');
    expect(store.account('alice')?.hash).not.toContain(password);
    service.updateProfile(
      {
        revision: 0,
        entries: [{ field: 'occupation', value: 'Finance analyst', status: 'confirmed' }],
      },
      { username: 'alice' },
    );
    const request = input();
    const first = await service.turn(request, undefined, { username: 'alice' });
    const restarted = new GuestService(
      async () => {
        throw new Error('idempotent request must not call');
      },
      Date.now,
      accounts,
    );
    expect(restarted.state({ username: 'alice' }).state).toMatchObject({
      remaining: 9,
      profile: { entries: [{ field: 'occupation', value: 'Finance analyst' }] },
    });
    expect((await restarted.turn(request, undefined, { username: 'alice' })).outcome).toEqual(
      first.outcome,
    );
    const again = await accounts.authenticate('login', { username: 'alice', password }, '');
    expect(again.status).toBe('ok');
    if (again.status !== 'ok') throw new Error('login failed');
    expect(accounts.user(registered.token)).toBeUndefined();
    accounts.logout(again.token);
    expect(accounts.user(again.token)).toBeUndefined();
    expect(
      (
        await accounts.authenticate(
          'login',
          { username: 'alice', password: 'Incorrect long password' },
          '',
        )
      ).status,
    ).toBe('invalid_credentials');
  });

  test('free allowance is account-wide, fails closed after ten, resets by Shanghai date', async () => {
    let now = Date.UTC(2026, 8, 13, 10);
    const accounts = new LocalAccounts(store, () => now);
    const service = new GuestService(
      async () => simple,
      () => now,
      accounts,
    );
    await accounts.authenticate(
      'register',
      { username: 'alice', password },
      JSON.stringify(service.initialData()),
    );
    for (let index = 0; index < 10; index++) {
      const outcome = (await service.turn(input(), undefined, { username: 'alice' })).outcome;
      expect(outcome).toMatchObject({ status: 'reply', remaining: 9 - index });
      service.clear(undefined, { username: 'alice' });
    }
    expect((await service.turn(input(), undefined, { username: 'alice' })).outcome.status).toBe(
      'daily_limit',
    );
    now = Date.UTC(2026, 8, 13, 16);
    expect(service.state({ username: 'alice' }).state.remaining).toBe(10);
  });

  test('real HTTP registration, isolation, no implicit guest merge, CSRF and direct premium bypass checks', async () => {
    const accounts = new LocalAccounts(store);
    const service = new GuestService(async () => simple, Date.now, accounts);
    const server = createResearchServer(
      new ResearchService(new ResearchStore(path.join(directory, 'unused'))),
      service,
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const call = (url: string, body?: object, cookie = '', method = body ? 'POST' : 'GET') =>
      fetch(base + url, {
        method,
        headers: { origin: 'http://127.0.0.1:3190', 'Content-Type': 'application/json', cookie },
        body: body ? JSON.stringify(body) : undefined,
      });
    try {
      const guest = await call('/api/guest/state');
      const guestCookie = guest.headers.get('set-cookie')!;
      await call(
        '/api/guest/profile',
        {
          revision: 0,
          entries: [{ field: 'education', value: 'Guest only', status: 'confirmed' }],
        },
        guestCookie,
        'PUT',
      );
      const registered = await call(
        '/api/guest/account/register',
        { username: 'alice', password },
        guestCookie,
      );
      const aliceCookie = registered.headers.get('set-cookie')!;
      expect(aliceCookie).toContain('HttpOnly; SameSite=Strict; Path=/api');
      expect(await registered.json()).toMatchObject({
        status: 'ok',
        state: { membership: 'free', remaining: 10, profile: { entries: [] } },
      });
      await call(
        '/api/guest/profile',
        {
          revision: 0,
          entries: [{ field: 'occupation', value: 'Alice only', status: 'confirmed' }],
        },
        aliceCookie,
        'PUT',
      );
      const bob = await call('/api/guest/account/register', { username: 'bob', password });
      const bobCookie = bob.headers.get('set-cookie')!;
      expect(await (await call('/api/guest/state', undefined, bobCookie)).json()).toMatchObject({
        username: 'bob',
        profile: { entries: [] },
      });
      expect(
        (
          await call(
            '/api/guest/profile',
            { revision: 0, userId: 'alice', entries: [] },
            bobCookie,
            'PUT',
          )
        ).status,
      ).toBe(400);
      for (const cookie of ['', aliceCookie, bobCookie]) {
        expect((await call('/api/research/sample', undefined, cookie)).status).toBe(403);
        expect(
          (await call('/api/research/sample/archive/' + 'a'.repeat(64), undefined, cookie)).status,
        ).toBe(403);
        expect((await call('/api/research/sample/refresh', {}, cookie)).status).toBe(403);
        expect(
          await (
            await call(
              '/api/guest/turn',
              {
                ...input(),
                attachments: [{ name: 'private.txt', text: 'synthetic', confirmed: true }],
              },
              cookie,
            )
          ).json(),
        ).toMatchObject({ status: 'feature_locked' });
      }
      expect(
        (
          await call('/api/guest/account/register', {
            username: 'injected',
            password,
            membership: 'advanced',
          })
        ).status,
      ).toBe(200);
      expect(store.account('injected')).toBeUndefined();
      const csrf = await fetch(`${base}/api/guest/account/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'csrf', password }),
      });
      expect(csrf.status).toBe(403);
      await call('/api/guest/account/logout', {}, aliceCookie);
      expect(await (await call('/api/guest/state', undefined, aliceCookie)).json()).toMatchObject({
        username: null,
        profile: { entries: [] },
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
