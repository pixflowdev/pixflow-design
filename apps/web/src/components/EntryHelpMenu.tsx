// Workspace help links open Pixflow pages and community channels in a new tab.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconBrandFacebook, IconBrandX, IconBulb, IconRoute } from '@tabler/icons-react';
import { popoverIn } from '../motion';
import { useAnalytics } from '../analytics/provider';
import {
  trackHelpPopoverClick,
  trackHelpPopoverSurfaceView,
  trackHomeNavClick,
} from '../analytics/events';
import { Icon } from './Icon';
import { useT } from '../i18n';

const ROADMAP_URL = 'https://pixflow.dev/roadmap';
const IDEAS_URL = 'https://pixflow.dev/ideas';
const FEATURE_REQUESTS_URL = 'https://pixflow.dev/feature-requests';
const CHANGELOG_URL = 'https://pixflow.dev/changelog';
const BRIDGE_DOWNLOAD_URL = 'https://pixflow.dev/download-bridge';
const X_URL = 'https://x.com/pixflowdev';
const FACEBOOK_URL = 'https://www.facebook.com/groups/pixflow';

const ext = { target: '_blank', rel: 'noreferrer noopener' } as const;

export function EntryHelpMenu() {
  const t = useT();
  const analytics = useAnalytics();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // P1 surface_view — fire once each time the help popover opens so the
  // "how often is help discovered" funnel doesn't conflate hover-clicks
  // away with intentional opens.
  useEffect(() => {
    if (!open) return;
    trackHelpPopoverSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'help_resources_popover',
    });
  }, [open, analytics.track]);

  return (
    <div className="entry-help-menu" ref={wrapRef}>
      <button
        type="button"
        className="entry-nav-rail__btn entry-help-menu__trigger"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) {
              // P0 ui_click area=nav element=help — emitted at the moment
              // the user discovers the help destination, not for every
              // closed-state click.
              trackHomeNavClick(analytics.track, {
                page_name: 'home',
                area: 'nav',
                element: 'help',
              });
            }
            return next;
          });
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('entry.helpAria')}
        data-tooltip={t('entry.helpAria')}
        data-testid="entry-help-trigger"
      >
        <Icon name="help-circle" size={18} />
      </button>
      <AnimatePresence>
        {open ? (
        <motion.div
          className="entry-help-popover"
          role="menu"
          aria-label={t('entry.helpMenuAria')}
          variants={popoverIn}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <a
            className="entry-help-popover__item"
            href={IDEAS_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'view_ideas_board',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <IconBulb size={14} stroke={1.75} />
            </span>
            <span>{t('entry.helpIdeasBoard')}</span>
          </a>
          <a
            className="entry-help-popover__item"
            href={ROADMAP_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'view_roadmap',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <IconRoute size={14} stroke={1.75} />
            </span>
            <span>{t('entry.helpRoadmap')}</span>
          </a>
          <a
            className="entry-help-popover__item"
            href={FEATURE_REQUESTS_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'submit_a_feature_request',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="sparkles" size={14} />
            </span>
            <span>{t('entry.helpSubmitFeature')}</span>
          </a>
          <a
            className="entry-help-popover__item"
            href={CHANGELOG_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'whats_new',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="bell" size={14} />
            </span>
            <span>{t('entry.helpWhatsNew')}</span>
          </a>
          <div className="entry-help-popover__divider" aria-hidden />
          <a
            className="entry-help-popover__item"
            href={BRIDGE_DOWNLOAD_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'download_pixflow_bridge',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="download" size={14} />
            </span>
            <span>{t('entry.helpDownloadBridge')}</span>
          </a>
          <div className="entry-help-popover__divider" aria-hidden />
          <a
            className="entry-help-popover__item"
            href={X_URL}
            {...ext}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <IconBrandX size={14} stroke={1.75} />
            </span>
            <span>{t('entry.followXLabel')}</span>
          </a>
          <a
            className="entry-help-popover__item"
            href={FACEBOOK_URL}
            {...ext}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <IconBrandFacebook size={14} stroke={1.75} />
            </span>
            <span>{t('entry.facebookGroupLabel')}</span>
          </a>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
