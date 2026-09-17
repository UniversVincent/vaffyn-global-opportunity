import { zipSync, strToU8 } from 'fflate';
import { documentLimits, extractDocument } from '../documents';

const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const docx = (xml: string) =>
  zipSync({ 'word/document.xml': Uint8Array.from(strToU8(xml)) }, { level: 0 });

test.each(['resume.txt', 'RESUME.MD'])('reads local UTF-8 text %s', (name) => {
  expect(extractDocument(name, strToU8(' 电工\n五年经验 '))).toBe('电工\n五年经验');
});
test('extracts DOCX main-body paragraphs and XML text entities', () => {
  const bytes = docx(
    `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>Electrician</w:t></w:r></w:p><w:p><w:r><w:t>Five years &amp; training</w:t></w:r></w:p></w:body></w:document>`,
  );
  expect(extractDocument('cv.docx', bytes)).toBe('Electrician\nFive years & training');
});
test.each(['cv.pdf', 'cv.doc', 'cv.exe', 'cv'])('rejects unsupported type %s', (name) =>
  expect(() => extractDocument(name, strToU8('data'))).toThrow(),
);
test.each(['', 'hello\0world', 'x'.repeat(12001)])(
  'rejects empty, binary or overlong text %#',
  (text) => expect(() => extractDocument('cv.txt', strToU8(text))).toThrow(),
);
test.each([
  '<bad',
  '<wrong/>',
  `<!DOCTYPE foo [<!ENTITY evil SYSTEM "file:///secret">]><w:document xmlns:w="${ns}"/>`,
])('rejects malformed or unsafe XML %#', (xml) =>
  expect(() => extractDocument('cv.docx', docx(xml))).toThrow(),
);
test('bounds both compressed input and expanded XML', () => {
  expect(() => extractDocument('cv.txt', new Uint8Array(documentLimits.bytes + 1))).toThrow(
    'DOCUMENT_SIZE',
  );
  expect(() => extractDocument('cv.docx', docx('x'.repeat(documentLimits.xmlBytes + 1)))).toThrow(
    'DOCUMENT_SIZE',
  );
});
