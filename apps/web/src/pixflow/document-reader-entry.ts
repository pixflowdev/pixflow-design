import type { PixflowAttachmentDocument } from '@open-design/contracts';
import { PIXFLOW_DOCUMENT_MAX_CHARACTERS, PIXFLOW_DOCUMENT_MAX_SECTIONS } from '@open-design/contracts';
import { documentFormat, documentInputLimit, isOfficeFormat } from './document-format';

function decodeText(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  if (view[0] === 255 && view[1] === 254) return new TextDecoder('utf-16le').decode(view);
  if (view[0] === 254 && view[1] === 255) return new TextDecoder('utf-16be').decode(view);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(view); }
  catch { return new TextDecoder('windows-1252').decode(view); }
}

type OfficeNode = import('officeparser/slim').OfficeContentNode;

function columnName(index: number): string {
  let name = '';
  for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
    name = String.fromCharCode(65 + (number - 1) % 26) + name;
  }
  return name;
}

function officeText(node: OfficeNode): string {
  if (node.type === 'image' || node.type === 'embed') return '';
  const children = node.children || [];
  if (node.type === 'row') {
    return children.map((cell, index) => {
      const metadata = cell.type === 'cell' ? cell.metadata : undefined;
      const reference = typeof metadata?.row === 'number' && typeof metadata.col === 'number'
        ? `${columnName(metadata.col)}${metadata.row + 1}` : `column ${index + 1}`;
      return `${reference}: ${officeText(cell)}`;
    }).join(' | ');
  }
  const content = children.length
    ? children.map(officeText).filter(Boolean).join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n')
    : node.text || '';
  const notes = node.notes?.map(officeText).filter(Boolean).join('\n');
  if (node.type === 'note') return `Notes: ${content}`;
  return notes ? content + '\n' + notes : content;
}

export async function readDocument(name: string, bytes: ArrayBuffer, assetBase: string, signal: AbortSignal): Promise<PixflowAttachmentDocument> {
  const format = documentFormat(name);
  if (!format) return { status: 'unsupported', sections: [], note: 'This file format has no document reader.' };
  if (bytes.byteLength > documentInputLimit) return { status: 'unreadable', sections: [], note: 'This document exceeds the 20 MB reading limit.' };
  const sections: PixflowAttachmentDocument['sections'] = [];
  const asset = (path: string) => new URL(path, assetBase).href;
  let remaining = PIXFLOW_DOCUMENT_MAX_CHARACTERS;
  let limited = false;
  const add = (label: string, content: string) => {
    const text = content.replaceAll('\0', '').trim();
    if (!text) return true;
    for (let offset = 0; offset < text.length; offset += 6_000) {
      if (remaining <= 0 || sections.length >= PIXFLOW_DOCUMENT_MAX_SECTIONS) { limited = true; return false; }
      const part = text.slice(offset, offset + Math.min(remaining, 6_000));
      sections.push({ label: (offset ? `${label} (continued)` : label).slice(0, 200), text: part });
      remaining -= part.length;
      if (!remaining && offset + part.length < text.length) { limited = true; return false; }
    }
    return true;
  };
  let note: string | undefined;
  try {
    if (format === 'pdf') {
      note = await (await import('./document-reader-pdf')).readPdf(bytes, asset, add, signal);
    } else if (format === 'doc' || format === 'xls' || format === 'ppt') {
      await (await import('./document-reader-legacy')).readLegacyDocument(format, bytes, asset, add, signal);
    } else if (isOfficeFormat(format) || format === 'csv' || format === 'tsv') {
      const { parseOffice } = await import('officeparser/slim');
      const delimited = format === 'csv' || format === 'tsv';
      const ast = await parseOffice(delimited ? new TextEncoder().encode(decodeText(bytes)).buffer : bytes, {
        fileType: format === 'tsv' ? 'csv' : format,
        allowRemoteAssets: false,
        abortSignal: signal,
        ...(format === 'tsv' ? { csvDelimiter: '\t' } : {}),
        decompressionLimits: { maxUncompressedBytes: 50 * 1024 * 1024, maxTableCells: 50_000, maxXmlElements: 250_000 },
      });
      for (const [index, node] of ast.content.entries()) {
        signal.throwIfAborted();
        const label = node.type === 'slide' ? `Slide ${node.metadata?.slideNumber ?? index + 1}`
          : node.type === 'sheet' ? node.metadata?.sheetName || `Sheet ${index + 1}`
            : node.type === 'heading' ? node.text || `Heading ${index + 1}` : `Block ${index + 1}`;
        if ((node.type === 'sheet' || node.type === 'table') && node.children?.length) {
          for (const [row, child] of node.children.entries()) {
            const first = child.children?.find(cell => cell.type === 'cell' && typeof cell.metadata?.row === 'number');
            const number = first?.type === 'cell' && typeof first.metadata?.row === 'number' ? first.metadata.row + 1 : row + 1;
            if (!add(`${delimited ? format.toUpperCase() : label} · row ${number}`, officeText(child))) break;
          }
          if (limited) break;
        } else if (!add(label, officeText(node))) break;
      }
      if (ast.warnings.length) note = 'The document parser reported incomplete or unsupported content.';
    } else {
      const lines = decodeText(bytes).split(/\r\n|\r|\n/);
      for (let index = 0; index < lines.length; index += 80) {
        signal.throwIfAborted();
        if (!add(`Lines ${index + 1}–${Math.min(index + 80, lines.length)}`, lines.slice(index, index + 80).join('\n'))) break;
      }
    }
  } catch (error) {
    signal.throwIfAborted();
    const reason = error as { name?: string; code?: string };
    if (reason.name === 'PasswordException' || reason.code?.startsWith('PASSWORD_') || reason.code === 'encrypted') {
      return { status: 'locked', sections: [], note: 'This document is password protected. Attach an unlocked copy.' };
    }
    note = 'This file could not be read completely. Check that it opens and try exporting a fresh copy.';
  }
  if (limited) note = 'The extract reached the document size limit. Some content was omitted.';
  return sections.length
    ? { status: note ? 'partial' : 'readable', sections, ...(note ? { note } : {}) }
    : { status: 'unreadable', sections, note: note || 'No readable text was found.' };
}
