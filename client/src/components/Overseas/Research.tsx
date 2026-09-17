import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Download,
  RefreshCw,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger, TabsContent, ThemeSelector } from '@librechat/client';
import type { ResearchSource, ResearchStatus } from 'librechat-data-provider';
import { useResearchQuery, useResearchRefresh, useResearchArchive } from '~/data-provider/Research';
import Language from '~/components/Nav/Language';
import useLocalize from '~/hooks/useLocalize';
import Brand from '~/components/Brand';

function Status({ status }: { status: ResearchStatus }) {
  const localize = useLocalize();
  const verified = status === 'verified';
  const Icon = verified ? CheckCircle2 : AlertTriangle;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {localize(verified ? 'com_ui_research_verified' : 'com_ui_research_unverified')}
    </span>
  );
}

function OfficialLink({ url, title }: { url: string; title: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-start gap-1 break-words text-text-primary underline underline-offset-4"
    >
      <span className="min-w-0 break-words">{title}</span>
      <ExternalLink className="mt-1 size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

function SourceDetails({ source }: { source: ResearchSource }) {
  const localize = useLocalize();
  const unknown = localize('com_ui_research_unknown');
  return (
    <>
      <p className="text-sm text-text-secondary">
        {source.institution} · {source.country}
      </p>
      <OfficialLink url={source.url} title={source.title} />
      <p className="text-sm">
        {localize('com_ui_research_checked')}: <time>{source.checkedAt ?? unknown}</time>
      </p>
      <Status status={source.status} />
    </>
  );
}

export default function Research() {
  const localize = useLocalize();
  const query = useResearchQuery();
  const refresh = useResearchRefresh();
  const archive = useResearchArchive();
  const [downloadState, setDownloadState] = useState<'idle' | 'success' | 'error'>('idle');
  const [now, setNow] = useState(Date.now());
  const report = query.data?.report;
  const coolingDown = now < Date.parse(query.data?.nextRefreshAt ?? '1970-01-01');

  useEffect(() => {
    if (!coolingDown) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [coolingDown]);

  const download = async (id: string) => {
    let objectUrl: string | undefined;
    const link = document.createElement('a');
    setDownloadState('idle');
    try {
      const result = await archive.mutateAsync(id);
      const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
      if (hash !== result.sha256) {
        throw new Error('ARCHIVE_INTEGRITY_FAILED');
      }
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      link.href = objectUrl;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      setDownloadState('success');
    } catch {
      setDownloadState('error');
    } finally {
      link.remove();
      if (objectUrl) {
        const completedUrl = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(completedUrl), 1000);
      }
    }
  };

  const sourceMap = new Map(report?.sources.map((source) => [source.id, source]));
  return (
    <div className="min-h-dvh bg-surface-primary text-text-primary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-4 py-4 sm:px-6">
        <Brand />
        <div className="flex items-center gap-2">
          <Language />
          <ThemeSelector returnThemeOnly />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        <Link to="/prepare" className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {localize('com_ui_research_back')}
        </Link>
        <div className="my-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-sm text-text-secondary">{localize('com_ui_research_sample')}</p>
            <h1 className="break-words text-2xl font-semibold">
              {report?.title ?? localize('com_ui_research_title')}
            </h1>
          </div>
          {report && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={refresh.isLoading || coolingDown}
                onClick={() => {
                  setDownloadState('idle');
                  refresh.mutate();
                }}
              >
                <RefreshCw className="mr-2 size-4 shrink-0" aria-hidden="true" />
                {localize(
                  refresh.isLoading ? 'com_ui_research_checking' : 'com_ui_research_refresh',
                )}
              </Button>
              <Button
                disabled={archive.isLoading || refresh.isLoading}
                onClick={() => download(report.id)}
              >
                <Download className="mr-2 size-4 shrink-0" aria-hidden="true" />
                {localize('com_ui_research_download')}
              </Button>
            </div>
          )}
        </div>
        {query.isLoading && <p role="status">{localize('com_ui_research_loading')}</p>}
        {query.isError && (
          <div role="alert" className="space-y-3">
            <p>{localize('com_ui_research_unavailable')}</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              {localize('com_ui_retry')}
            </Button>
          </div>
        )}
        {refresh.isError && (
          <p role="alert" className="mb-4">
            {localize('com_ui_research_refresh_error')}
          </p>
        )}
        {downloadState !== 'idle' && (
          <p role={downloadState === 'error' ? 'alert' : 'status'} className="mb-4">
            {localize(
              downloadState === 'error'
                ? 'com_ui_research_download_error'
                : 'com_ui_research_download_success',
            )}
          </p>
        )}
        {report && (
          <>
            <section
              aria-label={localize('com_ui_research_scope')}
              className="space-y-3 border-y border-border-light py-5"
            >
              <p>{report.scope}</p>
              <p className="text-sm text-text-secondary">{report.boundary}</p>
              <p className="text-sm text-text-secondary">{localize('com_ui_research_language')}</p>
              <p className="break-words text-sm text-text-secondary">
                {localize('com_ui_research_snapshot')}: <time>{report.generatedAt}</time> ·{' '}
                {localize('com_ui_research_gaps')}: {report.gaps.length}
              </p>
              {coolingDown && (
                <p className="text-xs text-text-secondary">
                  {localize('com_ui_research_cooldown')}
                </p>
              )}
            </section>
            <Tabs defaultValue="reading" className="mt-6">
              <TabsList
                aria-label={localize('com_ui_research_views')}
                className="grid w-full grid-cols-3 gap-1 border-b border-border-light pb-2"
              >
                <TabsTrigger className="min-w-0" value="reading">
                  {localize('com_ui_research_reading')}
                </TabsTrigger>
                <TabsTrigger className="min-w-0" value="sources">
                  {localize('com_ui_research_sources')}
                </TabsTrigger>
                <TabsTrigger className="min-w-0" value="history">
                  {localize('com_ui_research_history')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="reading" className="px-0 py-4">
                {report.claims.map((claim, index) => (
                  <section
                    key={claim.id}
                    className="space-y-3 border-b border-border-light py-5"
                    data-testid={`claim-${claim.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-medium">
                        {index + 1}. {claim.title}
                      </h2>
                      <Status status={claim.status} />
                    </div>
                    <p className="leading-7">{claim.explanation}</p>
                    <details className="text-sm">
                      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 py-1">
                        <ChevronDown className="size-4" aria-hidden="true" />
                        {localize('com_ui_research_evidence')}
                      </summary>
                      <div className="mt-3 space-y-5 border-l border-border-medium pl-4">
                        {claim.citations.map((citation) => {
                          const source = sourceMap.get(citation.sourceId);
                          return (
                            source && (
                              <div
                                className="space-y-2"
                                key={`${citation.sourceId}-${citation.section}`}
                              >
                                <SourceDetails source={source} />
                                <p>
                                  {localize('com_ui_research_section')}:{' '}
                                  <span lang="en">{citation.section}</span>
                                </p>
                                {citation.quotation ? (
                                  <>
                                    <p className="text-xs text-text-secondary">
                                      {localize('com_ui_research_original')}
                                    </p>
                                    <blockquote
                                      lang="en"
                                      className="break-words border-l border-border-medium pl-3"
                                    >
                                      {citation.quotation}
                                    </blockquote>
                                  </>
                                ) : (
                                  <p>{localize('com_ui_research_link_only')}</p>
                                )}
                              </div>
                            )
                          );
                        })}
                      </div>
                    </details>
                  </section>
                ))}
                <section className="space-y-3 py-6">
                  <h2 className="text-lg font-medium">{localize('com_ui_research_gaps')}</h2>
                  <ul className="list-disc space-y-3 pl-5">
                    {report.gaps.map((gap) => (
                      <li className="break-words" key={gap.id}>
                        {gap.description}
                        {gap.url && (
                          <div className="mt-1 text-sm">
                            <OfficialLink
                              url={gap.url}
                              title={localize('com_ui_research_open_source')}
                            />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </TabsContent>
              <TabsContent value="sources" className="px-0 py-4">
                <ul className="divide-y divide-border-light">
                  {report.sources.map((source) => (
                    <li key={source.id} className="space-y-3 py-5">
                      <SourceDetails source={source} />
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-text-secondary">
                            {localize('com_ui_research_attempt')}
                          </dt>
                          <dd>{source.lastAttemptAt ?? localize('com_ui_research_unknown')}</dd>
                        </div>
                        <div>
                          <dt className="text-text-secondary">
                            {localize('com_ui_research_effective')}
                          </dt>
                          <dd>{source.effectiveAt ?? localize('com_ui_research_unknown')}</dd>
                        </div>
                        <div>
                          <dt className="text-text-secondary">
                            {localize('com_ui_research_versions')}
                          </dt>
                          <dd>{source.versionCount}</dd>
                        </div>
                        <div>
                          <dt className="text-text-secondary">
                            {localize('com_ui_research_rights')}
                          </dt>
                          <dd>
                            {localize(
                              source.rights === 'attribution_excerpt'
                                ? 'com_ui_research_excerpts_only'
                                : 'com_ui_research_link_only',
                            )}
                          </dd>
                        </div>
                      </dl>
                      <details>
                        <summary className="cursor-pointer text-sm">
                          {localize('com_ui_research_version_details')}
                        </summary>
                        <p className="mt-2 break-all font-mono text-xs">
                          {source.hash ?? localize('com_ui_research_unknown')}
                        </p>
                        <div className="mt-3 text-sm">
                          <OfficialLink
                            url={source.licenseUrl}
                            title={localize('com_ui_research_license')}
                          />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="history" className="px-0 py-4">
                <p className="mb-4 text-sm text-text-secondary">
                  {localize('com_ui_research_historical')}
                </p>
                <ul className="divide-y divide-border-light">
                  {query.data?.history.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <p>
                          <time>{entry.generatedAt}</time>
                        </p>
                        <p className="text-xs text-text-secondary">
                          {entry.id.slice(0, 12)} · {entry.verifiedClaims}/{entry.totalClaims}{' '}
                          {localize('com_ui_research_verified')}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`${localize('com_ui_research_download')} ${entry.id.slice(0, 12)}`}
                        title={localize('com_ui_research_download')}
                        disabled={archive.isLoading || refresh.isLoading}
                        onClick={() => download(entry.id)}
                      >
                        <Download className="size-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </TabsContent>
            </Tabs>
            <footer className="space-y-2 border-t border-border-light py-5 text-xs text-text-secondary">
              <p>{localize('com_ui_research_attribution')}</p>
              <OfficialLink
                url="https://creativecommons.org/licenses/by/3.0/nz/"
                title="CC BY 3.0 NZ"
              />
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
