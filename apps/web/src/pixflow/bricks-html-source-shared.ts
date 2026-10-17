/** Representation-neutral helpers shared by Build and legacy HTML workflows. */
export function composeHtmlWithSidecars(
  html: string,
  sidecars: { css: string; cssPath: string | null; js: string; jsPath: string | null },
  ownerAttribute: string,
): string {
  const sourceAttribute = (path: string) => `${ownerAttribute}="${escapeHtmlAttribute(path)}"`;
  const css = String(sidecars.css || '').trim();
  const js = String(sidecars.js || '').trim();
  const styleBlock = css ? `<style ${sourceAttribute(sidecars.cssPath || 'styles.css')}>\n${css}\n</style>` : '';
  const scriptBlock = js ? `<script ${sourceAttribute(sidecars.jsPath || 'script.js')}>\n${js}\n</script>` : '';
  const source = String(html || '').trim();
  if (!source) return '';

  if (!/<html\b/i.test(source)) {
    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      styleBlock,
      '</head>',
      '<body>',
      source,
      scriptBlock,
      '</body>',
      '</html>',
    ].filter(Boolean).join('\n');
  }

  let composed = source
    .replace(/<style\b[^>]*data-pixflow-(?:build-source|stage-a-source)[^>]*>[\s\S]*?<\/style>/i, '')
    .replace(/<script\b[^>]*data-pixflow-(?:build-source|stage-a-source)[^>]*>[\s\S]*?<\/script>/i, '');
  if (styleBlock) {
    composed = /<\/head\s*>/i.test(composed)
      ? composed.replace(/<\/head\s*>/i, `${styleBlock}\n</head>`)
      : `${styleBlock}\n${composed}`;
  }
  if (scriptBlock) {
    composed = /<\/body\s*>/i.test(composed)
      ? composed.replace(/<\/body\s*>/i, `${scriptBlock}\n</body>`)
      : `${composed}\n${scriptBlock}`;
  }
  return composed;
}

export function extractBuildSourceEnvelope(value: string): {
  html: string | null;
  css: string | null;
  js: string | null;
} {
  const files = { html: null as string | null, css: null as string | null, js: null as string | null };
  const pattern = /<pixflow-build-source-file\b([^>]*)>([\s\S]*?)<\/pixflow-build-source-file>/gi;
  let match: RegExpExecArray | null = pattern.exec(value);
  while (match) {
    const path = /\bpath\s*=\s*["']([^"']+)["']/i.exec(String(match[1] || ''))?.[1]
      ?.replace(/\\/g, '/').replace(/^\.\//, '');
    const content = decodeHtmlEntities(String(match[2] || '').trim());
    if (path === 'build-source/source/index.html') files.html = content;
    if (path === 'build-source/source/styles.css') files.css = content;
    if (path === 'build-source/source/script.js') files.js = content;
    match = pattern.exec(value);
  }
  // Hosted providers do not always preserve custom XML wrapper tags, but can
  // still return an unambiguous source artifact as one explicitly labelled
  // fence per canonical file kind. This is a bounded transport adapter: prose,
  // unlabelled fences and duplicate file candidates remain invalid.
  if (!files.html) files.html = extractSingleBuildSourceFence(value, 'html');
  if (!files.css) files.css = extractSingleBuildSourceFence(value, 'css');
  if (!files.js) files.js = extractSingleBuildSourceFence(value, 'js');
  return files;
}

function extractSingleBuildSourceFence(
  value: string,
  kind: 'html' | 'css' | 'js',
): string | null {
  const language = kind === 'js' ? '(?:javascript|js)' : kind;
  const pattern = new RegExp(
    '(?:^|\\r?\\n)```' + language + '[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```(?=\\r?\\n|$)',
    'gi',
  );
  const matches = [...String(value || '').matchAll(pattern)];
  if (matches.length !== 1) return null;
  const content = String(matches[0]?.[1] || '').trim();
  return content || null;
}

export type NormalizedRetainedBuildSource<T extends { html?: string }> = {
  source: T;
  normalizedHistoricalDocumentShell: boolean;
  reconciliation: HistoricalRetainedBuildSourceReconciliation | null;
};

export type HistoricalRetainedBuildSourceReconciliation = {
  code: 'historical_source_reconciliation_required';
  reasons: Array<
    | 'html_attributes'
    | 'head_attributes'
    | 'head_semantic_content'
    | 'body_attributes'
    | 'missing_body'
  >;
  message: string;
};

function historicalTagAttributes(value: string, tag: 'html' | 'head' | 'body'): string {
  return String(new RegExp(`<${tag}\\b([^>]*)>`, 'i').exec(value)?.[1] || '').trim();
}

function historicalHtmlAttributesAreInert(value: string): boolean {
  if (!value) return true;
  // The canonical host shell supplies exactly this language declaration.
  // Any other document-root attribute could affect selectors, direction,
  // accessibility, colour scheme or script behavior and is not discarded.
  return /^lang\s*=\s*(?:"en"|'en'|en)$/i.test(value);
}

function historicalTagAttributeEntries(tag: string): Array<[string, string]> | null {
  const source = String(tag || '')
    .replace(/^<meta\b/i, '')
    .replace(/\/?>\s*$/i, '');
  const entries: Array<[string, string]> = [];
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    const name = String(match[1] || '').toLowerCase();
    const value = String(match[2] ?? match[3] ?? match[4] ?? '');
    if (!name || !match[0]?.includes('=')) return null;
    entries.push([name, value]);
    match = pattern.exec(source);
  }
  return entries;
}

function historicalViewportMetaIsCanonical(tag: string): boolean {
  const entries = historicalTagAttributeEntries(tag);
  if (!entries || entries.length !== 2) return false;
  const attributes = new Map<string, string>();
  for (const [name, value] of entries) {
    if (attributes.has(name)) return false;
    attributes.set(name, value.trim());
  }
  if ([...attributes.keys()].some((name) => name !== 'name' && name !== 'content')) return false;
  if (String(attributes.get('name') || '').toLowerCase() !== 'viewport') return false;

  const directives = new Map<string, string>();
  for (const rawDirective of String(attributes.get('content') || '').split(',')) {
    const parts = rawDirective.split('=');
    if (parts.length !== 2) return false;
    const name = String(parts[0] || '').trim().toLowerCase();
    const value = String(parts[1] || '').trim().toLowerCase();
    if (!name || !value || directives.has(name)) return false;
    directives.set(name, value);
  }
  if (directives.size !== 2 || directives.get('width') !== 'device-width') return false;
  const initialScale = Number(directives.get('initial-scale'));
  return Number.isFinite(initialScale) && initialScale === 1;
}

function historicalMetaName(tag: string): string {
  const entries = historicalTagAttributeEntries(tag);
  if (!entries) return '';
  return String(entries.find(([name]) => name === 'name')?.[1] || '').trim().toLowerCase();
}

function historicalHeadContentIsInert(value: string): boolean {
  let remaining = String(value || '').replace(/<!--[\s\S]*?-->/g, ' ');
  remaining = remaining.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, ' ');
  remaining = remaining.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (/\bcharset\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(tag)) return ' ';
    if (historicalMetaName(tag) === 'viewport') {
      return historicalViewportMetaIsCanonical(tag) ? ' ' : tag;
    }
    return tag;
  });
  return remaining.trim().length === 0;
}

function historicalReconciliation(
  reasons: HistoricalRetainedBuildSourceReconciliation['reasons'],
): HistoricalRetainedBuildSourceReconciliation {
  return {
    code: 'historical_source_reconciliation_required',
    reasons,
    message: `Historical retained Build source contains document-shell semantics that cannot be migrated losslessly (${reasons.join(', ')}). Reconciliation is required before follow-up generation.`,
  };
}

/**
 * Historical ordinary-Build sources could persist a complete browser
 * document. Retained edits consume a canonical page-content fragment in
 * memory, but reading alone never mutates the original persisted file.
 */
export function normalizeHistoricalRetainedBuildSource<T extends { html?: string }>(
  source: T,
): NormalizedRetainedBuildSource<T> {
  const html = String(source.html || '');
  if (!/<!doctype\b|<html\b|<head\b|<body\b/i.test(html)) {
    return { source, normalizedHistoricalDocumentShell: false, reconciliation: null };
  }
  const reasons: HistoricalRetainedBuildSourceReconciliation['reasons'] = [];
  const htmlAttributes = historicalTagAttributes(html, 'html');
  const headAttributes = historicalTagAttributes(html, 'head');
  const bodyAttributes = historicalTagAttributes(html, 'body');
  if (!historicalHtmlAttributesAreInert(htmlAttributes)) reasons.push('html_attributes');
  if (headAttributes) reasons.push('head_attributes');
  if (bodyAttributes) reasons.push('body_attributes');
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(html)?.[1] || '';
  if (!historicalHeadContentIsInert(head)) reasons.push('head_semantic_content');
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html)?.[1];
  if (body === undefined) {
    reasons.push('missing_body');
  }
  if (reasons.length > 0) {
    return {
      source,
      normalizedHistoricalDocumentShell: false,
      reconciliation: historicalReconciliation([...new Set(reasons)]),
    };
  }
  return {
    source: { ...source, html: String(body).trim() },
    normalizedHistoricalDocumentShell: true,
    reconciliation: null,
  };
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
