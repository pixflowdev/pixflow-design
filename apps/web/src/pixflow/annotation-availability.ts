import { pixflowFeatureEnabled } from './feature-runtime';
import { useEffect, useState } from 'react';
import { getPixflowRestConfig } from './wordpress-context';
import { pageAnnotationParts } from './page-annotation';
import type { ChatAttachment, ChatCommentAttachment } from '../types';

const changed = 'pixflow:annotation-availability';
let allowed: boolean | undefined;
export const annotationUnavailableMessage = 'Annotations require Pixflow Design Pro. Your annotation has been kept; activate Pro or remove the annotation attachment to send ordinary text.';
export class AnnotationUnavailableError extends Error {
  readonly deliveryNotStarted = true;
  constructor(message = annotationUnavailableMessage) { super(message); }
}
export function annotationAvailable(): boolean {
  return typeof window !== 'undefined' && pixflowFeatureEnabled('annotations') && allowed !== false && typeof (window as unknown as { PixflowAnnotationsFactory?: unknown }).PixflowAnnotationsFactory === 'function';
}
function setAllowed(value: boolean) {
  if (allowed !== value) { allowed = value; window.dispatchEvent(new Event(changed)); }
}
/** Uncached site check at the operation boundary, including restored queues and old tabs. */
export async function requireAnnotations(): Promise<void> {
  if (typeof window === 'undefined' || typeof (window as unknown as { PixflowAnnotationsFactory?: unknown }).PixflowAnnotationsFactory !== 'function') throw new AnnotationUnavailableError();
  const { restBaseUrl, restNonce } = getPixflowRestConfig();
  if (!restBaseUrl || !restNonce) throw new AnnotationUnavailableError('Reconnect this WordPress site before using annotations. Your draft has been kept.');
  let response: Response;
  try {
    response = await fetch(`${restBaseUrl.replace(/\/$/, '')}/features/annotations/authorize`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'X-WP-Nonce': restNonce },
    });
  } catch { throw new AnnotationUnavailableError('Could not check annotation availability. Reconnect and try again; your draft has been kept.'); }
  if (response.status === 403) { throw new AnnotationUnavailableError(); }
  if (!response.ok) throw new AnnotationUnavailableError('Could not check annotation availability. Reload this page and try again; your draft has been kept.');
  const data = await response.json();
  if (data?.available !== true) { throw new AnnotationUnavailableError(); }
  setAllowed(true);
}
export function containsAnnotations(prompt: string, attachments: ChatAttachment[] = [], comments: ChatCommentAttachment[] = []): boolean {
  return comments.length > 0 || attachments.some(item => item.annotationScreenshot) || pageAnnotationParts(prompt).some(part => typeof part !== 'string');
}
export function useAnnotationAvailability() {
  const [value, setValue] = useState(annotationAvailable);
  useEffect(() => {
    const sync = () => setValue(annotationAvailable());
    window.addEventListener(changed, sync);
    return () => window.removeEventListener(changed, sync);
  }, []);
  return value;
}
