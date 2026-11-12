import { parentPort, workerData } from 'node:worker_threads';
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObject,
  PDFRawStream, PDFRef, PDFString,
} from 'pdf-lib';
import { AppError, Errors } from './errors';

async function parsePdf(body: Buffer): Promise<void> {
  try {
    const document = await PDFDocument.load(body, {
      ignoreEncryption: false,
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
    if (document.getPageCount() < 1) throw new Error('empty_pdf');
    assertPdfHasNoActiveContent(document);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 422) throw error;
    throw Errors.unprocessable(
      'The uploaded PDF is corrupt, encrypted, or structurally invalid.',
      'UPLOAD_PDF_INVALID'
    );
  }
}

const PDF_BLOCKED_KEYS = new Set([
  'javascript', 'js', 'embeddedfiles', 'ef', 'af', 'xfa',
  'richmediacontent', 'richmediasettings', 'richmedia',
]);
const PDF_BLOCKED_TYPES = new Set([
  'embeddedfile', 'fileattachment', 'richmedia', 'movie', 'sound', 'screen', '3d',
]);
const PDF_BLOCKED_ACTIONS = new Set([
  'javascript', 'launch', 'gotor', 'gotoe', 'submitform', 'importdata',
  'rendition', 'movie', 'sound', 'hide', 'setocgstate', 'trans',
  'thread', 'goto3dview',
]);
const PDF_NAVIGATION_ACTIONS = new Set(['nextpage', 'prevpage', 'firstpage', 'lastpage']);

/**
 * Inspect parsed dictionaries, including objects unpacked from ObjStm streams.
 * Raw keyword matching rejects ordinary initial-page/zoom destinations, text,
 * and scanner metadata while missing compressed or escaped active content.
 */
function assertPdfHasNoActiveContent(document: PDFDocument): void {
  const pending: PDFObject[] = document.context.enumerateIndirectObjects().map(([, value]) => value);
  const visited = new Set<PDFObject>();
  const visitedManualActions = new Set<PDFObject>();
  const visitedAutomaticActions = new Set<PDFObject>();
  const activeActions = new Set<PDFObject>();
  function reject(): never {
    throw Errors.unprocessable(
      'Active or embedded PDF content is not allowed.',
      'UPLOAD_PDF_ACTIVE_CONTENT'
    );
  }
  const resolve = (value: PDFObject | undefined): PDFObject | undefined => {
    for (let depth = 0; value instanceof PDFRef; depth += 1) {
      if (depth >= 32) throw new Error('cyclic_pdf_reference');
      value = document.context.lookup(value);
    }
    return value;
  };
  const entriesOf = (value: PDFDict): Map<string, PDFObject> => {
    const entries = new Map<string, PDFObject>();
    for (const [key, child] of value.entries()) {
      const name = pdfName(key);
      if (entries.has(name)) throw new Error('ambiguous_pdf_dictionary');
      entries.set(name, child);
    }
    return entries;
  };
  const inspectAction = (value: PDFObject | undefined, automatic = false, allowDestination = false, depth = 0): void => {
    if (depth > 128) throw new Error('excessive_pdf_action_depth');
    const action = resolve(value);
    if (!action) reject();
    // A destination array/name/string sets the first page and zoom; it does not
    // run an action. These are common in scanner and print-generated PDFs.
    if (allowDestination && (action instanceof PDFArray || action instanceof PDFName ||
      action instanceof PDFString || action instanceof PDFHexString)) return;
    if (action instanceof PDFArray) {
      for (const child of action.asArray()) inspectAction(child, automatic, false, depth + 1);
      return;
    }
    if (!(action instanceof PDFDict)) reject();
    const entries = entriesOf(action);
    const subtype = resolve(entries.get('s'));
    const name = subtype instanceof PDFName ? pdfName(subtype) : '';
    if (!['goto', 'uri', 'named'].includes(name)) reject();
    if (name === 'uri') {
      const target = resolve(entries.get('uri'));
      if (!(target instanceof PDFString || target instanceof PDFHexString) || automatic) reject();
      const uri = target.decodeText();
      if (!/^(https?:\/\/|mailto:)/i.test(uri) || /[\x00-\x20\x7f]/.test(uri)) reject();
    }
    if (name === 'named') {
      const target = resolve(entries.get('n'));
      if (!(target instanceof PDFName) || !PDF_NAVIGATION_ACTIONS.has(pdfName(target))) reject();
    }
    if (activeActions.has(action)) throw new Error('cyclic_pdf_action');
    // The same action may be shared by a clicked link and an automatic event.
    // A successful manual check must not skip the stricter automatic check of
    // its Next chain (for example GoTo -> URI).
    const visitedActions = automatic ? visitedAutomaticActions : visitedManualActions;
    if (visitedActions.has(action)) return;
    visitedActions.add(action);
    activeActions.add(action);
    const next = entries.get('next');
    if (next) inspectAction(next, automatic, false, depth + 1);
    activeActions.delete(action);
  };

  while (pending.length > 0) {
    const value = resolve(pending.pop());
    if (!value || visited.has(value)) continue;
    visited.add(value);
    if (visited.size > 100_000) throw new Error('excessive_pdf_object_count');
    if (value instanceof PDFArray) {
      pending.push(...value.asArray());
      continue;
    }
    const dictionary = value instanceof PDFRawStream ? value.dict : value;
    if (!(dictionary instanceof PDFDict)) continue;
    const entries = entriesOf(dictionary);
    for (const [key, child] of entries) {
      if (PDF_BLOCKED_KEYS.has(key)) reject();
      const resolved = resolve(child);
      if (value instanceof PDFRawStream && key === 'type' && resolved instanceof PDFName &&
        ['objstm', 'xref'].includes(pdfName(resolved))) {
        // Successfully parsed object/xref streams are consumed by pdf-lib.
        // A surviving stream (for example an ambiguously escaped Type) must not
        // hide objects that another PDF reader would still interpret.
        throw new Error('unparsed_pdf_object_stream');
      }
      if ((key === 'type' || key === 'subtype') && resolved instanceof PDFName &&
        PDF_BLOCKED_TYPES.has(pdfName(resolved))) reject();
      if (key === 's' && resolved instanceof PDFName && PDF_BLOCKED_ACTIONS.has(pdfName(resolved))) reject();
      if (key === 'openaction') inspectAction(child, true, true);
      if (key === 'aa') {
        if (!(resolved instanceof PDFDict)) reject();
        for (const eventAction of resolved.values()) inspectAction(eventAction, true);
      }
      // /A is also used for tagged-PDF structure attributes; only interpret an
      // action dictionary here, not a normal accessibility attribute dictionary.
      if (key === 'a' && resolved instanceof PDFDict && entriesOf(resolved).has('s')) inspectAction(child);
      pending.push(child);
    }
  }
}

function pdfName(name: PDFName): string {
  // pdf-lib decodes uppercase hex escapes. Normalize lowercase escapes too so
  // a reader cannot interpret an action name differently from the validator.
  return name.decodeText().replace(/#([0-9a-f]{2})/gi,
    (_, hex: string) => String.fromCharCode(parseInt(hex, 16))).toLowerCase();
}


if (parentPort && workerData?.kind === 'private-pdf-validation') {
  const port = parentPort;
  void parsePdf(Buffer.from(workerData.bytes as ArrayBuffer)).then(
    () => port.postMessage({ valid: true }),
    (error: unknown) => port.postMessage({
      valid: false,
      active: error instanceof AppError && error.code === 'UPLOAD_PDF_ACTIVE_CONTENT',
    }),
  ).finally(() => port.close());
}
