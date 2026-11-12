import { PIXFLOW_DOCUMENT_MAX_TURN_CHARACTERS, type PixflowDirectSiteAttachment, type PixflowDirectSiteSession } from '@open-design/contracts';
import { documentFormat, documentInputLimit } from './document-format';
import { pixflowPublicAssetUrl } from './public-assets';

type Reader = typeof import('./document-reader-entry');
type AttachmentReference = Omit<PixflowDirectSiteAttachment, 'projectId'> & { projectId?: string };
type ReadFile = (attachment: AttachmentReference, signal: AbortSignal) => Promise<{ content?: string }>;

export function siteDocumentRead(session: PixflowDirectSiteSession): ReadFile {
  return async (attachment, signal) => {
    if (!attachment.projectId) throw new Error('Attachment workspace unavailable');
    const response = await fetch(session.endpoint, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ tool: 'project.file.read', arguments: { projectId: attachment.projectId, path: attachment.path } }),
    });
    if (!response.ok) throw new Error('Attachment unavailable');
    return response.json();
  };
}

export async function prepareDocumentAttachments<T extends AttachmentReference>(attachments: T[] | undefined,
  readFile: ReadFile, signal: AbortSignal): Promise<T[] | undefined> {
  if (!attachments?.some(item => item.kind === 'file')) return attachments;
  const assetBase = new URL(pixflowPublicAssetUrl('documents/'), window.location.href);
  const prepared: T[] = [];
  let reader: Promise<Reader> | undefined;
  let remaining = PIXFLOW_DOCUMENT_MAX_TURN_CHARACTERS;
  const turnDeadline = AbortSignal.timeout(90_000);
  for (const attachment of attachments) {
    signal.throwIfAborted();
    if (attachment.kind !== 'file') { prepared.push(attachment); continue; }
    let document: PixflowDirectSiteAttachment['document'];
    if (!documentFormat(attachment.name)) {
      document = { status: 'unsupported', sections: [], note: 'This file format has no document reader.' };
    } else if (!remaining) {
      document = { status: 'partial', sections: [], note: 'The attachment text limit for this message was reached.' };
    } else if (turnDeadline.aborted) {
      document = { status: 'partial', sections: [], note: 'The attachment reading time limit for this message was reached.' };
    } else {
      const deadline = AbortSignal.any([signal, turnDeadline, AbortSignal.timeout(45_000)]);
      let onTimeout: (() => void) | undefined;
      try {
        const file = await readFile(attachment, deadline);
        if (typeof file.content !== 'string' || file.content.length > 4 * Math.ceil(documentInputLimit / 3)) {
          throw new Error('Missing or oversized file');
        }
        const bytes = Uint8Array.from(atob(file.content), letter => letter.charCodeAt(0));
        const source = new URL('reader.js', assetBase).href;
        reader ??= import(/* webpackIgnore: true */ source) as Promise<Reader>;
        deadline.throwIfAborted();
        document = await Promise.race([
          reader.then(module => {
            deadline.throwIfAborted();
            return module.readDocument(attachment.name, bytes.buffer, assetBase.href, deadline);
          }),
          new Promise<never>((_, reject) => {
            onTimeout = () => reject(deadline.reason);
            deadline.addEventListener('abort', onTimeout, { once: true });
          }),
        ]);
        const sections = [];
        for (const section of document.sections) {
          const text = section.text.slice(0, remaining);
          remaining -= text.length;
          if (text) sections.push({ ...section, text });
          if (text.length < section.text.length) {
            document = { status: 'partial', sections, note: 'The attachment text limit for this message was reached.' };
            break;
          }
        }
      } catch {
        signal.throwIfAborted();
        document = { status: 'unreadable', sections: [], note: deadline.aborted
          ? 'Reading this attachment timed out. Try a smaller file or attach the relevant pages.'
          : 'Pixflow could not prepare this file. Check the file size and format, or attach a fresh copy.' };
      } finally {
        if (onTimeout) deadline.removeEventListener('abort', onTimeout);
      }
    }
    prepared.push({ ...attachment, document });
  }
  return prepared;
}
