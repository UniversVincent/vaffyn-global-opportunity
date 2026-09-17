import { parse } from 'parse5';
import { createHash } from 'node:crypto';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export interface ExtractedPage {
  title: string;
  text: string;
  sections: { heading: string; text: string }[];
  links: { title: string; url: string }[];
  hash: string;
}

export const digest = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

const isElement = (node: Node): node is Element => 'tagName' in node;
const normalize = (value: string): string => value.replace(/\s+/gu, ' ').trim();
const attr = (node: Element, name: string): string =>
  node.attrs.find((item) => item.name === name)?.value ?? '';
const excluded = new Set(['script', 'style', 'nav', 'footer', 'form', 'noscript', 'template']);

function content(node: Node): string {
  if (node.nodeName === '#text' && 'value' in node) {
    return node.value;
  }
  if (isElement(node) && excluded.has(node.tagName)) {
    return '';
  }
  return 'childNodes' in node ? node.childNodes.map(content).join(' ') : '';
}

function findMain(node: Node): Element | undefined {
  if (isElement(node) && attr(node, 'class').split(/\s+/u).includes('content-page__main')) {
    return node;
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      const match = findMain(child);
      if (match) {
        return match;
      }
    }
  }
  return undefined;
}

export function extractPage(html: string, url: string): ExtractedPage {
  const main = findMain(parse(html));
  if (!main) {
    throw new Error('CONTENT_LAYOUT_CHANGED');
  }
  const sections: ExtractedPage['sections'] = [];
  const links = new Map<string, string>();
  let title = '';
  let current = { heading: '', text: '' };

  const visit = (node: Node): void => {
    if (isElement(node) && (excluded.has(node.tagName) || attr(node, 'aria-hidden') === 'true')) {
      return;
    }
    if (isElement(node) && /^h[1-6]$/u.test(node.tagName)) {
      if (current.heading || current.text) {
        sections.push({ heading: current.heading, text: normalize(current.text) });
      }
      current = { heading: normalize(content(node)), text: '' };
      if (node.tagName === 'h1') {
        title = current.heading;
      }
      return;
    }
    if (isElement(node) && node.tagName === 'a') {
      try {
        const target = new URL(attr(node, 'href'), url);
        if (target.protocol === 'https:' && !target.username && !target.password) {
          links.set(target.href, normalize(content(node)));
        }
      } catch {
        // Broken source links remain a source-quality issue, never an executable URL.
      }
    }
    if (node.nodeName === '#text' && 'value' in node) {
      current.text += ` ${node.value}`;
    }
    if ('childNodes' in node) {
      node.childNodes.forEach(visit);
    }
  };
  visit(main);
  sections.push({ heading: current.heading, text: normalize(current.text) });
  const text = sections.map((section) => `${section.heading}\n${section.text}`).join('\n\n');
  if (!title || text.length < 200) {
    throw new Error('CONTENT_INCOMPLETE');
  }
  const linkList = Array.from(links, ([target, label]) => ({ title: label, url: target }));
  return {
    title,
    sections,
    text,
    links: linkList,
    hash: digest(JSON.stringify({ sections, links: linkList })),
  };
}
