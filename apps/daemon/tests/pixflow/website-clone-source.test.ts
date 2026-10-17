import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPixflowWebsiteCloneLocalResourcePath,
  classifyPixflowWebsiteCloneResource,
  rewritePixflowWebsiteCloneSourceReferences,
  sanitizePixflowWebsiteCloneCapturedHtml,
} from '../../src/pixflow/website-clone-source.js';
import { persistWebsiteCloneSourceMirror } from '../../src/routes/pixflow-visual-capture.js';

describe('Pixflow Website Clone deterministic source acquisition', () => {
  it('uses a WordPress-stable canonical name for captured resources', () => {
    const path = buildPixflowWebsiteCloneLocalResourcePath(
      'https://assets.publishing.service.gov.uk/static/_homepage-d7f529e537224a080ae39bac88764b8acfbc49e944ae.css',
      'text/css',
      'stylesheet',
    );

    expect(path).toMatch(/^website-clone\/assets\/homepage-/);
    expect(path).not.toContain('/_homepage-');
  });

  it('keeps visible source dependencies while excluding telemetry and unrelated widgets', () => {
    expect(classifyPixflowWebsiteCloneResource({
      url: 'https://example.com/assets/site.css',
      pageUrl: 'https://example.com/',
      resourceType: 'stylesheet',
      contentType: 'text/css',
    })).toEqual(expect.objectContaining({ retain: true, role: 'stylesheet' }));
    expect(classifyPixflowWebsiteCloneResource({
      url: 'https://cdn.example.net/hero.webp',
      pageUrl: 'https://example.com/',
      resourceType: 'image',
      contentType: 'image/webp',
    })).toEqual(expect.objectContaining({ retain: true, role: 'image' }));
    expect(classifyPixflowWebsiteCloneResource({
      url: 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
      pageUrl: 'https://example.com/',
      resourceType: 'script',
      contentType: 'application/javascript',
    })).toEqual(expect.objectContaining({ retain: false, reason: expect.stringContaining('telemetry') }));
    expect(classifyPixflowWebsiteCloneResource({
      url: 'https://widget.intercom.io/widget/test',
      pageUrl: 'https://example.com/',
      resourceType: 'script',
      contentType: 'application/javascript',
    })).toEqual(expect.objectContaining({ retain: false, reason: expect.stringContaining('widget') }));
    expect(classifyPixflowWebsiteCloneResource({
      url: 'https://example.com/~flock.js',
      pageUrl: 'https://example.com/',
      resourceType: 'script',
      contentType: 'application/javascript',
    })).toEqual(expect.objectContaining({ retain: false, reason: expect.stringContaining('telemetry') }));
  });

  it('sanitises captured document execution without changing visible page structure', () => {
    const html = `<!doctype html><html><head>
      <script src="https://www.googletagmanager.com/gtm.js"></script>
      <script src="/assets/app.js"></script>
      <script>window.dataLayer = window.dataLayer || []; gtag('config', 'G-TEST')</script>
    </head><body><main><h1>Alexium</h1><img src="/hero.jpg"></main>
      <form action="https://example.com/private-submit"><button>Send</button></form>
      <script>navigator.serviceWorker.register('/sw.js')</script>
    </body></html>`;

    const result = sanitizePixflowWebsiteCloneCapturedHtml(html, 'https://example.com/');
    expect(result.html).toContain('<main><h1>Alexium</h1><img src="/hero.jpg"></main>');
    expect(result.html).not.toContain('googletagmanager');
    expect(result.html).not.toContain('serviceWorker.register');
    expect(result.html).not.toContain('dataLayer');
    expect(result.html).not.toContain('private-submit');
    expect(result.exclusions.map((entry) => entry.reason)).toEqual(expect.arrayContaining([
      expect.stringContaining('telemetry'),
      expect.stringContaining('service worker'),
      expect.stringContaining('form submission'),
    ]));
  });

  it('rewrites captured HTML and CSS to the same project-local resource graph', () => {
    const replacements = new Map([
      ['https://example.com/assets/site.css', 'website-clone/assets/site-a1.css'],
      ['https://example.com/images/hero.webp', 'website-clone/assets/hero-b2.webp'],
    ]);
    const html = '<link href="/assets/site.css"><img src="images/hero.webp" srcset="images/hero.webp 1x, /images/hero@2x.webp 2x"><img src="/images/uncaptured.webp">';
    const css = '.hero{background-image:url("https://example.com/images/hero.webp")}';

    const rewrittenHtml = rewritePixflowWebsiteCloneSourceReferences(html, replacements, 'https://example.com/');
    expect(rewrittenHtml).toContain('website-clone/assets/site-a1.css');
    expect(rewrittenHtml).toContain('website-clone/assets/hero-b2.webp 1x');
    expect(rewrittenHtml).toContain('https://example.com/images/hero@2x.webp 2x');
    expect(rewrittenHtml).toContain('https://example.com/images/uncaptured.webp');
    expect(rewritePixflowWebsiteCloneSourceReferences(css, replacements)).toContain('website-clone/assets/hero-b2.webp');
  });

  it('mirrors the canonical bundle into the daemon project without flattening asset paths', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pixflow-website-clone-mirror-'));
    await persistWebsiteCloneSourceMirror(dataDir, 'project-123', {
      html: '<!doctype html><html><body><img src="assets/hero.png"></body></html>',
      canonicalPath: 'website-clone/index.html',
      resources: [{ path: 'website-clone/assets/hero.png', base64: Buffer.from('image-bytes').toString('base64') }],
    });

    await expect(readFile(path.join(dataDir, 'projects', 'project-123', 'website-clone', 'index.html'), 'utf8'))
      .resolves.toContain('<!doctype html>');
    await expect(readFile(path.join(dataDir, 'projects', 'project-123', 'website-clone', 'assets', 'hero.png'), 'utf8'))
      .resolves.toBe('image-bytes');
    await expect(persistWebsiteCloneSourceMirror(dataDir, '../escape', {
      html: '<!doctype html>',
      canonicalPath: 'website-clone/index.html',
      resources: [],
    })).rejects.toThrow(/safe project identifier/i);
  });
});
