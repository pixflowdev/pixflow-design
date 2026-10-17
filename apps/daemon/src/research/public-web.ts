import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import * as cheerio from 'cheerio';

const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 512_000;
const MAX_EXTRACTED_CHARS = 8_000;
const REQUEST_TIMEOUT_MS = 20_000;

export class UnsafeResearchUrlError extends Error {
  readonly code = 'UNSAFE_RESEARCH_URL';
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'UnsafeResearchUrlError';
  }
}

export async function assertPublicResearchUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeResearchUrlError('Research source URL is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UnsafeResearchUrlError('Research source URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw new UnsafeResearchUrlError('Research source URLs cannot contain credentials.');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new UnsafeResearchUrlError('Research source URL must use a public hostname.');
  }
  if (isIP(hostname)) {
    if (isUnsafeAddress(hostname)) throw new UnsafeResearchUrlError('Research source URL resolves to a private or reserved address.');
    return url;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeResearchUrlError('Research source hostname could not be resolved.');
  }
  if (!addresses.length || addresses.some(({ address }) => isUnsafeAddress(address))) {
    throw new UnsafeResearchUrlError('Research source URL resolves to a private or reserved address.');
  }
  return url;
}

export async function fetchPublicResearchDocument(input: {
  url: string;
  signal?: AbortSignal;
  requestInit?: Pick<RequestInit, 'dispatcher'>;
}): Promise<{ url: string; content: string; contentType: string; retrievedAt: number }> {
  let current = await assertPublicResearchUrl(input.url);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    let response: Response;
    try {
      response = await fetch(current, {
        ...input.requestInit,
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
          'user-agent': 'PixflowDesignResearch/1.1.5 (+https://pixflow.dev)',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS) {
        throw new UnsafeResearchUrlError('Research source exceeded the redirect limit.');
      }
      current = await assertPublicResearchUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Research source returned HTTP ${response.status}.`);
    const contentType = (response.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase();
    if (!['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown', 'application/json'].includes(contentType)) {
      throw new Error(`Research source content type ${contentType || 'unknown'} is not supported.`);
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('Research source is too large.');
    const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES);
    const content = ['text/plain', 'text/markdown', 'application/json'].includes(contentType)
      ? normalizePlainText(raw)
      : extractResearchText(raw);
    if (!content) throw new Error('Research source did not contain readable text.');
    return {
      url: current.toString(),
      content: content.slice(0, MAX_EXTRACTED_CHARS),
      contentType,
      retrievedAt: Date.now(),
    };
  }
  throw new UnsafeResearchUrlError('Research source could not be resolved safely.');
}

export function extractResearchText(html: string): string {
  const $ = cheerio.load(String(html || '').slice(0, MAX_RESPONSE_BYTES));
  $('script,style,noscript,svg,canvas,iframe,object,embed,form,nav,header,footer,aside').remove();
  const root = $('main').first().length ? $('main').first()
    : $('article').first().length ? $('article').first()
      : $('body').first();
  root.find('br').replaceWith('\n');
  root.find('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,table').append('\n');
  return normalizePlainText(root.text());
}

function normalizePlainText(value: string): string {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('Research source is too large.');
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function isUnsafeAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.includes(':')) {
    if (normalized === '::' || normalized === '::1' || normalized.startsWith('fe8')
      || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
      || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('ff')) return true;
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isUnsafeAddress(mapped) : false;
  }
  const parts = normalized.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}
