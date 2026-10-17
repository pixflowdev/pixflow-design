import { extractPublicSourceUrl, normalizePublicSourceUrl } from './public-source-url';

export function extractPublicWebsiteCloneUrl(value: string): string | null {
  return extractPublicSourceUrl(value);
}

export function extractWebsiteCloneResumeProjectId(value: string): string | null {
  const match = String(value || '').match(
    /\b(?:resume|continue|retry|rerun|re-run|recover)\b[\s\S]{0,80}?\bproject(?:\s+id)?\b\s*[:#-]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i,
  );
  return match?.[1]?.toLowerCase() || null;
}

export function normalizePublicWebsiteCloneUrl(value: string): string | null {
  return normalizePublicSourceUrl(value);
}

export function resolvePublicWebsiteCloneTarget(
  configuredTarget: string,
  composerPrompt: string,
): string | null {
  return normalizePublicWebsiteCloneUrl(configuredTarget)
    || extractPublicWebsiteCloneUrl(composerPrompt);
}

export function buildWebsiteCloneBricksHomeForward({
  locationHref,
  pluginId,
  projectIntent,
  configuredTarget,
  prompt,
}: {
  locationHref: string;
  pluginId?: string | null;
  projectIntent?: string | null;
  configuredTarget: string;
  prompt: string;
}): {
  source: 'pixflow-design';
  type: 'pixflow-design:send-bricks-agent-prompt';
  reason: 'home-workspace-website-clone';
  prompt: string;
  patch: { promptSkillIds: ['website-clone', 'web-clone', 'prototype-bricks'] };
} | null {
  let insideBricksBuilder = false;
  try {
    insideBricksBuilder = new URL(locationHref).searchParams.get('bricks') === 'run';
  } catch {
    insideBricksBuilder = false;
  }
  if (!insideBricksBuilder) return null;
  if (pluginId !== 'example-web-clone' && projectIntent !== 'web-clone') return null;
  const target = resolvePublicWebsiteCloneTarget(configuredTarget, prompt);
  if (!target) return null;
  return {
    source: 'pixflow-design',
    type: 'pixflow-design:send-bricks-agent-prompt',
    reason: 'home-workspace-website-clone',
    prompt: `@Website Clone ${target}`,
    patch: { promptSkillIds: ['website-clone', 'web-clone', 'prototype-bricks'] },
  };
}

export function websiteCloneBricksPrompt(prompt: string, targetUrl: string): string {
  const resumeProjectId = extractWebsiteCloneResumeProjectId(prompt);
  const cleanPrompt = String(prompt || '')
    .replace(/@Website Clone/gi, '')
    .replace(/\/website-clone/gi, '')
    .trim();
  return [
    `Clone this public website into the current Bricks page: ${targetUrl}`,
    cleanPrompt ? `User requirements: ${cleanPrompt}` : '',
    '',
    resumeProjectId
      ? `Resume the existing local Website Clone project ${resumeProjectId}. Reuse the existing NOTES.md, RECON, harvested assets, and Stage A source. Do not run the initializer again or replace complete evidence; refresh only evidence that is missing or invalid for this same target URL.`
      : 'Use source-first reconnaissance before generation: inspect page structure, same-site routes, assets, fonts, responsive behavior, and meaningful interactions. Source-discovered user-visible motion and interaction count as explicit requirements even when the user does not name an animation engine. Preserve evidence and known differences in NOTES.md. Start a fresh NOTES.md for this clone run (do not append to another target\'s notes) and include exactly one `Inspected URL:` line for the primary target.',
    'Use the staged web-clone skill as an executable workflow, not only as reading material. Run its in-place initializer, browser reconnaissance, asset-harvest, route, interaction, and source-map probes that apply to the detected site. The host supplies a bundled Playwright runtime through OD_PLAYWRIGHT_PATH; do not install another copy unless the skill loader explicitly reports that none is available. Treat RECON/original-recon.json, its desktop/tablet/mobile screenshots, asset-manifest.json, route map, and interaction evidence as the measured baseline. Do not begin authored Stage A markup until those artifacts exist, and do not substitute visual memory for their computed values.',
    'Treat observed source values as authoritative. Reproduce visible copy, section order, geometry, spacing, typography, colors, media, states, and responsive behavior as exactly as public evidence allows. Do not polish, modernize, embellish, simplify, or add design-system defaults merely because the source is sparse or unconventional.',
    'Keep reconnaissance, provenance, exclusions, and known-difference copy in NOTES.md and reports only. Do not add visible audit labels, source notes, provenance panels, or invented marketing copy unless that content is visibly present on the source or the user explicitly requests it.',
    'Do not copy analytics, advertising, tracking pixels, consent telemetry, service workers, or unrelated third-party scripts. Preserve only assets and runtime behavior required for the visual/interactive reproduction.',
    'Write an interaction inventory in NOTES.md. For every observed entrance, scroll sequence, pin, smooth-scroll effect, Lottie/vector animation, slider, menu, hover, cursor behavior, video state, or meaningful transition, record the source evidence and a disposition: native Bricks, locally reimplemented, preserved public asset, or excluded because it is not user-visible. Do not silently staticize source behavior.',
    'If the target is login-walled, bot-protected, inaccessible, or depends on private server behavior, document the limitation honestly and clone only the observable public surface.',
    'Build a source-faithful semantic Prototype HTML baseline first. Keep it Bricks-friendly without changing the rendered result: clear section/container/component boundaries, stable BEM classes, shallow selectors, native text/media/form semantics, and flex-first layout unless a real two-dimensional layout requires native grid.',
    'Preserve discovered font files in the evidence/assets inventory, but do not self-host them from Stage A CSS: never emit @font-face, @import, Google Fonts links, or remote font stylesheets. Use the measured concrete font-family name and weight tokens in CSS so the Bricks font-system preflight can install/map the family before insertion.',
    'The Stage A source must include at least one deliberate responsive @media rule, even for a sparse single-section source; use it to preserve the observed geometry at a real tablet or mobile breakpoint rather than relying only on clamp().',
    'Run deterministic Stage A conversion and insert the verified baseline into the live Bricks canvas. Finish the run after that insert even when parity diagnostics contain findings. Offer Clean up and refine the build as an optional next action; only if the user chooses it may Stage B repair the visible baseline using native controls, global classes and route tokens before _cssCustom.',
  ].filter(Boolean).join('\n');
}
