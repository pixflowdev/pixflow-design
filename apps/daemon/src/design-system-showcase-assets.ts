import path from 'node:path';

export function rewriteDesignSystemShowcaseAssetUrls(
  html: string,
  designSystemId: string,
  baseDir: string,
): string {
  if (!html) return html;
  return html
    .replace(/\b(src|href)=(["'])([^"']+)\2/gi, (match, attr: string, quote: string, raw: string) => {
      const rewritten = rewriteAssetUrl(raw, designSystemId, baseDir);
      return rewritten === raw ? match : `${attr}=${quote}${rewritten}${quote}`;
    })
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote: string, raw: string) => {
      const rewritten = rewriteAssetUrl(raw, designSystemId, baseDir);
      return rewritten === raw ? match : `url(${quote}${rewritten}${quote})`;
    });
}

function rewriteAssetUrl(rawUrl: string, designSystemId: string, baseDir: string): string {
  const value = rawUrl.trim();
  if (!value || value.startsWith('#') || value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return rawUrl;
  const match = /^([^?#]+)([?#].*)?$/.exec(value);
  if (!match?.[1]) return rawUrl;
  const relativePath = path.posix.normalize(path.posix.join(baseDir, match[1]));
  if (relativePath === '.' || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) return rawUrl;
  const staticUrl = `/api/design-systems/${encodeURIComponent(designSystemId)}/static?path=${encodeURIComponent(relativePath)}`;
  const suffix = match[2] ?? '';
  return suffix.startsWith('?') ? `${staticUrl}&${suffix.slice(1)}` : `${staticUrl}${suffix}`;
}
