import type {
  ResearchReport,
  ResearchResponse,
  ResearchSource,
  ResearchStatus,
} from 'librechat-data-provider';
import type { ResearchState, ResearchStore, Observation } from './store';
import type { ExtractedPage } from './parser';
import type { FetchResult } from './fetch';
import {
  claims,
  sources,
  gaps,
  topic,
  licenseUrl,
  robotsUrl,
  policyReview,
  reviewedAt,
  reviewValidUntil,
  registryVersion,
  freshnessMs,
  cooldownMs,
} from './registry';
import { digest, extractPage } from './parser';
import { fetchSource } from './fetch';

export function isFresh(entry: Observation | undefined, now: Date): boolean {
  if (!entry?.succeeded || !entry.checkedAt) {
    return false;
  }
  const age = now.getTime() - Date.parse(entry.checkedAt);
  return age >= 0 && age <= freshnessMs;
}

export function sourceStatus(
  entry: Observation | undefined,
  reviewedHash: string,
  now: Date,
  policyValid: boolean,
): ResearchStatus {
  if (!entry?.succeeded || !entry.hash) {
    return 'unavailable';
  }
  return policyValid && isFresh(entry, now) && reviewedHash === entry.hash
    ? 'verified'
    : 'review_required';
}

export function supportsCitation(page: ExtractedPage, section: string, quote: string): boolean {
  return (
    quote.length > 0 &&
    page.sections.some(
      (item) => item.heading === section && `${item.heading} ${item.text}`.includes(quote),
    )
  );
}

export class ResearchService {
  private refreshing = false;

  constructor(
    readonly store: ResearchStore,
    private readonly fetcher: (url: string) => Promise<FetchResult> = fetchSource,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private policyValid(state: ResearchState, now: Date): boolean {
    return (
      now.getTime() >= Date.parse(reviewedAt) &&
      now.getTime() <= Date.parse(reviewValidUntil) &&
      isFresh(state.observations.license, now) &&
      isFresh(state.observations.robots, now) &&
      state.observations.license.hash === policyReview.licenseHash &&
      state.observations.robots.hash === policyReview.robotsHash
    );
  }

  async current(): Promise<ResearchResponse> {
    const now = this.clock();
    const state = await this.store.readState();
    const policyValid = this.policyValid(state, now);
    const counts = await this.store.versionCounts();
    const sourcePages = new Map<string, ExtractedPage>();
    const records: ResearchSource[] = [];
    const missing = [...gaps];
    for (const source of sources) {
      const entry = state.observations[source.id];
      let status = sourceStatus(entry, source.reviewedHash, now, policyValid);
      if (entry?.hash) {
        try {
          sourcePages.set(source.id, await this.store.page(source.id, entry.hash));
        } catch {
          status = 'unavailable';
        }
      }
      if (status !== 'verified') {
        missing.push({
          id: `source-${source.id}`,
          description: `${source.title}：未取得新鲜且经复核的来源版本，相关说明不能作为当前已核验结论。`,
          url: source.url,
        });
      }
      records.push({
        id: source.id,
        country: 'NZ',
        institution: 'Immigration New Zealand / MBIE',
        title: source.title,
        url: source.url,
        kind: source.kind,
        relatedIds: source.relatedIds,
        status,
        checkedAt: entry?.checkedAt ?? null,
        lastAttemptAt: entry?.lastAttemptAt ?? null,
        hash: entry?.hash ?? null,
        reviewedHash: source.reviewedHash || null,
        effectiveAt: null,
        expiresAt: null,
        httpLastModified: entry?.lastModified ?? null,
        versionCount: counts.get(source.id) ?? 0,
        licenseUrl,
        rights:
          status === 'verified' && source.excerptPermissionReviewed
            ? 'attribution_excerpt'
            : 'link_only',
      });
    }
    const byId = new Map(records.map((source) => [source.id, source]));
    const evaluated = claims.map((claim) => {
      const verified = claim.citations.every((citation) => {
        const page = sourcePages.get(citation.sourceId);
        return (
          byId.get(citation.sourceId)?.status === 'verified' &&
          page &&
          supportsCitation(page, citation.section, citation.quotation)
        );
      });
      if (!verified) {
        missing.push({
          id: `claim-${claim.id}`,
          description: `${claim.title}：逐项依据未通过本次核对；保留说明仅作历史研究草稿。`,
          url: null,
        });
      }
      return {
        ...claim,
        status: verified ? ('verified' as const) : ('review_required' as const),
        citations: claim.citations.map((citation) => ({
          ...citation,
          quotation:
            byId.get(citation.sourceId)?.rights === 'attribution_excerpt' ? citation.quotation : '',
        })),
      };
    });
    if (!policyValid) {
      missing.push({
        id: 'policy',
        description:
          '来源许可或抓取规则未通过当前版本核对，原文摘录附件已关闭；不允许自动沿用旧许可。',
        url: licenseUrl,
      });
    }
    const attachments = new Map<string, string>();
    for (const page of sourcePages.values()) {
      for (const link of page.links) {
        if (/\.pdf(?:$|[?#])/iu.test(link.url)) {
          attachments.set(link.url, link.title);
        }
      }
    }
    for (const [url, title] of attachments) {
      missing.push({
        id: `attachment-${digest(url).slice(0, 12)}`,
        description: `关联附件未解析：${title || 'PDF'}`,
        url,
      });
    }
    const body: Omit<ResearchReport, 'id' | 'generatedAt'> = {
      schemaVersion: 1,
      registryVersion,
      topic,
      title: '新西兰签证体检：公开办理流程资料包',
      language: 'zh-Hans',
      reviewedAt,
      reviewValidUntil,
      scope:
        '本地研究样例，仅核对官方公开流程的五个环节。中文为本平台编写的解释，不是官方中文译文。核查时间不等于政策生效时间。',
      boundary:
        '不判断个人签证资格、体检义务或最佳移民路径，不替代获授权专业人员的个案服务；不提交申请，不收集健康资料，不代为联系诊所。',
      claims: evaluated,
      sources: records,
      gaps: missing,
      complete: false,
    };
    const report = await this.store.saveReport({
      ...body,
      id: digest(JSON.stringify(body)),
      generatedAt: now.toISOString(),
    });
    const lastAttempt = Math.max(
      0,
      ...Object.values(state.observations).map((entry) => Date.parse(entry.lastAttemptAt)),
    );
    return {
      report,
      history: await this.store.history(),
      nextRefreshAt: new Date(lastAttempt + cooldownMs).toISOString(),
    };
  }

  async refresh(): Promise<ResearchResponse> {
    const state = await this.store.readState();
    const now = this.clock();
    const lastAttempt = Math.max(
      0,
      ...Object.values(state.observations).map((entry) => Date.parse(entry.lastAttemptAt)),
    );
    if (this.refreshing || now.getTime() < lastAttempt + cooldownMs) {
      throw new Error('REFRESH_COOLDOWN');
    }
    this.refreshing = true;
    try {
      const collect = async (id: string, url: string, robots = false): Promise<void> => {
        const previous = state.observations[id];
        const attemptedAt = this.clock().toISOString();
        try {
          const result = await this.fetcher(url);
          const page = robots
            ? {
                title: 'robots.txt',
                text: result.body,
                sections: [{ heading: 'robots.txt', text: result.body }],
                links: [],
                hash: digest(
                  JSON.stringify({
                    sections: [{ heading: 'robots.txt', text: result.body }],
                    links: [],
                  }),
                ),
              }
            : extractPage(result.body, url);
          await this.store.savePage(id, page);
          state.observations[id] = {
            hash: page.hash,
            checkedAt: this.clock().toISOString(),
            lastAttemptAt: attemptedAt,
            lastModified: result.lastModified,
            succeeded: true,
          };
        } catch {
          state.observations[id] = {
            hash: previous?.hash ?? null,
            checkedAt: previous?.checkedAt ?? null,
            lastAttemptAt: attemptedAt,
            lastModified: previous?.lastModified ?? null,
            succeeded: false,
          };
        }
      };
      await collect('robots', robotsUrl, true);
      // A changed robots policy is never parsed optimistically; an operator must review it first.
      if (
        state.observations.robots.succeeded &&
        state.observations.robots.hash === policyReview.robotsHash
      ) {
        await collect('license', licenseUrl);
        if (
          state.observations.license.succeeded &&
          state.observations.license.hash === policyReview.licenseHash
        ) {
          for (const source of sources) {
            await collect(source.id, source.url);
          }
        }
      }
      await this.store.saveState(state);
      return await this.current();
    } finally {
      this.refreshing = false;
    }
  }
}
