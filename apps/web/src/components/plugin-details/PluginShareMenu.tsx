// Personal plugin metadata and source actions.

import { useEffect, useRef, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { derivePluginSourceLinks } from '../../runtime/plugin-source';


interface Props {
  record: InstalledPluginRecord;
  /**
   * Render variant: `default` is the standalone button used by the
   * media detail header. `inline` drops the trigger as a ghost
   * button that sits inside the PreviewModal's `headerExtras`
   * slot — same popover, no extra padding.
   */
  variant?: 'default' | 'inline';
}

interface ShareItem {
  key: string;
  label: string;
  icon:
    | 'copy'
    | 'github'
    | 'external-link'
    | 'eye';
  onSelect: () => void | Promise<void>;
  /**
   * When true, the item triggers a `copy` action — we show a brief
   * "Copied" confirmation in the popover after it runs.
   */
  copies?: boolean;
}

interface ShareLinkItem {
  key: string;
  label: string;
  icon: 'github' | 'external-link' | 'eye';
  href: string;
}

function buildInstallCommand(record: InstalledPluginRecord): string {
  // The daemon's install resolver accepts the raw `record.source`
  // shape for every kind (github:owner/repo[@ref][/sub], https URL,
  // local path, marketplace id), so we mirror it verbatim. For
  // marketplace records should use the registry entry name when
  // provenance preserved it; sourceMarketplaceId names the catalog,
  // not the plugin package.
  if (typeof record.sourceMarketplaceEntryName === 'string') {
    return `od plugin install ${record.sourceMarketplaceEntryName}`;
  }
  if (record.sourceKind === 'marketplace' && typeof record.sourceMarketplaceId === 'string') {
    return `od plugin install ${record.sourceMarketplaceId}`;
  }
  return `od plugin install ${record.source}`;
}

export function PluginShareMenu({ record, variant = 'default' }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<{
    key: string;
    ok: boolean;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const links = derivePluginSourceLinks(record);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function copyPluginShareText(text: string, key: string) {
    if (!text) return;
    const ok = await copyToClipboard(text);
    setCopyFeedback({ key, ok });
    window.setTimeout(() => {
      setCopyFeedback((current) => (
        current?.key === key ? null : current
      ));
    }, 1600);
  }

  const items: ShareItem[] = [
    {
      key: 'id',
      label: t('plugins.actions.copyPluginId'),
      icon: 'copy',
      copies: true,
      onSelect: () => copyPluginShareText(record.id, 'id'),
    },
  ];
  const retiredCatalogue = record.sourceKind === 'bundled'
    || record.sourceMarketplaceId === 'official'
    || record.sourceMarketplaceId === 'community';
  if (!retiredCatalogue) {
    items.unshift({
      key: 'install',
      label: t('plugins.actions.copyInstallCommand'),
      icon: 'copy',
      copies: true,
      onSelect: () => copyPluginShareText(buildInstallCommand(record), 'install'),
    });
  }

  // Open-in-tab actions are real anchors so users can right-click,
  // copy the link address, or open in a new tab from browser chrome.
  const openItems: ShareLinkItem[] = [];
  if (links.sourceUrl) {
    openItems.push({
      key: 'source',
      label:
        record.sourceKind === 'github' || links.sourceUrl.includes('github.com/')
          ? t('plugins.actions.openSourceGithub')
          : t('plugins.actions.openSource'),
      icon: links.sourceUrl.includes('github.com/') ? 'github' : 'external-link',
      href: links.sourceUrl,
    });
  }
  if (links.homepageUrl) {
    openItems.push({
      key: 'homepage',
      label: t('plugins.actions.openHomepage'),
      icon: 'external-link',
      href: links.homepageUrl,
    });
  }

  const triggerClass =
    variant === 'inline'
      ? 'ghost plugin-share-trigger'
      : 'plugin-share-trigger plugin-share-trigger--solo';

  return (
    <div
      className="plugin-share-menu"
      ref={wrapRef}
      data-testid={`plugin-share-${record.id}`}
    >
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={t('designs.menuMore')}
      >
        <Icon name="more-horizontal" size={12} />
        <span>{t('homeHero.moreShortcuts')}</span>
      </button>
      {open ? (
        <div className="plugin-share-popover" role="menu">
          <div className="plugin-share-popover__group">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="plugin-share-item"
                onClick={() => void item.onSelect()}
              >
                <Icon
                  name={
                    copyFeedback?.key === item.key
                      ? copyFeedback.ok
                        ? 'check'
                        : 'close'
                      : item.icon
                  }
                  size={12}
                />
                <span>
                  {copyFeedback?.key === item.key
                    ? copyFeedback.ok
                      ? t('preview.shareCopied')
                      : t('preview.shareCopyFailed')
                    : item.label}
                </span>
              </button>
            ))}
          </div>
          <div className="plugin-share-popover__divider" />
          <div className="plugin-share-popover__group">
            {openItems.map((item) => (
              <a
                key={item.key}
                role="menuitem"
                className="plugin-share-item"
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
              >
                <Icon name={item.icon} size={12} />
                <span>{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
