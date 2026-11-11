import { IconGlobe, IconPackages, IconFileText } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import type { ChatSkillMention } from '@open-design/contracts';
import { designCommandDisplayLabel } from '../../pixflow/design-command-descriptions';
import { Badge } from '../Badge';
import { citationSource } from './InlineCitation';
import styles from './UserMessageReferences.module.css';
import { contextAttachmentParts } from '../composer/context-attachment';

function LinkBadge({ url }: { url: URL }) {
  const [missingIcon, setMissingIcon] = useState(false);
  const sameOrigin = typeof window !== 'undefined' && url.origin === window.location.origin;
  const publicHttps = url.protocol === 'https:' && url.hostname.includes('.') &&
    !/^[\d.]+$|\.(?:local|localhost|internal)$/i.test(url.hostname);
  const favicon = sameOrigin || publicHttps ? new URL('/favicon.ico', url.origin).href : undefined;
  return (
    <Badge variant="outline" className={styles.link} render={
      <a href={url.href} target="_blank" rel="noopener noreferrer" title={url.href} aria-label={url.href} />
    }>
      {!favicon || missingIcon ? <IconGlobe aria-hidden="true" /> : (
        <img src={favicon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setMissingIcon(true)} />
      )}
      <span className={styles.label}>{url.host.replace(/^www\./i, '')}</span>
    </Badge>
  );
}

function renderLinks(text: string): ReactNode {
  if (!/https?:\/\//i.test(text)) return text;
  const parts: ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(/(?:^|[\s(<\[{])(?<url>https?:\/\/[^\s<>"\x60]+)/gi)) {
    const candidate = match.groups!.url!;
    let href = candidate.replace(/[.,!?;:，。！？；：、'」』】》〉）]+$/u, '');
    let excessClosers = href.split(')').length - href.split('(').length;
    while (href.endsWith(')') && excessClosers > 0) {
      href = href.slice(0, -1);
      excessClosers -= 1;
    }
    const url = citationSource(href);
    if (!url) continue;
    const start = match.index + match[0].length - candidate.length;
    parts.push(text.slice(end, start), <LinkBadge key={start + ':' + url.origin} url={url} />);
    end = start + href.length;
  }
  return end ? [...parts, text.slice(end)] : text;
}

function renderReferences(text: string): ReactNode {
  return contextAttachmentParts(text).map((part, index) => typeof part === 'string'
    ? <span key={index}>{renderLinks(part)}</span>
    : <Badge key={index} variant="ghost" className={styles.skill}>
        <IconFileText aria-hidden="true" /><span className={styles.label}>{part.label}</span>
      </Badge>);
}

export function UserMessageReferences({ content, skillMentions }: {
  content: string;
  skillMentions?: ChatSkillMention[];
}) {
  if (!Array.isArray(skillMentions) || !skillMentions.length) return <>{renderReferences(content)}</>;
  const parts: ReactNode[] = [];
  let end = 0;
  for (const mention of skillMentions) {
    if (!mention || !Number.isSafeInteger(mention.start) || mention.start < end ||
      typeof mention.label !== 'string' || !mention.label.trim() ||
      typeof mention.token !== 'string' || !/^[@/]/.test(mention.token) ||
      !content.startsWith(mention.token, mention.start)) continue;
    parts.push(
      <span key={'text-' + end}>{renderReferences(content.slice(end, mention.start))}</span>,
      <Badge key={'skill-' + mention.start} variant="ghost" className={styles.skill}>
        <IconPackages aria-hidden="true" />
        <span className={styles.label}>{designCommandDisplayLabel(mention.token) ?? mention.label.replace(/^[@/]/, '')}</span>
      </Badge>,
    );
    end = mention.start + mention.token.length;
  }
  return <>{parts}{renderReferences(content.slice(end))}</>;
}
