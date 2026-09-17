import { zipSync, strToU8 } from 'fflate';
import type { ResearchArchive, ResearchReport, ResearchStatus } from 'librechat-data-provider';
import { digest } from './parser';

export const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );

const statusText: Record<ResearchStatus, string> = {
  verified: '已核对本次来源版本',
  review_required: '待重新核验，不作为当前结论',
  unavailable: '当前来源未取得或完整性校验失败',
};
const attribution =
  '原文摘录：Crown / Ministry of Business, Innovation and Employment (MBIE)，来源 Immigration New Zealand；CC BY 3.0 New Zealand。中文解释由 Vaffyn 编写，不是官方译文。未复制政府标识、图片、设计或第三方材料，不代表官方认可。';
const license = 'https://creativecommons.org/licenses/by/3.0/nz/';
const value = (text: string | null) => text ?? '未确认';
const csv = (text: string | null): string => {
  const safe = value(text).replace(/^[=+@\-\t\r]/u, (prefix) => `'${prefix}`);
  return `"${safe.replace(/"/gu, '""')}"`;
};

export function renderReport(report: ResearchReport): string {
  const e = escapeHtml;
  const sourceById = new Map(report.sources.map((source) => [source.id, source]));
  const claims = report.claims
    .map(
      (claim) => `<section id="${e(claim.id)}">
    <h2>${e(claim.title)}</h2><p><strong>${e(statusText[claim.status])}</strong></p>
    <p>${e(claim.explanation)}</p>${claim.citations
      .map((citation) => {
        const source = sourceById.get(citation.sourceId);
        if (!source) {
          return '<p>引用来源缺失</p>';
        }
        const quote =
          source.rights === 'attribution_excerpt' && citation.quotation
            ? `<blockquote lang="en">${e(citation.quotation)}</blockquote>`
            : '<p>仅提供原站链接；摘录未获本次导出许可。</p>';
        return `<aside><p><a href="${e(source.url)}">${e(source.title)}</a> / ${e(citation.section)}</p>${quote}<p>实际核查：${e(value(source.checkedAt))}；${e(statusText[source.status])}</p></aside>`;
      })
      .join('')}</section>`,
    )
    .join('');
  const sources = report.sources
    .map(
      (source) => `<li><h3><a href="${e(source.url)}">${e(source.title)}</a></h3>
    <p>${e(source.institution)} · ${e(source.country)} · ${e(source.kind)}</p>
    <p>${e(statusText[source.status])}；实际核查 ${e(value(source.checkedAt))}；最近尝试 ${e(value(source.lastAttemptAt))}</p>
    <p>生效/失效日期：${e(value(source.effectiveAt))} / ${e(value(source.expiresAt))}。HTTP Last-Modified（不是生效日期）：${e(value(source.httpLastModified))}</p>
    <p>版本 SHA256：<code>${e(value(source.hash))}</code>；已存版本数 ${source.versionCount}；关联 ${e(source.relatedIds.join(', '))}</p>
    <p><a href="${e(source.licenseUrl)}">来源许可</a>；${source.rights === 'attribution_excerpt' ? '仅导出经核对的必要摘录，不含整页全文' : '仅链接，不导出原文'}</p></li>`,
    )
    .join('');
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <title>${e(report.title)} | Vaffyn</title>
    <style>html{color-scheme:light dark}body{font-family:system-ui,sans-serif;max-width:56rem;margin:auto;padding:1.5rem;line-height:1.7;overflow-wrap:anywhere}section{margin-block:2rem}aside{border-inline-start:2px solid;padding-inline-start:1rem}h1{font-size:1.7rem}h2{font-size:1.2rem}h3{font-size:1rem}code{font-size:.8rem}li{margin-block:1rem}@media print{html{color-scheme:light}a{color:inherit}section{break-inside:avoid}}</style>
    </head><body><header><p>Vaffyn · 主题证据资料包 · 本地公开资料样例</p><h1>${e(report.title)}</h1>
    <p>${e(report.scope)}</p><p><strong>${e(report.boundary)}</strong></p>
    <p>资料包生成：${e(report.generatedAt)}；说明复核：${e(report.reviewedAt)}；最迟重新审查：${e(report.reviewValidUntil)}</p>
    <p>报告 ID：<code>${e(report.id)}</code>；索引版本：${e(report.registryVersion)}</p>
    <p>本文件为固定历史快照，不会自动更新。回到本机研究页重新检查后再使用；本次覆盖仍有缺项。</p></header>
    <main>${claims}<section><h2>缺失与未确认事项</h2><ul>${report.gaps.map((gap) => `<li>${e(gap.description)}${gap.url ? ` <a href="${e(gap.url)}">官方来源</a>` : ''}</li>`).join('')}</ul></section>
    <section><h2>来源索引</h2><ol>${sources}</ol></section></main>
    <footer><p>${e(attribution)}</p><a href="${license}">CC BY 3.0 NZ</a></footer></body></html>`;
}

export function createArchive(report: ResearchReport): ResearchArchive {
  const entries: Record<string, Uint8Array> = {
    'report.html': strToU8(renderReport(report)),
    'report.json': strToU8(JSON.stringify(report, null, 2)),
    'source-index.csv': strToU8(
      '\uFEFF' +
        [
          [
            'id',
            'country',
            'institution',
            'title',
            'url',
            'kind',
            'checkedAt',
            'lastAttemptAt',
            'hash',
            'effectiveAt',
            'expiresAt',
            'status',
            'rights',
            'licenseUrl',
          ]
            .map(csv)
            .join(','),
          ...report.sources.map((source) =>
            [
              source.id,
              source.country,
              source.institution,
              source.title,
              source.url,
              source.kind,
              source.checkedAt,
              source.lastAttemptAt,
              source.hash,
              source.effectiveAt,
              source.expiresAt,
              source.status,
              source.rights,
              source.licenseUrl,
            ]
              .map(csv)
              .join(','),
          ),
        ].join('\r\n'),
    ),
    'README.txt': strToU8(
      `${report.title}\n报告 ID: ${report.id}\n${report.scope}\n${report.boundary}\n\nreport.html 与 report.json 使用同一份固定研究记录。source-index.csv 是索引，不是网页全文。excerpts/ 只含权利和版本核对通过的必要英文摘录。没有全文网页、PDF、医生名单或个人资料。\n导出文件不会自动更新；请返回本机 /research 页面检查更新。\n\n${attribution}\n${license}\n`,
    ),
  };
  for (const source of report.sources) {
    if (source.rights !== 'attribution_excerpt' || source.status !== 'verified') {
      continue;
    }
    const citations = report.claims.flatMap((claim) =>
      claim.citations.filter((citation) => citation.sourceId === source.id && citation.quotation),
    );
    if (!citations.length) {
      continue;
    }
    entries[`excerpts/${source.id}.txt`] = strToU8(
      [
        source.title,
        source.url,
        `实际核查: ${value(source.checkedAt)}`,
        `SHA256: ${value(source.hash)}`,
        ...citations.map((citation) => `${citation.section}\n${citation.quotation}`),
        attribution,
        source.licenseUrl,
        license,
      ].join('\n\n'),
    );
  }
  const data = zipSync(entries);
  return {
    filename: `${report.topic}-${report.id.slice(0, 12)}.zip`,
    base64: Buffer.from(data).toString('base64'),
    sha256: digest(Buffer.from(data)),
  };
}
