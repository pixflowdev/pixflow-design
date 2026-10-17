const VOID_HTML_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

const NON_CONTENT_ELEMENTS = new Set(['head', 'noscript', 'script', 'style', 'template']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '©',
  emsp: ' ',
  ensp: ' ',
  gt: '>',
  hellip: '…',
  lt: '<',
  mdash: '—',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  reg: '®',
  thinsp: ' ',
};

type OpenElement = {
  name: string;
  hidden: boolean;
};

export type BuildInBricksVisibleTextReplacement = {
  html: string;
  occurrenceCount: number;
};

function decodeHtmlTextEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z][a-z\d]+));/gi, (entity, decimal, hexadecimal, named) => {
    if (decimal) {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    if (hexadecimal) {
      const codePoint = Number.parseInt(hexadecimal, 16);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return NAMED_ENTITIES[String(named || '').toLowerCase()] ?? entity;
  });
}

function findTagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index] || '';
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index;
  }
  return source.length - 1;
}

function tagAttributesAreHidden(tag: string): boolean {
  const attributes = tag.replace(/^<\s*[^\s/>]+/i, '').replace(/\/?>\s*$/, '');
  if (/(?:^|\s)hidden(?:\s|=|$)/i.test(attributes)) return true;
  if (/\baria-hidden\s*=\s*(?:"true"|'true'|true)(?:\s|$)/i.test(attributes)) return true;
  const style = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
  const inlineCss = String(style?.[1] ?? style?.[2] ?? '');
  return /(?:^|;)\s*display\s*:\s*none\b/i.test(inlineCss)
    || /(?:^|;)\s*visibility\s*:\s*hidden\b/i.test(inlineCss);
}

function normalizeVisibleText(value: string): string {
  return decodeHtmlTextEntities(value)
    .normalize('NFKC')
    .replace(/[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Materialize one exact, selected-agent-authored visible-text replacement
 * against authored HTML. Source formatting whitespace is not semantic text,
 * so a sentence wrapped across lines still matches the factual Builder text.
 * The replacement remains fail-closed when more than one visible text node
 * has the same normalized content or when inline structure splits the selected
 * content across nodes.
 */
export function materializeBuildInBricksVisibleTextReplacement(
  source: string,
  currentText: string,
  replacementText: string,
  options: { sourcePath?: string | null } = {},
): BuildInBricksVisibleTextReplacement {
  const html = String(source || '');
  const expectedCurrentText = normalizeVisibleText(currentText);
  if (!html || !expectedCurrentText) return { html, occurrenceCount: 0 };

  const stack: OpenElement[] = [];
  const matches: Array<{ start: number; end: number; raw: string }> = [];
  let index = 0;
  while (index < html.length) {
    if (html.startsWith('<!--', index)) {
      const commentEnd = html.indexOf('-->', index + 4);
      index = commentEnd >= 0 ? commentEnd + 3 : html.length;
      continue;
    }
    if (html[index] !== '<') {
      const textEnd = html.indexOf('<', index);
      const end = textEnd >= 0 ? textEnd : html.length;
      const raw = html.slice(index, end);
      if (!stack.some((element) => element.hidden) && normalizeVisibleText(raw) === expectedCurrentText) {
        matches.push({ start: index, end, raw });
      }
      index = end;
      continue;
    }

    const tagEnd = findTagEnd(html, index);
    const tag = html.slice(index, tagEnd + 1);
    const closing = /^<\s*\//.test(tag);
    const name = /^<\s*\/?\s*([a-z][a-z\d:-]*)/i.exec(tag)?.[1]?.toLowerCase() || '';
    index = tagEnd + 1;
    if (!name) continue;
    if (closing) {
      const matchingIndex = stack.map((element) => element.name).lastIndexOf(name);
      if (matchingIndex >= 0) stack.splice(matchingIndex);
      continue;
    }
    const hidden = NON_CONTENT_ELEMENTS.has(name)
      || stack.some((element) => element.hidden)
      || tagAttributesAreHidden(tag);
    const selfClosing = VOID_HTML_ELEMENTS.has(name) || /\/\s*>$/.test(tag);
    if (!selfClosing) stack.push({ name, hidden });
    if (NON_CONTENT_ELEMENTS.has(name)) {
      const closingStart = html.toLowerCase().indexOf(`</${name}`, index);
      index = closingStart < 0 ? html.length : closingStart;
    }
  }

  let selectedMatchIndex = matches.length === 1 ? 0 : -1;
  const sourcePath = String(options.sourcePath || '').trim();
  if (sourcePath) {
    selectedMatchIndex = -1;
    if (typeof DOMParser !== 'undefined') {
      try {
        const document = new DOMParser().parseFromString(html, 'text/html');
        const target = document.body.querySelector(sourcePath);
        if (target) {
          const matchingTextNodes: Text[] = [];
          const walker = document.createTreeWalker(document.body, 4);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeType !== 3) continue;
            const textNode = node as Text;
            const parent = textNode.parentElement;
            if (!parent || parent.closest('script, style, template, noscript, [hidden], [aria-hidden="true"]')) continue;
            const inlineStyle = String(parent.getAttribute('style') || '');
            if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(inlineStyle)) continue;
            if (normalizeVisibleText(textNode.data) === expectedCurrentText) matchingTextNodes.push(textNode);
          }
          const targetMatches = matchingTextNodes.filter((node) => target.contains(node));
          if (targetMatches.length === 1) selectedMatchIndex = matchingTextNodes.indexOf(targetMatches[0]!);
        }
      } catch {
        selectedMatchIndex = -1;
      }
    }
  }
  if (selectedMatchIndex < 0 || selectedMatchIndex >= matches.length) {
    return { html, occurrenceCount: sourcePath ? 0 : matches.length };
  }
  const match = matches[selectedMatchIndex]!;
  const leadingWhitespace = match.raw.match(/^\s*/u)?.[0] || '';
  const trailingWhitespace = match.raw.match(/\s*$/u)?.[0] || '';
  return {
    html: `${html.slice(0, match.start)}${leadingWhitespace}${replacementText}${trailingWhitespace}${html.slice(match.end)}`,
    occurrenceCount: 1,
  };
}

/**
 * Extract deterministic user-facing text from authored HTML without relying on
 * browser layout or implementation identifiers. This intentionally handles
 * only visibility facts expressed by HTML/ARIA/inline CSS; stylesheet-driven
 * visibility remains a rendered-evidence concern.
 */
export function extractBuildInBricksVisibleText(source: string): string {
  const html = String(source || '');
  const output: string[] = [];
  const stack: OpenElement[] = [];
  let index = 0;

  while (index < html.length) {
    if (html.startsWith('<!--', index)) {
      const commentEnd = html.indexOf('-->', index + 4);
      index = commentEnd >= 0 ? commentEnd + 3 : html.length;
      continue;
    }

    if (html[index] !== '<') {
      const textEnd = html.indexOf('<', index);
      const end = textEnd >= 0 ? textEnd : html.length;
      if (!stack.some((element) => element.hidden)) output.push(html.slice(index, end));
      index = end;
      continue;
    }

    const tagEnd = findTagEnd(html, index);
    const tag = html.slice(index, tagEnd + 1);
    const closing = /^<\s*\//.test(tag);
    const name = /^<\s*\/?\s*([a-z][a-z\d:-]*)/i.exec(tag)?.[1]?.toLowerCase() || '';
    index = tagEnd + 1;
    if (!name) continue;

    if (closing) {
      const matchingIndex = stack.map((element) => element.name).lastIndexOf(name);
      if (matchingIndex >= 0) stack.splice(matchingIndex);
      continue;
    }

    const hidden = NON_CONTENT_ELEMENTS.has(name)
      || stack.some((element) => element.hidden)
      || tagAttributesAreHidden(tag);
    const selfClosing = VOID_HTML_ELEMENTS.has(name) || /\/\s*>$/.test(tag);
    if (!selfClosing) stack.push({ name, hidden });

    if (NON_CONTENT_ELEMENTS.has(name)) {
      const closingStart = html.toLowerCase().indexOf(`</${name}`, index);
      index = closingStart < 0 ? html.length : closingStart;
    }
  }

  return normalizeVisibleText(output.join(' '));
}

export function visibleTextContainsLiteralPhrase(visibleText: string, phrase: string): boolean {
  const normalizedText = normalizeVisibleText(visibleText).toLocaleLowerCase('en-US');
  const normalizedPhrase = normalizeVisibleText(phrase).toLocaleLowerCase('en-US');
  if (!normalizedText || !normalizedPhrase) return false;
  const phrasePattern = normalizedPhrase
    .split(' ')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${phrasePattern}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(normalizedText);
}
