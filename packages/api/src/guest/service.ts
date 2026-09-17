import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  guestReplySchema,
  guestRequestSchema,
  membershipLimits,
  overseasProfileSchema,
  hasResearchAccess,
} from 'librechat-data-provider';
import type {
  GuestCapabilities,
  GuestOutcome,
  GuestRequest,
  GuestState,
  OverseasProfile,
  Membership,
} from 'librechat-data-provider';
import type { GuestResponder } from './provider';
import type { LocalAccounts } from './accounts';
import { validateReply } from './provider';

const storedSchema = z.object({
  day: z.string(),
  used: z.number().int().nonnegative(),
  profile: overseasProfileSchema,
  history: z.array(z.object({ request: guestRequestSchema, reply: guestReplySchema })).max(12),
  reviewedRequests: z.array(z.string().uuid()).max(12).default([]),
  receipts: z
    .array(
      z.object({
        requestId: z.string(),
        hash: z.string(),
        reply: guestReplySchema.optional(),
        remaining: z.number(),
        expiresAt: z.string(),
      }),
    )
    .max(200)
    .default([]),
});
type Stored = z.infer<typeof storedSchema>;
interface Session {
  data: Stored;
  expiresAt: number;
  completed: Map<string, { hash: string; outcome: GuestOutcome }>;
  pending: boolean;
  generation: number;
}
export interface Identity {
  id?: string;
  username?: string;
  valid?: () => boolean;
}
const lifetime = 86_400_000;

export class GuestService {
  private sessions = new Map<string, Session>();
  private attempts = 0;
  constructor(
    private readonly responder?: GuestResponder,
    private readonly now = Date.now,
    readonly accounts?: LocalAccounts,
    // Trusted server configuration only; no public membership mutation endpoint exists.
    private readonly memberFor: (username: string) => Membership = () => 'free',
  ) {}

  capabilities(): GuestCapabilities {
    return {
      chatAvailable: Boolean(this.responder),
      transcriptionAvailable: false,
      accountsAvailable: Boolean(this.accounts),
      deepAvailable: false,
      preview: true,
    };
  }

  initialData(): Stored {
    return {
      day: this.day(),
      used: 0,
      profile: { revision: 0, entries: [] },
      history: [],
      reviewedRequests: [],
      receipts: [],
    };
  }

  private day(): string {
    return new Date(this.now() + 8 * 3600_000).toISOString().slice(0, 10);
  }

  private member(identity: Identity): Membership {
    return identity.username ? this.memberFor(identity.username) : 'guest';
  }

  private session(identity: Identity): { sessionId: string; session: Session } {
    for (const [key, value] of this.sessions) {
      if (value.expiresAt <= this.now() && !value.pending) this.sessions.delete(key);
    }
    const anonymousId =
      identity.id && this.sessions.has(identity.id) ? identity.id : randomBytes(32).toString('hex');
    const sessionId = identity.username ? `account:${identity.username}` : anonymousId;
    let session = this.sessions.get(sessionId);
    if (!session) {
      if (this.sessions.size >= 200) throw new Error('SESSION_LIMIT');
      const saved = identity.username
        ? this.accounts?.store.account(identity.username)?.data
        : undefined;
      session = {
        data: saved ? storedSchema.parse(JSON.parse(saved)) : this.initialData(),
        expiresAt: this.now() + lifetime,
        completed: new Map(),
        pending: false,
        generation: 0,
      };
      for (const receipt of session.data.receipts)
        session.completed.set(receipt.requestId, {
          hash: receipt.hash,
          outcome: receipt.reply
            ? {
                status: 'reply',
                reply: receipt.reply,
                remaining: receipt.remaining,
                expiresAt: receipt.expiresAt,
              }
            : { status: 'conflict' },
        });
      this.sessions.set(sessionId, session);
    }
    if (identity.username && session.data.day !== this.day() && !session.pending) {
      session.data.day = this.day();
      session.data.used = 0;
      session.data.receipts = [];
      session.completed.clear();
    }
    return { sessionId, session };
  }

  private commit(identity: Identity, session: Session, data: Stored): void {
    const visible = new Set(data.history.map((entry) => entry.request.requestId));
    const bounded = {
      ...data,
      receipts: data.receipts.map((receipt) => ({
        ...receipt,
        reply: visible.has(receipt.requestId) ? receipt.reply : undefined,
      })),
    };
    if (identity.username) this.accounts?.store.save(identity.username, JSON.stringify(bounded));
    session.data = bounded;
    for (const receipt of bounded.receipts) {
      if (!receipt.reply)
        session.completed.set(receipt.requestId, {
          hash: receipt.hash,
          outcome: { status: 'conflict' },
        });
    }
  }

  state(identity: Identity = {}): { state: GuestState; sessionId: string } {
    const { session, sessionId } = this.session(identity);
    const membership = this.member(identity);
    const limit = membershipLimits[membership];
    return {
      sessionId,
      state: {
        membership,
        username: identity.username ?? null,
        remaining: Math.max(0, limit - session.data.used),
        limit,
        profile: structuredClone(session.data.profile),
        history: structuredClone(session.data.history),
        reviewedRequests: [...session.data.reviewedRequests],
      },
    };
  }

  clear(id?: string, identity: Identity = { id }, retainProfile = true): void {
    if (!identity.username && (!id || !this.sessions.has(id))) return;
    const { session } = this.session(identity);
    session.generation++;
    // A new conversation must not replenish the trial or remove confirmed profile facts.
    this.commit(identity, session, {
      ...session.data,
      history: [],
      reviewedRequests: [],
      profile: retainProfile
        ? session.data.profile
        : { revision: session.data.profile.revision + 1, entries: [] },
    });
  }

  forgetIdentity(identity: Identity): void {
    const key = identity.username ? `account:${identity.username}` : identity.id;
    if (key) this.sessions.delete(key);
  }

  updateProfile(
    profile: OverseasProfile,
    identity: Identity,
  ): { status: 'ok' | 'conflict'; profile: OverseasProfile } {
    const parsed = overseasProfileSchema.parse(profile);
    const { session } = this.session(identity);
    if (session.pending || parsed.revision !== session.data.profile.revision)
      return { status: 'conflict', profile: structuredClone(session.data.profile) };
    this.commit(identity, session, {
      ...session.data,
      profile: { revision: parsed.revision + 1, entries: parsed.entries },
      reviewedRequests: session.data.history.map((entry) => entry.request.requestId),
    });
    return { status: 'ok', profile: structuredClone(session.data.profile) };
  }

  dismissProposal(requestId: string, identity: Identity): { status: 'ok' | 'conflict' } {
    const { session } = this.session(identity);
    if (
      session.pending ||
      !session.data.history.some((entry) => entry.request.requestId === requestId)
    )
      return { status: 'conflict' };
    this.commit(identity, session, {
      ...session.data,
      reviewedRequests: [...new Set([...session.data.reviewedRequests, requestId])].slice(-12),
    });
    return { status: 'ok' };
  }

  async turn(
    request: GuestRequest,
    id?: string,
    identity: Identity = { id },
  ): Promise<{ outcome: GuestOutcome; sessionId?: string }> {
    if (request.mode === 'deep') return { outcome: { status: 'deep_locked' } };
    if (request.attachments.length && !hasResearchAccess(this.member(identity), 'upload'))
      return { outcome: { status: 'feature_locked' } };
    if (!this.responder) return { outcome: { status: 'unavailable' } };
    const { sessionId, session } = this.session(identity);
    const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const completed = session.completed.get(request.requestId);
    if (completed)
      return {
        outcome: completed.hash === hash ? completed.outcome : { status: 'conflict' },
        sessionId,
      };
    if (session.pending) return { outcome: { status: 'busy' }, sessionId };
    const limit = membershipLimits[this.member(identity)];
    if (session.data.used >= limit)
      return {
        outcome: { status: identity.username ? 'daily_limit' : 'sign_in_required' },
        sessionId,
      };
    if (this.attempts >= 20) return { outcome: { status: 'unavailable' }, sessionId };
    session.pending = true;
    const generation = session.generation;
    const day = this.day();
    this.attempts++;
    try {
      const reply = validateReply(
        await this.responder(request, session.data.history, session.data.profile),
        request,
        session.data.history,
        session.data.profile,
      );
      if (
        this.sessions.get(sessionId) !== session ||
        session.expiresAt <= this.now() ||
        generation !== session.generation ||
        (identity.valid && !identity.valid())
      )
        return { outcome: { status: 'unavailable' } };
      const outcome: GuestOutcome = {
        status: 'reply',
        reply,
        remaining: limit - session.data.used - 1,
        expiresAt: new Date(session.expiresAt).toISOString(),
      };
      const next: Stored = {
        ...session.data,
        day,
        used: session.data.used + 1,
        history: [...session.data.history, { request, reply }].slice(-12),
        reviewedRequests: session.data.reviewedRequests.filter((id) =>
          session.data.history.slice(-11).some((entry) => entry.request.requestId === id),
        ),
        receipts: [
          ...session.data.receipts,
          {
            requestId: request.requestId,
            hash,
            reply,
            remaining: outcome.remaining,
            expiresAt: outcome.expiresAt,
          },
        ],
      };
      this.commit(identity, session, next);
      session.completed.set(request.requestId, { hash, outcome });
      return { outcome, sessionId };
    } catch {
      return { outcome: { status: 'unavailable' }, sessionId };
    } finally {
      session.pending = false;
    }
  }
}
