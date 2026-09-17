import { z } from 'zod';

export const guestFieldSchema = z.enum([
  'country',
  'city',
  'occupation',
  'experience',
  'language',
  'timeframe',
  'commute',
  'budget',
  'visa_category',
  'objective',
  'duties',
  'education',
  'age_range',
  'location',
  'family',
  'work_rights',
  'flexibility',
]);

export const guestAttachmentSchema = z
  .object({
    name: z.string().min(1).max(120),
    text: z.string().min(1).max(12000),
    confirmed: z.literal(true),
  })
  .strict();

export const guestRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    text: z.string().trim().min(1).max(4000),
    locale: z.enum(['zh-Hans', 'zh-Hant', 'en']),
    mode: z.enum(['basic', 'deep']),
    attachments: z.array(guestAttachmentSchema).max(3),
  })
  .strict()
  .refine(
    (value) =>
      value.text.length + value.attachments.reduce((total, file) => total + file.text.length, 0) <=
      20000,
  );

export const guestReplySchema = z
  .object({
    kind: z.enum(['answer', 'clarify', 'ready', 'professional_boundary']),
    summary: z.string().max(1800),
    questions: z
      .array(
        z
          .object({
            field: guestFieldSchema,
            text: z.string().min(1).max(240),
            examples: z.array(z.string().min(1).max(80)).max(3),
          })
          .strict(),
      )
      .max(3),
    facts: z
      .array(
        z
          .object({
            field: guestFieldSchema,
            value: z.string().min(1).max(240),
            evidence: z.string().min(1).max(400),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

export type GuestRequest = z.infer<typeof guestRequestSchema>;
export type GuestReply = z.infer<typeof guestReplySchema>;
export type GuestAttachment = z.infer<typeof guestAttachmentSchema>;

export interface GuestCapabilities {
  chatAvailable: boolean;
  transcriptionAvailable: false;
  accountsAvailable: boolean;
  deepAvailable: false;
  preview: true;
}

export type GuestOutcome =
  | { status: 'reply'; reply: GuestReply; remaining: number; expiresAt: string }
  | {
      status:
        | 'unavailable'
        | 'sign_in_required'
        | 'deep_locked'
        | 'daily_limit'
        | 'feature_locked'
        | 'busy'
        | 'invalid_request'
        | 'conflict';
    };

export interface GuestHistoryEntry {
  request: GuestRequest;
  reply: GuestReply;
}

export const membershipSchema = z.enum(['guest', 'free', 'standard', 'advanced']);
export type Membership = z.infer<typeof membershipSchema>;
export const profileEntrySchema = z
  .object({
    field: guestFieldSchema,
    value: z.string().trim().max(240),
    status: z.enum(['confirmed', 'declined']),
  })
  .strict();
export const overseasProfileSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    entries: z.array(profileEntrySchema).max(24),
  })
  .strict()
  .refine(
    (value) => new Set(value.entries.map((entry) => entry.field)).size === value.entries.length,
  );
export type OverseasProfile = z.infer<typeof overseasProfileSchema>;
export const localAccountSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,32}$/),
    password: z.string().min(15).max(128),
  })
  .strict();
export type LocalAccountInput = z.infer<typeof localAccountSchema>;
export interface GuestState {
  membership: Membership;
  username: string | null;
  remaining: number;
  limit: number;
  profile: OverseasProfile;
  history: GuestHistoryEntry[];
  reviewedRequests: string[];
}
export type AccountOutcome =
  | { status: 'ok'; state: GuestState }
  | {
      status: 'invalid_credentials' | 'unavailable' | 'rate_limited' | 'conflict';
    };
export const membershipLimits = { guest: 5, free: 10, standard: 100, advanced: 200 } as const;
export const researchFeatureSchema = z.enum(['deep', 'upload', 'export', 'extended']);
export type ResearchFeature = z.infer<typeof researchFeatureSchema>;
export const hasResearchAccess = (membership: Membership, _feature: ResearchFeature): boolean =>
  membership === 'advanced';
