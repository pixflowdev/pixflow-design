/** Attach editor hosts after parsing; unrelated deferred scripts need not finish. */
export function onDocumentParsed(start: () => void, doc: Document = document): void {
  let started = false;
  const attach = () => {
    if (started || doc.readyState === 'loading') return;
    started = true;
    doc.removeEventListener('readystatechange', attach);
    doc.removeEventListener('DOMContentLoaded', attach);
    start();
  };
  doc.addEventListener('readystatechange', attach);
  doc.addEventListener('DOMContentLoaded', attach);
  attach();
}
