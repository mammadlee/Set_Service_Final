import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import sharp from 'sharp';
import { inspectUpload as sourceInspectUpload } from '../src/lib/file-security';
import { validatePdfContent as sourceValidatePdfContent } from '../src/lib/pdf-validation';

const distRuntime = process.argv.includes('--dist');
const inspectUpload: typeof sourceInspectUpload = distRuntime
  ? require('../dist/lib/file-security').inspectUpload
  : sourceInspectUpload;
const validatePdfContent: typeof sourceValidatePdfContent = distRuntime
  ? require('../dist/lib/pdf-validation').validatePdfContent
  : sourceValidatePdfContent;

function isCode(error: unknown, code: string): boolean {
  // Compiled and ts-node modules have distinct AppError constructors.
  return error instanceof Error && 'code' in error && error.code === code;
}

const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
let passed = 0;

function upload(body: Buffer, name = 'document.pdf', mime = 'application/pdf'): Express.Multer.File {
  return {
    fieldname: 'file', originalname: name, encoding: '7bit', mimetype: mime,
    size: body.length, buffer: body, stream: Readable.from(body),
    destination: '', filename: name, path: '',
  };
}

async function pdf(
  configure: (document: PDFDocument) => void | Promise<void> = () => undefined,
  compressed = false,
): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([400, 600]);
  await configure(document);
  return Buffer.from(await document.save({ useObjectStreams: compressed }));
}

async function accepts(name: string, body: Buffer, filename = 'document.pdf', mime = 'application/pdf') {
  const result = await inspectUpload(upload(body, filename, mime), allowed);
  assert.equal(result.detectedMimeType, mime);
  assert.equal(result.sizeBytes, body.length);
  assert.equal(result.sha256.length, 64);
  passed += 1;
  console.log(`PASS ${name}`);
}

async function rejects(name: string, body: Buffer, code: string,
  filename = 'document.pdf', mime = 'application/pdf') {
  await assert.rejects(() => inspectUpload(upload(body, filename, mime), allowed),
    (error: unknown) => isCode(error, code), name);
  passed += 1;
  console.log(`PASS ${name}`);
}

function action(document: PDFDocument, subtype: string, extra: Record<string, unknown> = {}): PDFDict {
  return document.context.obj({ S: PDFName.of(subtype), ...extra } as never) as unknown as PDFDict;
}

function link(document: PDFDocument, uri: string, hex = false) {
  const uriAction = action(document, 'URI', { URI: hex ? PDFHexString.fromText(uri) : PDFString.of(uri) });
  const annotation = document.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 100, 20], A: uriAction,
  });
  document.getPages()[0].node.set(PDFName.of('Annots'), document.context.obj([annotation]));
}

async function main() {
  await accepts('ordinary print PDF', await pdf());
  await accepts('compressed scanner PDF', await pdf(() => undefined, true));
  await accepts('scanner OpenAction initial page and zoom', await pdf((document) => {
    document.catalog.set(PDFName.of('OpenAction'),
      document.context.obj([document.getPages()[0].ref, 'Fit']));
  }));
  await accepts('OpenAction named destination', await pdf((document) => {
    document.catalog.set(PDFName.of('OpenAction'), PDFString.of('first-page'));
    document.catalog.set(PDFName.of('Dests'), document.context.obj({
      'first-page': [document.getPages()[0].ref, 'Fit'],
    }));
  }));
  await accepts('OpenAction indirect GoTo navigation', await pdf((document) => {
    document.catalog.set(PDFName.of('OpenAction'), document.context.register(action(document, 'GoTo', {
      D: [document.getPages()[0].ref, 'FitH', null],
    })));
  }, true));
  await accepts('print preferences and inert scanner metadata', await pdf((document) => {
    document.setSubject('Scanner /OpenAction /JavaScript /JS /EmbeddedFile <script> plain text');
    document.catalog.set(PDFName.of('ViewerPreferences'), document.context.obj({ PrintScaling: 'None' }));
  }));
  await accepts('literal PDF content is not interpreted as action names', await pdf((document) => {
    const contents = document.context.stream('BT (/JavaScript /JS /Launch /OpenAction) Tj ET');
    document.getPages()[0].node.set(PDFName.of('Contents'), document.context.register(contents));
  }));
  await accepts('tagged PDF accessibility attributes remain allowed', await pdf((document) => {
    document.catalog.set(PDFName.of('StructTreeRoot'), document.context.obj({
      Type: 'StructTreeRoot', K: { Type: 'StructElem', S: 'P', A: { O: 'Layout', SpaceBefore: 8 } },
    }));
  }));
  await accepts('ordinary CV HTTPS link', await pdf((document) => link(document, 'https://www.setservice.az')));
  await accepts('hex-encoded CV mailto link', await pdf((document) => link(document, 'mailto:cv@example.invalid', true)));
  await accepts('safe named next-page action', await pdf((document) => {
    document.catalog.set(PDFName.of('OpenAction'), action(document, 'Named', { N: PDFName.of('NextPage') }));
  }));
  const standard = await pdf();
  await assert.rejects(() => validatePdfContent(standard, { timeoutMs: 1 }),
    (error: unknown) => isCode(error, 'UPLOAD_PDF_INVALID'));
  passed += 1;
  console.log('PASS parser deadline terminates validation and releases its slot');
  const saturated = await Promise.allSettled(Array.from({ length: 7 }, () =>
    validatePdfContent(standard, { timeoutMs: 1 })));
  assert.equal(saturated.filter((result) => result.status === 'rejected' &&
    isCode(result.reason, 'UPLOAD_VALIDATOR_UNAVAILABLE')).length, 1);
  assert.equal(saturated.filter((result) => result.status === 'rejected' &&
    isCode(result.reason, 'UPLOAD_PDF_INVALID')).length, 6);
  passed += 1;
  console.log('PASS validation concurrency and queue are bounded');
  await accepts('valid PDF succeeds after deadline and queue saturation', standard);
  await accepts('PDF 2.0 header with valid structure', Buffer.from(standard.toString('latin1').replace('%PDF-1.7', '%PDF-2.0'), 'latin1'));

  for (const compressed of [false, true]) {
    const js = await pdf((document) => document.addJavaScript('unsafe', 'app.alert(1)'), compressed);
    if (compressed) assert.equal(js.includes(Buffer.from('/JavaScript')), false,
      'fixture must reproduce active content hidden in compressed object streams');
    await rejects(`JavaScript name tree (${compressed ? 'compressed' : 'plain'})`, js, 'UPLOAD_PDF_ACTIVE_CONTENT');
    await rejects(`OpenAction JavaScript (${compressed ? 'compressed' : 'plain'})`, await pdf((document) => {
      document.catalog.set(PDFName.of('OpenAction'), document.context.register(action(document, 'JavaScript', {
        JS: PDFString.of('app.alert(1)'),
      })));
    }, compressed), 'UPLOAD_PDF_ACTIVE_CONTENT');
    await rejects(`embedded attachment (${compressed ? 'compressed' : 'plain'})`, await pdf(async (document) => {
      await document.attach(Buffer.from('embedded payload'), 'attachment.txt', { mimeType: 'text/plain' });
    }, compressed), 'UPLOAD_PDF_ACTIVE_CONTENT');
  }
  for (const type of ['Launch', 'GoToR', 'GoToE', 'SubmitForm', 'ImportData', 'Rendition']) {
    await rejects(`${type} action`, await pdf((document) => {
      document.catalog.set(PDFName.of('OpenAction'), action(document, type, { F: PDFString.of('remote') }));
    }), 'UPLOAD_PDF_ACTIVE_CONTENT');
  }
  await rejects('unsafe Next action chained after safe GoTo', await pdf((document) => {
    document.catalog.set(PDFName.of('OpenAction'), action(document, 'GoTo', {
      D: [document.getPages()[0].ref, 'Fit'],
      Next: action(document, 'JavaScript', { JS: PDFString.of('app.alert(1)') }),
    }));
  }, true), 'UPLOAD_PDF_ACTIVE_CONTENT');
  await rejects('additional page action JavaScript', await pdf((document) => {
    document.getPages()[0].node.set(PDFName.of('AA'), document.context.obj({
      O: action(document, 'JavaScript', { JS: PDFString.of('app.alert(1)') }),
    }));
  }, true), 'UPLOAD_PDF_ACTIVE_CONTENT');
  for (const uri of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,test']) {
    await rejects(`unsafe URI scheme ${uri.split(':')[0]}`, await pdf((document) => link(document, uri)), 'UPLOAD_PDF_ACTIVE_CONTENT');
  }
  await rejects('automatic external URI navigation', await pdf((document) => {
    document.catalog.set(PDFName.of('OpenAction'), action(document, 'URI', { URI: PDFString.of('https://example.invalid') }));
  }), 'UPLOAD_PDF_ACTIVE_CONTENT');
  for (const compressed of [false, true]) {
    await rejects(`shared manual/automatic GoTo cannot hide a Next URI (${compressed ? 'compressed' : 'plain'})`, await pdf((document) => {
      const page = document.getPages()[0];
      const sharedAction = document.context.register(action(document, 'GoTo', {
        D: [page.ref, 'Fit'],
        Next: action(document, 'URI', { URI: PDFString.of('https://example.invalid/automatic') }),
      }));
      // The annotation is visited first. Its permitted manual URI chain must
      // still be rechecked when the shared action runs automatically on open.
      const annotation = document.context.register(document.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 100, 20], A: sharedAction,
      }));
      page.node.set(PDFName.of('Annots'), document.context.obj([annotation]));
      document.catalog.set(PDFName.of('OpenAction'), sharedAction);
    }, compressed), 'UPLOAD_PDF_ACTIVE_CONTENT');
  }
  await rejects('unknown action cannot run through annotation', await pdf((document) => {
    document.getPages()[0].node.set(PDFName.of('Annots'), document.context.obj([{
      Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 100, 20], A: action(document, 'UnknownActiveAction'),
    }]));
  }), 'UPLOAD_PDF_ACTIVE_CONTENT');
  await rejects('XFA form payload', await pdf((document) => {
    document.catalog.set(PDFName.of('AcroForm'), document.context.obj({ XFA: PDFString.of('<template/>') }));
  }), 'UPLOAD_PDF_ACTIVE_CONTENT');
  for (const type of ['RichMedia', 'FileAttachment', 'Movie', 'Sound', 'Screen', '3D']) {
    await rejects(`${type} annotation`, await pdf((document) => {
      document.getPages()[0].node.set(PDFName.of('Annots'), document.context.obj([{
        Type: 'Annot', Subtype: type, Rect: [0, 0, 100, 20],
      }]));
    }), 'UPLOAD_PDF_ACTIVE_CONTENT');
  }
  const escapedSource = await pdf((document) => {
    document.catalog.set(PDFName.of('OpenAction'), action(document, 'JavaScript', { JS: PDFString.of('app.alert(1)') }));
  });
  await rejects('hex-escaped JavaScript and JS keys', Buffer.from(escapedSource.toString('latin1')
    .replace('/JavaScript', '/Java#53cript').replace('/JS ', '/#4aS '), 'latin1'), 'UPLOAD_PDF_ACTIVE_CONTENT');
  await rejects('unreferenced compressed active object is still inspected', await pdf((document) => {
    document.context.register(action(document, 'JavaScript', { JS: PDFString.of('app.alert(1)') }));
  }, true), 'UPLOAD_PDF_ACTIVE_CONTENT');
  await rejects('ambiguous object stream cannot conceal actions', await pdf((document) => {
    const hidden = document.context.flateStream('99 0 << /S /JavaScript /JS (app.alert(1)) >>', {
      Type: PDFName.of('#4fbjStm'), N: 1, First: 5,
    });
    document.context.register(hidden);
  }), 'UPLOAD_PDF_INVALID');
  await rejects('case-ambiguous action key cannot hide malicious value', await pdf((document) => {
    document.catalog.set(PDFName.of('OpenAction'), action(document, 'JavaScript', { JS: PDFString.of('app.alert(1)') }));
    document.catalog.set(PDFName.of('openaction'), document.context.obj([document.getPages()[0].ref, 'Fit']));
  }), 'UPLOAD_PDF_INVALID');
  await rejects('cyclic action chain terminates and rejects', await pdf((document) => {
    const cyclic = action(document, 'GoTo', { D: [document.getPages()[0].ref, 'Fit'] });
    const reference = document.context.register(cyclic);
    cyclic.set(PDFName.of('Next'), reference);
    document.catalog.set(PDFName.of('OpenAction'), reference);
  }), 'UPLOAD_PDF_INVALID');
  await rejects('excessive action chain is bounded', await pdf((document) => {
    let next = document.context.register(action(document, 'GoTo', { D: [document.getPages()[0].ref, 'Fit'] }));
    for (let index = 0; index < 150; index += 1) {
      next = document.context.register(action(document, 'GoTo', {
        D: [document.getPages()[0].ref, 'Fit'], Next: next,
      }));
    }
    document.catalog.set(PDFName.of('OpenAction'), next);
  }, true), 'UPLOAD_PDF_INVALID');
  await rejects('encrypted PDF requires readable inspection', await pdf((document) => {
    document.context.trailerInfo.Encrypt = document.context.register(document.context.obj({ Filter: 'Standard', V: 1, R: 2 }));
  }), 'UPLOAD_PDF_INVALID');
  await rejects('trailing polyglot payload', Buffer.concat([standard, Buffer.from('<html>payload</html>')]), 'UPLOAD_POLYGLOT_BLOCKED');
  await rejects('corrupt structure', Buffer.from('%PDF-1.7\n1 0 obj\nbroken\n%%EOF'), 'UPLOAD_PDF_INVALID');
  await rejects('missing EOF', standard.subarray(0, standard.lastIndexOf(Buffer.from('%%EOF'))), 'UPLOAD_STRUCTURE_INVALID');
  await rejects('mismatched declared MIME', standard, 'UPLOAD_MIME_MISMATCH', 'document.pdf', 'image/png');
  await rejects('mismatched extension', standard, 'UPLOAD_EXTENSION_MISMATCH', 'document.jpg');
  await rejects('PDF-looking filename cannot override HTML magic', Buffer.from('<html>not a pdf</html>'), 'UPLOAD_ACTIVE_CONTENT_BLOCKED');
  await rejects('empty upload', Buffer.alloc(0), 'UPLOAD_FILE_EMPTY');
  await assert.rejects(() => inspectUpload({ ...upload(standard), size: standard.length + 1 }, allowed),
    (error: unknown) => isCode(error, 'UPLOAD_SIZE_MISMATCH'));
  passed += 1;
  console.log('PASS size metadata remains enforced');

  const source = sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } });
  const jpeg = await source.clone().jpeg().toBuffer();
  await accepts('JPG document support', jpeg, 'certificate.jpg', 'image/jpeg');
  await accepts('JPEG document support', jpeg, 'certificate.jpeg', 'image/jpeg');
  await accepts('PNG document support', await source.clone().png().toBuffer(), 'certificate.png', 'image/png');
  console.log(`PDF/file security regression (${distRuntime ? 'dist' : 'ts-node'}): ${passed} passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'PDF regression failed');
  process.exitCode = 1;
});
