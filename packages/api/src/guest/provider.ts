import { z } from 'zod';
import { guestFieldSchema, guestReplySchema } from 'librechat-data-provider';
import type {
  GuestHistoryEntry,
  GuestReply,
  GuestRequest,
  OverseasProfile,
} from 'librechat-data-provider';
import { intakeInstructions } from './prompt';

export type GuestResponder = (
  request: GuestRequest,
  history: GuestHistoryEntry[],
  profile?: OverseasProfile,
) => Promise<GuestReply>;
type Transport = (body: string, signal: AbortSignal) => Promise<string>;

const outputSchema = z.object({
  status: z.literal('completed'),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
});

const fields = guestFieldSchema.options;
const replyFormat = {
  type: 'json_schema',
  name: 'research_intake',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      kind: { type: 'string', enum: ['answer', 'clarify', 'ready', 'professional_boundary'] },
      summary: { type: 'string' },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            field: { type: 'string', enum: fields },
            text: { type: 'string' },
            examples: { type: 'array', items: { type: 'string' } },
          },
          required: ['field', 'text', 'examples'],
        },
      },
      facts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            field: { type: 'string', enum: fields },
            value: { type: 'string' },
            evidence: { type: 'string' },
          },
          required: ['field', 'value', 'evidence'],
        },
      },
    },
    required: ['kind', 'summary', 'questions', 'facts'],
  },
};

export function validateReply(
  reply: GuestReply,
  request: GuestRequest,
  history: GuestHistoryEntry[],
  profile: OverseasProfile = { revision: 0, entries: [] },
): GuestReply {
  const parsed = guestReplySchema.parse(reply);
  const inputs = [request];
  const evidence = inputs.flatMap((entry) => [
    entry.text,
    ...entry.attachments.map((file) => file.text),
  ]);
  const facts = new Set(parsed.facts.map((fact) => fact.field));
  const known = new Set(profile.entries.map((entry) => entry.field));
  if (
    parsed.facts.some((fact) => !evidence.some((text) => text.includes(fact.evidence))) ||
    facts.size !== parsed.facts.length ||
    new Set(parsed.questions.map((question) => question.field)).size !== parsed.questions.length ||
    parsed.questions.some((question) => facts.has(question.field) || known.has(question.field)) ||
    (parsed.kind !== 'clarify' && parsed.questions.length > 0) ||
    (parsed.kind === 'clarify' && parsed.questions.length === 0)
  ) {
    throw new Error('INVALID_INTAKE_OUTPUT');
  }
  return parsed;
}

export function createIntakeResponder(model: string, transport: Transport): GuestResponder {
  return async (request, history, profile = { revision: 0, entries: [] }) => {
    const input = history.flatMap((entry) => [
      { role: 'user', content: JSON.stringify(entry.request) },
      { role: 'assistant', content: JSON.stringify(entry.reply) },
    ]);
    input.push({ role: 'user', content: JSON.stringify({ request, confirmedProfile: profile }) });
    const raw = await transport(
      JSON.stringify({
        model,
        instructions: intakeInstructions,
        input,
        store: false,
        max_output_tokens: 1400,
        tools: [],
        text: { format: replyFormat },
      }),
      AbortSignal.timeout(30_000),
    );
    if (Buffer.byteLength(raw) > 128 * 1024) {
      throw new Error('MODEL_RESPONSE_TOO_LARGE');
    }
    const result = outputSchema.parse(JSON.parse(raw));
    const texts = result.output
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? []);
    if (texts.length !== 1 || texts[0].type !== 'output_text' || !texts[0].text) {
      throw new Error('MODEL_RESPONSE_UNAVAILABLE');
    }
    return validateReply(
      guestReplySchema.parse(JSON.parse(texts[0].text)),
      request,
      history,
      profile,
    );
  };
}

export function configuredIntakeResponder(env: NodeJS.ProcessEnv): GuestResponder | undefined {
  if (env.VAFFYN_ENABLE_LOCAL_AI !== 'true' || !env.OPENAI_API_KEY || !env.VAFFYN_INTAKE_MODEL) {
    return undefined;
  }
  const key = env.OPENAI_API_KEY;
  return createIntakeResponder(env.VAFFYN_INTAKE_MODEL, async (body, signal) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body,
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error('MODEL_UNAVAILABLE');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const item = await reader.read();
      if (item.done) {
        break;
      }
      bytes += item.value.byteLength;
      if (bytes > 128 * 1024) {
        await reader.cancel();
        throw new Error('MODEL_RESPONSE_TOO_LARGE');
      }
      chunks.push(item.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  });
}
