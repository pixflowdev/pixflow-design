import type { CSSProperties } from 'react';
import {
  AGENT_ICON_EXT,
  MONO_AGENT_ICONS,
  agentIconAssetUrl,
  cachedAgentIconAssetUrl,
  usesMonochromeProviderArtwork,
} from './agentIconAssets';
import { RemixIcon } from './RemixIcon';

interface Props {
  id: string;
  size?: number;
  className?: string;
}

// Agents that ship a bundled brand asset under `apps/web/public/agent-icons/`.
// SVG is preferred (resolution-independent, single file ≤ a few KB); PNG is
// the fallback for vendors that don't publish an SVG mark anywhere (Devin
// only ships a rasterised icon on devin.ai). New brand: drop the optimised
// file in that folder and add the id here.
// SVG marks that are single-color silhouettes (no baked brand colors).
// Rendered as a CSS-masked `<span>` so `background-color: currentColor`
// can paint them in whatever text color the surrounding theme resolves
// to — light text under dark theme, dark text under light theme. The
// SVG file itself uses an explicit dark fill (`#1c1b1a`, baked) instead
// of `currentColor`, so if anything outside this component ever loads
// the asset through `<img>` it still renders as a legible dark mark
// rather than collapsing to the SVG document's default black-on-…-black.
export function AgentIcon({ id, size = 36, className }: Props) {
  const cls = 'agent-icon' + (className ? ' ' + className : '');
  const assetUrl = agentIconAssetUrl(id);
  // Render only requested artwork. Native image/mask caching avoids a second
  // fetch and keeps unopened provider menus out of page startup.
  const resolvedAssetUrl = cachedAgentIconAssetUrl(id) || assetUrl || '';

  // Known API providers use their official bundled marks. Generic/custom API
  // connections use a neutral link rather than a misleading initial-letter tile.
  if (id === 'byok' || id === 'byok-api' || (id.endsWith('-api') && !AGENT_ICON_EXT[id])) {
    return <RemixIcon name="link" size={size} className={`${cls} agent-icon-byok`} />;
  }
  const ext = AGENT_ICON_EXT[id];
  if (ext) {
    // Pixflow-owned: the Bricks Agent panel renders on the WordPress builder
    // page, so absolute `/agent-icons/*` would point at the WP site root.
    // Use the localized plugin app asset base when present, while preserving
    // OD's original root-relative path inside the standalone app.
    const src = resolvedAssetUrl || assetUrl || '';
    // Directory artwork is a verified monochrome set, including transparent
    // PNGs. Theme masks keep its unchanged silhouettes visible in both themes.
    if (usesMonochromeProviderArtwork() || (ext === 'svg' && MONO_AGENT_ICONS.has(id))) {
      const style: CSSProperties = {
        width: size,
        height: size,
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
      };
      return (
        <span
          className={cls + ' agent-icon-mono'}
          style={style}
          aria-hidden="true"
        />
      );
    }
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cls}
        aria-hidden="true"
        draggable={false}
      />
    );
  }
  // Fallback for brands we don't ship artwork for. A neutral rounded
  // square with the initial letter — reads as "no official mark yet"
  // without inventing brand artwork we can't license.
  const initial = (id.match(/[a-z]/i)?.[0] ?? '?').toUpperCase();
  return (
    <span
      className={cls + ' agent-icon-fallback'}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
