import { useState } from 'react';
import { useT } from '../i18n';
import { pixflowRuntimeFetch, pixflowWordPressRestFetch } from './runtime-fetch';

export function BridgeReportLink({ directory, filename, label }: { directory: string; filename: string; label: string }) {
  const t = useT();
  const [text, setText] = useState<string>();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  async function toggle() {
    if (text !== undefined) { setOpen(!open); return; }
    setLoading(true);
    setFailed(false);
    try {
      const session = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({mode:'ask'}) });
      if (!session.ok) throw new Error();
      const response = await pixflowRuntimeFetch('/api/pixflow/direct-site/report', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({session:await session.json(), directory, filename}), signal:AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (typeof result.text !== 'string') throw new Error();
      setText(result.text);
      setOpen(true);
    } catch { setFailed(true); } finally { setLoading(false); }
  }
  return <span><button type="button" className="md-link" aria-expanded={open} disabled={loading} onClick={toggle}>{label}</button>
    {failed && <span role="status"> {t('context.loadFailed')}</span>}
    {open && <span style={{display:'block', whiteSpace:'pre-wrap', overflowWrap:'anywhere'}}>{text}</span>}
  </span>;
}
