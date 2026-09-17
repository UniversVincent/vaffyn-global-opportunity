import path from 'node:path';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ResearchHistory, ResearchReport } from 'librechat-data-provider';
import type { ExtractedPage } from './parser';
import { digest } from './parser';

const observation = z.object({
  hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  checkedAt: z.string().datetime().nullable(),
  lastAttemptAt: z.string().datetime(),
  lastModified: z.string().nullable(),
  succeeded: z.boolean(),
});
const stateSchema = z.object({ observations: z.record(observation) });
const pageSchema = z.object({
  title: z.string(),
  text: z.string(),
  sections: z.array(z.object({ heading: z.string(), text: z.string() })),
  links: z.array(z.object({ title: z.string(), url: z.string().url() })),
  hash: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type Observation = z.infer<typeof observation>;
export type ResearchState = z.infer<typeof stateSchema>;
const validId = /^[a-z0-9-]{1,100}$/u;

function filename(id: string): string {
  if (!validId.test(id)) {
    throw new Error('INVALID_RECORD_ID');
  }
  return `${id}.json`;
}

async function writeImmutable(target: string, contents: string): Promise<void> {
  const pending = `${target}.${randomUUID()}.pending`;
  await fs.writeFile(pending, contents, { flag: 'wx' });
  try {
    await fs.link(pending, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  } finally {
    await fs.unlink(pending);
  }
}

export class ResearchStore {
  constructor(readonly directory: string) {}

  async initialize(): Promise<void> {
    await fs.mkdir(path.join(this.directory, 'snapshots'), { recursive: true });
    await fs.mkdir(path.join(this.directory, 'reports'), { recursive: true });
  }

  async readState(): Promise<ResearchState> {
    try {
      return stateSchema.parse(
        JSON.parse(await fs.readFile(path.join(this.directory, 'state.json'), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { observations: {} };
      }
      throw error;
    }
  }

  async saveState(state: ResearchState): Promise<void> {
    const target = path.join(this.directory, 'state.json');
    await fs.writeFile(`${target}.pending`, JSON.stringify(stateSchema.parse(state), null, 2));
    await fs.rename(`${target}.pending`, target);
  }

  async savePage(sourceId: string, page: ExtractedPage): Promise<void> {
    const target = path.join(this.directory, 'snapshots', filename(`${sourceId}-${page.hash}`));
    await writeImmutable(target, JSON.stringify(page, null, 2));
  }

  async page(sourceId: string, hash: string): Promise<ExtractedPage> {
    const parsed = pageSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(this.directory, 'snapshots', filename(`${sourceId}-${hash}`)),
          'utf8',
        ),
      ),
    );
    if (
      parsed.hash !== hash ||
      digest(JSON.stringify({ sections: parsed.sections, links: parsed.links })) !== hash
    ) {
      throw new Error('SNAPSHOT_INTEGRITY_FAILED');
    }
    return parsed;
  }

  async versionCounts(): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const entry of await fs.readdir(path.join(this.directory, 'snapshots'))) {
      const match = entry.match(/^([a-z-]+)-[a-f0-9]{64}\.json$/u);
      if (match) {
        result.set(match[1], (result.get(match[1]) ?? 0) + 1);
      }
    }
    return result;
  }

  async saveReport(report: ResearchReport): Promise<ResearchReport> {
    const target = path.join(this.directory, 'reports', filename(report.id));
    await writeImmutable(target, JSON.stringify(report, null, 2));
    return this.report(report.id);
  }

  async report(id: string): Promise<ResearchReport> {
    const data: ResearchReport = JSON.parse(
      await fs.readFile(path.join(this.directory, 'reports', filename(id)), 'utf8'),
    );
    const { id: storedId, generatedAt: _generatedAt, ...body } = data;
    if (storedId !== id || digest(JSON.stringify(body)) !== id) {
      throw new Error('REPORT_INTEGRITY_FAILED');
    }
    return data;
  }

  async history(): Promise<ResearchHistory[]> {
    const history: ResearchHistory[] = [];
    for (const entry of await fs.readdir(path.join(this.directory, 'reports'))) {
      if (!/^[a-f0-9]{64}\.json$/u.test(entry)) {
        continue;
      }
      const report = await this.report(entry.slice(0, -5));
      history.push({
        id: report.id,
        generatedAt: report.generatedAt,
        verifiedClaims: report.claims.filter((claim) => claim.status === 'verified').length,
        totalClaims: report.claims.length,
      });
    }
    return history.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, 20);
  }
}
