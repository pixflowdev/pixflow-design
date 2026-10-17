
import { useT as usePixflowUiTranslation } from '../../../i18n';
// Sandboxed HTML preview surface — used for `examples/*` plugins
// and any scenario plugin that ships a runnable `od.preview.entry`.
//
// The iframe is mounted only after the card scrolls into view. We
// further guard the iframe behind a one-shot pointer hover (`armed`)
// for tiles that contain heavy interactive content; once armed it
// stays mounted so cursor flicker doesn't tear down the preview.
//
// The iframe is rendered tiny inside the card and visually scaled
// up via CSS `transform: scale(...)` so a full-size HTML doc reads
// as a thumbnail without needing a server-rendered screenshot. The
// daemon already enforces a strict CSP on the asset response.
//
// Reachability probe
// ------------------
// Some bundled plugins declare an `od.preview.entry` that doesn't
// resolve on disk (the daemon falls back to assets/*.html, but if
// nothing in the curated list exists the route 404s and the iframe
// renders the JSON error envelope as a blank white tile). To avoid
// blank cards in the home gallery, we issue a single HEAD probe
// before mounting the iframe and swap in a typographic fallback
// when the URL is unreachable. Results are cached per-URL so
// scrolling doesn't re-probe the same plugin.

import { useEffect, useMemo, useState } from 'react';
import { fetchPluginExampleHtml, fetchPluginPreviewHtml } from '../../../providers/registry';
import { buildSrcdoc } from '../../../runtime/srcdoc';
import type { HtmlPreviewSpec } from '../preview';

interface Props {
  preview: HtmlPreviewSpec;
  pluginId: string;
  pluginTitle: string;
  inView: boolean;
  // Gallery layout: render the live iframe as soon as the tile is in
  // view (no hover/linger gate) and drop the built-in dot+url chrome
  // strip, since the gallery card provides its own top bar.
  eager?: boolean;
  // Keep workspace-open cheap: gallery tiles can show their frame/skeleton
  // immediately but only fetch live HTML once the user hovers or opens detail.
  deferUntilHover?: boolean;
  // Delay automatic loads so fast scrolling through the gallery does not start
  // a burst of plugin preview documents. Hover still loads immediately.
  autoLoadDelayMs?: number;
}

type ProbeState = 'idle' | 'probing' | 'ok' | 'unreachable';

const probeCache = new Map<string, 'ok' | 'unreachable'>();
const htmlCache = new Map<string, string>();
const inflight = new Map<string, Promise<'ok' | 'unreachable'>>();
const MAX_CONCURRENT_HTML_PREVIEWS = 1;
let activePreviewFetches = 0;
const queuedPreviewFetches: Array<() => void> = [];

function runNextPreviewFetch(): void {
  if (activePreviewFetches >= MAX_CONCURRENT_HTML_PREVIEWS) return;
  const next = queuedPreviewFetches.shift();
  if (!next) return;
  activePreviewFetches += 1;
  next();
}

async function withPreviewFetchSlot<T>(task: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    queuedPreviewFetches.push(resolve);
    runNextPreviewFetch();
  });

  try {
    return await task();
  } finally {
    activePreviewFetches = Math.max(0, activePreviewFetches - 1);
    runNextPreviewFetch();
  }
}

function isStaticPreviewUrl(url: string): boolean {
  return !/\/api\/plugins\//.test(url);
}

async function probe(preview: HtmlPreviewSpec, pluginId: string): Promise<'ok' | 'unreachable'> {
  const url = preview.src;
  if (isStaticPreviewUrl(url)) {
    probeCache.set(url, 'ok');
    return 'ok';
  }
  const cached = probeCache.get(url);
  if (cached) return cached;
  if (htmlCache.has(url)) return 'ok';
  const existing = inflight.get(url);
  if (existing) return existing;
  const run = withPreviewFetchSlot(async () => {
    try {
      // Pixflow-owned: the WordPress builder embeds Pixflow Design inside a
      // bridge iframe, so URL-loaded plugin thumbnails can violate the daemon
      // preview CSP (frame-ancestors 'self'). Fetch HTML and render via srcDoc
      // like the plugin modal instead of adding a second URL iframe.
      const result = await fetchPreviewHtml(preview, pluginId);
      if ('html' in result) {
        htmlCache.set(url, result.html);
        return 'ok' as const;
      }
      return 'unreachable' as const;
    } catch {
      return 'unreachable' as const;
    }
  });
  inflight.set(url, run);
  const result = await run;
  probeCache.set(url, result);
  inflight.delete(url);
  return result;
}

async function fetchPreviewHtml(
  preview: HtmlPreviewSpec,
  pluginId: string,
): Promise<{ html: string } | { unavailable: true; kind: 'html' } | { error: string }> {
  if (isStaticPreviewUrl(preview.src)) {
    try {
      const response = await fetch(preview.src, {
        cache: 'force-cache',
        credentials: 'same-origin',
        headers: { Accept: 'text/html,text/plain' },
      });
      if (!response.ok) {
        if (response.status === 404) return { unavailable: true, kind: 'html' };
        return { error: `HTTP ${response.status}` };
      }
      return { html: await response.text() };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'network error';
      return { error: message };
    }
  }

  return preview.source === 'example' && preview.exampleStem
    ? normalizeHtmlPreviewResult(await fetchPluginExampleHtml(pluginId, preview.exampleStem))
    : normalizeHtmlPreviewResult(await fetchPluginPreviewHtml(pluginId));
}

function normalizeHtmlPreviewResult(
  result: Awaited<ReturnType<typeof fetchPluginExampleHtml>>,
): { html: string } | { unavailable: true; kind: 'html' } | { error: string } {
  if ('html' in result) return result;
  if ('error' in result) return result;
  return { unavailable: true, kind: 'html' };
}

export function HtmlSurface({
  preview,
  pluginId,
  pluginTitle,
  inView,
  eager = false,
  deferUntilHover = false,
  autoLoadDelayMs,
}: Props) {
  const translateUi = usePixflowUiTranslation();
  const staticPreview = isStaticPreviewUrl(preview.src);
  const [armed, setArmed] = useState(false);
  const [shouldProbe, setShouldProbe] = useState(eager);
  const [probeState, setProbeState] = useState<ProbeState>(() => {
    if (staticPreview) return 'ok';
    const cached = probeCache.get(preview.src);
    return cached ?? 'idle';
  });

  useEffect(() => {
    setArmed(false);
    setShouldProbe(eager);
    if (staticPreview) {
      setProbeState('ok');
      return;
    }
    const cached = probeCache.get(preview.src);
    setProbeState(cached ?? 'idle');
  }, [preview.src, eager, staticPreview]);

  useEffect(() => {
    if (staticPreview) {
      setShouldProbe(true);
      return;
    }
    if (eager) {
      setShouldProbe(true);
      return;
    }
    if (deferUntilHover) return;
    if (!inView) return;
    if (probeCache.has(preview.src)) {
      setShouldProbe(true);
      return;
    }
    const id = window.setTimeout(() => setShouldProbe(true), eager ? 60 : autoLoadDelayMs ?? 520);
    return () => window.clearTimeout(id);
  }, [inView, preview.src, eager, staticPreview, deferUntilHover, autoLoadDelayMs]);

  // Kick off the probe on first in-view. We deliberately keep this
  // effect's deps narrow (just `inView` + `preview.src`) so the
  // subsequent `setProbeState(result)` does not cancel the in-flight
  // promise via a re-run cleanup. The module-level cache also makes
  // the probe a no-op if another tile already resolved the same URL.
  useEffect(() => {
    if (staticPreview) {
      setProbeState('ok');
      return;
    }
    if (!shouldProbe) return;
    if (probeCache.has(preview.src)) {
      setProbeState(probeCache.get(preview.src)!);
      return;
    }
    let cancelled = false;
    setProbeState('probing');
    probe(preview, pluginId).then((result) => {
      if (!cancelled) setProbeState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [preview, pluginId, shouldProbe, staticPreview]);

  // Arm the iframe after a short visibility window so the user can
  // scroll past tiles without paying for an iframe per tile, but tiles
  // that linger get the live preview without requiring hover.
  useEffect(() => {
    if (probeState !== 'ok') return;
    if (deferUntilHover) {
      if (shouldProbe) setArmed(true);
      return;
    }
    if (eager) {
      if (inView) setArmed(true);
      return;
    }
    const id = window.setTimeout(() => {
      if (inView) setArmed(true);
    }, 720);
    return () => window.clearTimeout(id);
  }, [inView, probeState, eager, deferUntilHover, shouldProbe]);

  const previewHtml = !staticPreview && probeState === 'ok' ? htmlCache.get(preview.src) ?? null : null;
  const srcDoc = useMemo(() => (previewHtml ? buildSrcdoc(previewHtml) : null), [previewHtml]);

  if (probeState === 'unreachable') {
    return (
      <UnreachableFallback
        pluginId={pluginId}
        pluginTitle={pluginTitle}
        preview={preview}
        eager={eager}
      />
    );
  }

  return (
    <div
      className="plugins-home__html"
      data-plugin-id={pluginId}
      onMouseEnter={() => {
        setShouldProbe(true);
        if (probeState === 'ok') setArmed(true);
      }}
    >
      <div className="plugins-home__html-frame">
        {armed ? (
          <iframe
            title={translateUi("ui.pluginDetailView.preview", { value1: pluginTitle })}
            src={staticPreview ? preview.src : undefined}
            srcDoc={staticPreview ? undefined : srcDoc ?? undefined}
            sandbox="allow-scripts"
            loading="lazy"
            tabIndex={-1}
            aria-hidden
            className="plugins-home__html-iframe"
          />
        ) : (
          <div
            className={`plugins-home__html-skeleton${inView ? ' is-active' : ''}`}
            aria-hidden
          >
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      {eager ? null : (
        <div className="plugins-home__html-chrome" aria-hidden>
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-url">{preview.label}</span>
        </div>
      )}
    </div>
  );
}

interface UnreachableFallbackProps {
  pluginId: string;
  pluginTitle: string;
  preview: HtmlPreviewSpec;
  eager?: boolean;
}

// Stable colour from the plugin id so adjacent fallback tiles stay
// visually distinct without flickering on re-renders.
function hueFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function UnreachableFallback({ pluginId, pluginTitle, preview, eager = false }: UnreachableFallbackProps) {
  const trimmed = pluginTitle.trim();
  const cp = trimmed.codePointAt(0) ?? 0x2022;
  const glyph = cp === 0x2022 ? '·' : String.fromCodePoint(cp).toUpperCase();
  const hue = hueFor(pluginId);
  const style = {
    background: `linear-gradient(135deg, hsl(${hue} 60% 18%), hsl(${(hue + 24) % 360} 50% 9%))`,
  };
  return (
    <div
      className="plugins-home__html plugins-home__html--fallback"
      data-plugin-id={pluginId}
      data-testid="plugins-home-html-fallback"
      style={style}
      aria-hidden
    >
      <div className="plugins-home__html-fallback-glyph">{glyph}</div>
      {eager ? null : (
        <div className="plugins-home__html-chrome">
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-url">{preview.label}</span>
        </div>
      )}
    </div>
  );
}

// Test seam — exposed so unit tests can reset the probe cache between
// scenarios without leaking state across files.
export function __resetHtmlSurfaceProbeCacheForTests(): void {
  probeCache.clear();
  htmlCache.clear();
  inflight.clear();
}
