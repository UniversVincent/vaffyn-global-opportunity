import { unzipSync, strFromU8 } from 'fflate';

export interface LocalDocument {
  id: string;
  name: string;
  text: string;
  confirmed: boolean;
}

const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const documentLimits = {
  bytes: 2 * 1024 * 1024,
  xmlBytes: 1024 * 1024,
  characters: 12000,
  count: 3,
};

export function extractDocument(name: string, bytes: Uint8Array): string {
  if (bytes.byteLength === 0 || bytes.byteLength > documentLimits.bytes) {
    throw new Error('DOCUMENT_SIZE');
  }
  const extension = name.split('.').pop()?.toLowerCase();
  let text: string;
  if (extension === 'txt' || extension === 'md') {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } else if (extension === 'docx') {
    let entries = 0;
    const files = unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        if (entries > 512) {
          throw new Error('DOCUMENT_SIZE');
        }
        if (file.name !== 'word/document.xml') {
          return false;
        }
        if (
          file.originalSize < 1 ||
          file.originalSize > documentLimits.xmlBytes ||
          file.size > documentLimits.bytes
        ) {
          throw new Error('DOCUMENT_SIZE');
        }
        return true;
      },
    });
    const xmlBytes = files['word/document.xml'];
    if (!xmlBytes || xmlBytes.byteLength > documentLimits.xmlBytes) {
      throw new Error('DOCUMENT_FORMAT');
    }
    const xml = strFromU8(xmlBytes);
    if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
      throw new Error('DOCUMENT_FORMAT');
    }
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (
      parsed.querySelector('parsererror') ||
      parsed.documentElement.namespaceURI !== wordNamespace
    ) {
      throw new Error('DOCUMENT_FORMAT');
    }
    text = Array.from(parsed.getElementsByTagNameNS(wordNamespace, 'p'), (paragraph) =>
      Array.from(
        paragraph.getElementsByTagNameNS(wordNamespace, 't'),
        (node) => node.textContent ?? '',
      ).join(''),
    ).join('\n');
  } else {
    throw new Error('DOCUMENT_FORMAT');
  }
  text = text.trim();
  if (!text || text.includes('\0') || text.length > documentLimits.characters) {
    throw new Error('DOCUMENT_TEXT');
  }
  return text;
}

export async function readLocalDocument(file: File): Promise<LocalDocument> {
  if (file.size > documentLimits.bytes) {
    throw new Error('DOCUMENT_SIZE');
  }
  return {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 120),
    text: extractDocument(file.name, new Uint8Array(await file.arrayBuffer())),
    confirmed: false,
  };
}
