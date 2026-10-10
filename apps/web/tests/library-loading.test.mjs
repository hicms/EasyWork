import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const entry = process.env.EASYWORK_LIBRARY_TEST_ENTRY ?? new URL('../../../packages/plugins/library/dist/index.js', import.meta.url).href;
const manifest = new URL('../../../packages/plugins/library/package.json', import.meta.url).href;

function isolated(code) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { registerHooks, createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(manifest)});
    const loaded = [];
    let onDocumentLoad;
    registerHooks({ load(url, context, next) {
      loaded.push(url);
      if (/document-converters[^/]*\\.js$/.test(url)) onDocumentLoad?.();
      return next(url, context);
    }});
    const { convertToMarkdown } = await import(${JSON.stringify(entry)});
    const bytes = value => new TextEncoder().encode(value);
    const documentLoads = () => loaded.filter(url => /document-converters[^/]*\\.js$/.test(url));
    ${code}
  `], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}

test('public Host import and text conversion leave document parsers unloaded', () => isolated(`
  assert.equal(documentLoads().length, 0);
  assert.deepEqual(await convertToMarkdown('text', bytes('hello\\r\\nworld')), {
    markdown: 'hello\\nworld', locations: [], warnings: [],
  });
  await assert.rejects(convertToMarkdown('text', Uint8Array.of(255)), error => error.message === 'library/invalid-text');
  const reason = new Error('cancelled before loading');
  await assert.rejects(convertToMarkdown('csv', bytes('x'), AbortSignal.abort(reason)), error => error === reason);
  assert.equal(documentLoads().length, 0);
`));

test('concurrent first conversions share a lazy module and retain results', () => isolated(`
  const [csv, html] = await Promise.all([
    convertToMarkdown('csv', bytes('name,value\\na,1')),
    convertToMarkdown('html', bytes('<html><h1>Title</h1><p>Body</p><script>secret()</script></html>')),
  ]);
  assert.match(csv.markdown, /a.*1/);
  assert.match(html.markdown, /Title/);
  assert.ok(!html.markdown.includes('secret'));
  assert.equal(documentLoads().length, 1);
`));

test('cancellation while loading a parser preserves the caller reason', () => isolated(`
  const controller = new AbortController();
  const reason = new Error('cancelled during loading');
  onDocumentLoad = () => queueMicrotask(() => controller.abort(reason));
  await assert.rejects(convertToMarkdown('html', bytes('invalid'), controller.signal), error => error === reason);
  assert.equal(documentLoads().length, 1);
`));

for (const kind of ['docx', 'pptx', 'xlsx', 'pdf']) {
  test(`${kind} first use loads its packaged parser and rejects malformed input`, () => isolated(`
    const kind = ${JSON.stringify(kind)};
    let input;
    if (kind === 'docx' || kind === 'pptx') {
      const JSZip = require('jszip');
      const zip = new JSZip();
      zip.file(kind === 'docx' ? 'word/document.xml' : 'ppt/slides/slide1.xml',
        kind === 'docx' ? '<w:p><w:r><w:t>Fixture</w:t></w:r></w:p>' : '<a:t>Fixture</a:t>');
      input = await zip.generateAsync({ type: 'uint8array' });
    } else if (kind === 'xlsx') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('Fixture').addRow(['Fixture', 42]);
      input = new Uint8Array(await workbook.xlsx.writeBuffer());
    } else {
      const { PDFDocument } = require('pdf-lib');
      const document = await PDFDocument.create();
      document.addPage().drawText('Fixture');
      input = await document.save();
    }
    assert.equal(documentLoads().length, 0);
    const converted = await convertToMarkdown(kind, input);
    assert.match(converted.markdown, /Fixture/);
    assert.equal(documentLoads().length, 1);
    await assert.rejects(convertToMarkdown(kind, bytes('invalid')), /library\\/invalid-/);
  `));
}
