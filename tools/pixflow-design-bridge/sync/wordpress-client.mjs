import fs from 'node:fs/promises';
import path from 'node:path';

export class WordPressProjectClient {
  constructor({ restBaseUrl, nonce, token, fetchImpl = fetch }) {
    this.restBaseUrl = String(restBaseUrl || '').replace(/\/+$/, '');
    this.nonce = String(nonce || '');
    this.token = String(token || '');
    this.fetchImpl = fetchImpl;

    if (!this.restBaseUrl) {
      throw new Error('WordPress REST base URL is required.');
    }
  }

  async listProjects(params = {}) {
    return this.requestJson(this.url('projects', params), { method: 'GET' });
  }

  async createProject(payload) {
    return this.requestJson(this.url('projects'), {
      method: 'POST',
      body: JSON.stringify(payload || {}),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async uploadVersion(uuid, {
    archivePath,
    manifest,
    previewPath = '',
    summary = '',
    metadata = {},
    versionNumber = null,
    expectedVersionNumber = null,
    expectedFileHash = '',
    lockSessionId = '',
    saveAsNewVersion = false,
  }) {
    const form = new FormData();
    const archiveBuffer = await fs.readFile(archivePath);
    form.set('archive', new Blob([archiveBuffer], { type: 'application/zip' }), path.basename(archivePath));
    form.set('manifest', JSON.stringify(manifest || {}));
    form.set('summary', summary);
    form.set('metadata', JSON.stringify(metadata || {}));
    if (versionNumber !== null) form.set('versionNumber', String(versionNumber));
    if (expectedVersionNumber !== null) form.set('expectedVersionNumber', String(expectedVersionNumber));
    if (expectedFileHash) form.set('expectedFileHash', String(expectedFileHash));
    if (lockSessionId) form.set('lockSessionId', String(lockSessionId));
    if (saveAsNewVersion) form.set('saveAsNewVersion', '1');

    if (previewPath) {
      const previewBuffer = await fs.readFile(previewPath).catch(() => null);
      if (previewBuffer) {
        const type = contentTypeFor(previewPath);
        form.set('preview', new Blob([previewBuffer], { type }), path.basename(previewPath));
      }
    }

    return this.requestJson(this.url(`projects/${encodeURIComponent(uuid)}/versions`), {
      method: 'POST',
      body: form,
    });
  }

  async downloadVersion(uuid, versionNumber, destination) {
    const response = await this.request(this.url(`projects/${encodeURIComponent(uuid)}/versions/${Number(versionNumber || 0)}/download`), {
      method: 'GET',
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);

    return { path: destination, bytes: buffer.length };
  }

  async requestJson(url, init = {}) {
    const response = await this.fetchWithHeaders(url, init);
    const text = await response.text();
    const decoded = text ? JSON.parse(text) : {};
    if (!response.ok || decoded?.ok === false) {
      throw new WordPressProjectClientError(
        decoded?.message || `${url} returned HTTP ${response.status}`,
        {
          status: response.status,
          code: decoded?.code || '',
          body: decoded,
        },
      );
    }
    return decoded;
  }

  async request(url, init = {}) {
    const response = await this.fetchWithHeaders(url, init);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new WordPressProjectClientError(text || `${url} returned HTTP ${response.status}`, {
        status: response.status,
        code: '',
        body: text,
      });
    }
    return response;
  }

  async fetchWithHeaders(url, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('Accept', headers.get('Accept') || 'application/json');
    if (this.nonce) headers.set('X-WP-Nonce', this.nonce);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);

    return await this.fetchImpl(url, { ...init, headers });
  }

  url(pathname, params = {}) {
    const url = new URL(`${this.restBaseUrl}/${String(pathname).replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

export class WordPressProjectClientError extends Error {
  constructor(message, { status = 0, code = '', body = null } = {}) {
    super(message);
    this.name = 'WordPressProjectClientError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}
