import { createLegacyDoc } from '@silurus/ooxml-legacy-office/doc';
import { createLegacyXls } from '@silurus/ooxml-legacy-office/xls';
import { createLegacyPpt } from '@silurus/ooxml-legacy-office/ppt';
import type { BodyElement } from '@silurus/ooxml/docx';
import { documentInputLimit } from './document-format';

function wordText(element: BodyElement): string {
  if (element.type === 'paragraph') return element.runs.map(run => 'text' in run ? run.text : '').join('');
  if (element.type === 'table') return element.rows.map(row => row.cells.map(cell =>
    cell.content.map(wordText).join(' ')).join(' | ')).join('\n');
  return '';
}

export async function readLegacyDocument(format: 'doc' | 'xls' | 'ppt', bytes: ArrayBuffer,
  asset: (name: string) => string, add: (label: string, text: string) => boolean, signal: AbortSignal) {
  const source = {
    moduleUrl: asset(`legacy/legacy-${format}-source-module.js`),
    wasmUrl: asset(`legacy/legacy_${format}_direct_bg.wasm`),
    maxInputBytes: documentInputLimit,
  };
  const options = { mode: 'main' as const, useGoogleFonts: false, workerTimeoutMs: 15_000 };
  if (format === 'doc') {
    const url = asset('ooxml/docx.js');
    const { DocxDocument } = await import(/* webpackIgnore: true */ url) as typeof import('@silurus/ooxml/docx');
    const document = await DocxDocument.load(bytes, { ...options, legacyDoc: createLegacyDoc(source) });
    try {
      for (const [index, element] of document.document.body.entries()) {
        signal.throwIfAborted();
        if (!add(`Block ${index + 1}`, wordText(element))) return;
      }
    } finally { document.destroy(); }
  } else if (format === 'xls') {
    const url = asset('ooxml/xlsx.js');
    const { XlsxWorkbook } = await import(/* webpackIgnore: true */ url) as typeof import('@silurus/ooxml/xlsx');
    const workbook = await XlsxWorkbook.load(bytes, { ...options, legacyXls: createLegacyXls(source) });
    try {
      for (const [index, name] of workbook.sheetNames.entries()) {
        signal.throwIfAborted();
        const sheet = await workbook.getWorksheet(index);
        for (const row of sheet.rows) {
          const cells = row.cells.map(cell => `column ${cell.col + 1}: ${workbook.cellText(sheet, cell)}`);
          if (!add(`${name} · row ${row.index + 1}`, cells.join(' | '))) return;
        }
      }
    } finally { workbook.destroy(); }
  } else {
    const url = asset('ooxml/pptx.js');
    const { PptxPresentation } = await import(/* webpackIgnore: true */ url) as typeof import('@silurus/ooxml/pptx');
    const presentation = await PptxPresentation.load(bytes, { ...options, legacyPpt: createLegacyPpt(source) });
    try {
      for (let index = 0; index < presentation.slideCount; index++) {
        signal.throwIfAborted();
        const runs = await presentation.collectSlideRuns(index);
        const notes = presentation.getNotes(index);
        if (!add(`Slide ${index + 1}`, runs.map(run => run.text).join('\n') + (notes ? `\nNotes: ${notes}` : ''))) return;
      }
    } finally { presentation.destroy(); }
  }
}
