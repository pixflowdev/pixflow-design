// Browser-only fixture, compiled against the real shared component by the Playwright suite.
export const messageScrollerFixture = `import { createElement as h, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SharedMessageStream } from '../../apps/web/src/components/shared-chat/SharedMessageStream';
import { ChatTranscriptItem } from '../../apps/web/src/components/chat/MessageScroller';

type Row = { id: string; user?: boolean; height: number };
function Fixture() {
  const log = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>(Array.from({ length: 20 }, (_, i) => ({ id: \`row-\${i}\`, user: i % 2 === 0, height: 100 })));
  const [session, setSession] = useState('a');
  const [queue, setQueue] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  Object.assign(window, { fixture: {
    grow: () => flushSync(() => setRows(rows => rows.map((row, i) => i === rows.length - 1 ? { ...row, height: row.height + 100 } : row))),
    growAbove: () => flushSync(() => setRows(rows => rows.map((row, i) => i === 12 ? { ...row, height: row.height + 100 } : row))),
    send: () => flushSync(() => setRows(rows => [...rows, { id: 'new-user', user: true, height: 60 }, { id: 'new-reply', height: 60 }])),
    prepend: () => flushSync(() => setRows(rows => [{ id: 'earlier-user', user: true, height: 200 }, { id: 'earlier-reply', height: 400 }, ...rows])),
    switch: () => flushSync(() => setSession(session => session + 'b')),
    queue: () => flushSync(() => setQueue(queue => !queue)),
    prepare: () => flushSync(() => setLoading(loading => !loading)),
    history: () => flushSync(() => setHistoryLoading(loading => !loading)),
    long: () => flushSync(() => setRows(Array.from({ length: 1000 }, (_, i) => ({ id: \`row-\${i}\`, user: i % 2 === 0, height: 100 })))),
  }});
  const lastUser = rows.findLast(row => row.user)?.id;
  return h('main', {style: {height: 500, width: 'min(450px, 100%)', display: 'flex', flexDirection: 'column'}},
    h(SharedMessageStream, {logRef: log, scrollSessionKey: session, loading, historyLoading,
      scrollToLatestLabel: 'Jump to latest', jumpToLatestLabel: 'Jump to latest', t: key => key,
      rows: rows.map(row => h(ChatTranscriptItem, {key: row.id, messageId: row.id, 'data-message-role': row.user ? 'user' : 'assistant', scrollAnchor: row.user, animateNew: row.id === lastUser},
        h('article', {style: {minHeight: row.height}}, h('p', null, \`\${row.id} readable content\`),
          h('a', {href: '#details'}, 'Open link'), h('details', null, h('summary', null, 'Details'), h('div', {style: {height: 250}}, 'Expanded details'))))) }),
    queue && h('aside', {style: {height:100,flexShrink:0}}, 'Queued message'),
    h('textarea', {'aria-label':'Composer', style: {height:40,flexShrink:0}}));
}
createRoot(document.getElementById('root')!).render(h(Fixture));
`;
