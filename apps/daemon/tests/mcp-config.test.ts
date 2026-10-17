import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MCP_TEMPLATES,
  buildAcpMcpServers,
  buildClaudeMcpJson,
  buildOpenCodeMcpConfigContent,
  isManagedProjectCwd,
  readMcpConfig,
  sanitizeMcpServer,
  writeMcpConfig,
} from '../src/mcp-config.js';

describe('mcp-config storage', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-mcpconfig-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('returns empty servers when no config file exists', async () => {
    const cfg = await readMcpConfig(dataDir);
    expect(cfg).toEqual({ servers: [] });
  });

  it('returns empty config for a corrupt JSON file', async () => {
    await writeFile(path.join(dataDir, 'mcp-config.json'), '{not valid');
    const cfg = await readMcpConfig(dataDir);
    expect(cfg).toEqual({ servers: [] });
  });

  it('persists and re-reads a valid stdio server', async () => {
    const written = await writeMcpConfig(dataDir, {
      servers: [
        {
          id: 'github',
          label: 'GitHub',
          transport: 'stdio',
          enabled: true,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxx' },
        },
      ],
    });
    expect(written.servers).toHaveLength(1);
    expect(written.servers[0]?.id).toBe('github');

    const reread = await readMcpConfig(dataDir);
    expect(reread.servers[0]?.command).toBe('npx');
    expect(reread.servers[0]?.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghp_xxx');
  });

  it('persists and re-reads a valid SSE server with headers', async () => {
    const written = await writeMcpConfig(dataDir, {
      servers: [
        {
          id: 'higgsfield',
          transport: 'sse',
          enabled: true,
          url: 'https://mcp.higgsfield.ai',
          headers: { Authorization: 'Bearer abc' },
        },
      ],
    });
    expect(written.servers[0]?.url).toBe('https://mcp.higgsfield.ai/');
    expect(written.servers[0]?.headers?.Authorization).toBe('Bearer abc');
  });

  it('defaults loopback HTTP servers to no managed OAuth', () => {
    const out = sanitizeMcpServer({
      id: 'figma-use',
      transport: 'http',
      enabled: true,
      url: 'http://localhost:38451/mcp',
    });
    expect(out?.authMode).toBe('none');
  });

  it('defaults remote HTTP servers to managed OAuth for backward compatibility', () => {
    const out = sanitizeMcpServer({
      id: 'higgsfield',
      transport: 'http',
      enabled: true,
      url: 'https://mcp.higgsfield.ai/mcp',
    });
    expect(out?.authMode).toBe('oauth');
  });

  it('drops invalid entries silently', async () => {
    const written = await writeMcpConfig(dataDir, {
      servers: [
        { id: 'bad' /* missing transport-required fields */ },
        { id: 'NOT VALID id', transport: 'stdio', command: 'x' },
        { id: 'good', transport: 'stdio', command: 'echo' },
        // Duplicate id is dropped on second occurrence.
        { id: 'good', transport: 'stdio', command: 'other' },
      ],
    });
    expect(written.servers.map((s) => s.id)).toEqual(['good']);
  });

  it('rejects non-http(s) URLs', () => {
    const out = sanitizeMcpServer({
      id: 'sneaky',
      transport: 'http',
      url: 'file:///etc/passwd',
    });
    expect(out).toBeNull();
  });

  it('drops disabled flag default to enabled when explicit', () => {
    const out = sanitizeMcpServer({
      id: 'a',
      transport: 'stdio',
      command: 'echo',
      enabled: false,
    });
    expect(out?.enabled).toBe(false);
  });

  it('writes JSON in a deterministic shape', async () => {
    await writeMcpConfig(dataDir, {
      servers: [
        { id: 'a', transport: 'stdio', enabled: true, command: 'echo' },
      ],
    });
    const raw = await readFile(path.join(dataDir, 'mcp-config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({
      servers: [
        { id: 'a', transport: 'stdio', enabled: true, command: 'echo' },
      ],
    });
  });
});

describe('buildClaudeMcpJson', () => {
  it('returns null when no enabled servers', () => {
    expect(buildClaudeMcpJson([])).toBeNull();
    expect(
      buildClaudeMcpJson([
        {
          id: 'x',
          transport: 'stdio',
          enabled: false,
          command: 'echo',
        },
      ]),
    ).toBeNull();
  });

  it('emits a stdio entry with command/args/env', () => {
    const out = buildClaudeMcpJson([
      {
        id: 'github',
        transport: 'stdio',
        enabled: true,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp' },
      },
    ]);
    expect(out).toEqual({
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp' },
        },
      },
    });
  });

  it('emits an sse / http entry with url + headers + transport type', () => {
    const out = buildClaudeMcpJson([
      {
        id: 'higgsfield',
        transport: 'sse',
        enabled: true,
        url: 'https://mcp.higgsfield.ai',
        headers: { Authorization: 'Bearer abc' },
      },
    ]) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield).toEqual({
      type: 'sse',
      url: 'https://mcp.higgsfield.ai',
      headers: { Authorization: 'Bearer abc' },
    });
  });

  it('skips disabled servers', () => {
    const out = buildClaudeMcpJson([
      {
        id: 'a',
        transport: 'stdio',
        enabled: true,
        command: 'echo',
      },
      {
        id: 'b',
        transport: 'stdio',
        enabled: false,
        command: 'rm',
      },
    ]) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(out.mcpServers)).toEqual(['a']);
  });

  it('injects an Authorization Bearer header when a stored OAuth token is supplied', () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.higgsfield.ai/mcp',
        },
      ],
      { higgsfield: 'access-tok-xyz' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield?.headers).toEqual({
      Authorization: 'Bearer access-tok-xyz',
    });
  });

  it('does not inject a stored OAuth token into no-auth HTTP servers', () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'figma-use',
          transport: 'http',
          enabled: true,
          authMode: 'none',
          url: 'http://localhost:38451/mcp',
        },
      ],
      { 'figma-use': 'stale-token' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers['figma-use']?.headers).toBeUndefined();
  });

  it("does NOT overwrite a user-pinned Authorization header even when a token exists", () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.higgsfield.ai/mcp',
          headers: { authorization: 'Bearer manual-token' },
        },
      ],
      { higgsfield: 'access-tok-xyz' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield?.headers).toEqual({
      authorization: 'Bearer manual-token',
    });
  });

  it('overwrites a blank/whitespace Authorization header with the OAuth Bearer (template-default-not-filled bug)', () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.higgsfield.ai/mcp',
          headers: { Authorization: '   ' },
        },
      ],
      { higgsfield: 'access-tok-xyz' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield?.headers).toEqual({
      Authorization: 'Bearer access-tok-xyz',
    });
  });

  it('drops a blank Authorization header when no token is available either', () => {
    const out = buildClaudeMcpJson([
      {
        id: 'higgsfield',
        transport: 'http',
        enabled: true,
        url: 'https://mcp.higgsfield.ai/mcp',
        headers: { Authorization: '' },
      },
    ]) as { mcpServers: Record<string, Record<string, unknown>> };
    // Empty Authorization is worse than missing — should be omitted.
    expect(out.mcpServers.higgsfield?.headers).toBeUndefined();
  });
});

describe('sanitizeMcpServer headers', () => {
  it('strips empty / whitespace-only header values at persist time', () => {
    const sanitized = sanitizeMcpServer({
      id: 'higgsfield',
      transport: 'http',
      enabled: true,
      url: 'https://mcp.higgsfield.ai/mcp',
      headers: {
        Authorization: '',
        'X-Real-Header': 'kept',
        ' ': 'invalid-key',
        Whitespace: '   ',
      },
    });
    expect(sanitized?.headers).toEqual({ 'X-Real-Header': 'kept' });
  });

  it('omits the headers field entirely when every value is blank', () => {
    const sanitized = sanitizeMcpServer({
      id: 'higgsfield',
      transport: 'http',
      enabled: true,
      url: 'https://mcp.higgsfield.ai/mcp',
      headers: { Authorization: '' },
    });
    expect(sanitized?.headers).toBeUndefined();
  });

  it('only injects the Bearer for the matching server id', () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.higgsfield.ai/mcp',
        },
        {
          id: 'untouched',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.example.com/mcp',
        },
      ],
      { higgsfield: 'tok' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield?.headers).toEqual({
      Authorization: 'Bearer tok',
    });
    expect(out.mcpServers.untouched?.headers).toBeUndefined();
  });
});

describe('buildAcpMcpServers', () => {
  it('drops sse / http servers (ACP descriptor is stdio-only)', () => {
    const out = buildAcpMcpServers([
      {
        id: 'a',
        transport: 'stdio',
        enabled: true,
        command: 'echo',
      },
      {
        id: 'b',
        transport: 'sse',
        enabled: true,
        url: 'https://example.com',
      },
    ]);
    expect(out.map((s) => s.name)).toEqual(['a']);
  });

  it('flattens env to ACP {name,value} array shape', () => {
    const out = buildAcpMcpServers([
      {
        id: 'gh',
        transport: 'stdio',
        enabled: true,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { TOKEN: 'x' },
      },
    ]);
    expect(out[0]).toEqual({
      type: 'stdio',
      name: 'gh',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: [{ name: 'TOKEN', value: 'x' }],
    });
  });
});

describe('buildOpenCodeMcpConfigContent', () => {
  it('returns null when no enabled servers (avoids polluting OPENCODE_CONFIG_CONTENT)', () => {
    expect(buildOpenCodeMcpConfigContent([])).toBeNull();
    expect(
      buildOpenCodeMcpConfigContent([
        {
          id: 'x',
          transport: 'stdio',
          enabled: false,
          command: 'echo',
        },
      ]),
    ).toBeNull();
  });

  it('grants daemon-selected project directories without requiring an MCP server', () => {
    const projectDir = path.resolve('/tmp/pixflow-opencode-project');
    const raw = buildOpenCodeMcpConfigContent([], {}, {
      allowedDirectories: [projectDir],
    });
    const parsed = JSON.parse(raw as string) as {
      permission: { external_directory: Record<string, string> };
    };
    expect(parsed.permission.external_directory).toEqual({
      [projectDir]: 'allow',
      [path.join(projectDir, '*')]: 'allow',
      [path.join(projectDir, '**')]: 'allow',
    });
  });

  it('serialises a stdio server to OpenCode local schema (type=local, command=[cmd,...args])', () => {
    const raw = buildOpenCodeMcpConfigContent([
      {
        id: 'basic-memory',
        transport: 'stdio',
        enabled: true,
        command: '/opt/homebrew/bin/uvx',
        args: ['basic-memory', 'mcp'],
      },
    ]);
    expect(raw).not.toBeNull();
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw as string) as {
      mcp: Record<string, Record<string, unknown>>;
    };
    expect(parsed.mcp['basic-memory']).toEqual({
      type: 'local',
      command: ['/opt/homebrew/bin/uvx', 'basic-memory', 'mcp'],
      enabled: true,
    });
  });

  it('emits environment when the user supplied env vars', () => {
    const raw = buildOpenCodeMcpConfigContent([
      {
        id: 'github',
        transport: 'stdio',
        enabled: true,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxx' },
      },
    ]);
    const parsed = JSON.parse(raw as string) as {
      mcp: Record<string, Record<string, unknown>>;
    };
    expect(parsed.mcp.github).toEqual({
      type: 'local',
      command: ['npx', '-y', '@modelcontextprotocol/server-github'],
      environment: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxx' },
      enabled: true,
    });
  });

  it('serialises sse / http servers to OpenCode remote schema (type=remote, url, headers)', () => {
    const raw = buildOpenCodeMcpConfigContent([
      {
        id: 'higgsfield',
        transport: 'sse',
        enabled: true,
        url: 'https://mcp.higgsfield.ai',
        headers: { Authorization: 'Bearer abc' },
      },
    ]);
    const parsed = JSON.parse(raw as string) as {
      mcp: Record<string, Record<string, unknown>>;
    };
    expect(parsed.mcp.higgsfield).toEqual({
      type: 'remote',
      url: 'https://mcp.higgsfield.ai',
      headers: { Authorization: 'Bearer abc' },
      enabled: true,
    });
  });

  it('skips disabled servers without leaving an empty mcp record', () => {
    const raw = buildOpenCodeMcpConfigContent([
      {
        id: 'a',
        transport: 'stdio',
        enabled: true,
        command: 'echo',
      },
      {
        id: 'b',
        transport: 'stdio',
        enabled: false,
        command: 'rm',
      },
    ]);
    const parsed = JSON.parse(raw as string) as {
      mcp: Record<string, unknown>;
    };
    expect(Object.keys(parsed.mcp)).toEqual(['a']);
  });

  it('skips stdio servers missing a command (sanitize lets them through; we must guard at build)', () => {
    const raw = buildOpenCodeMcpConfigContent([
      {
        id: 'bad',
        transport: 'stdio',
        enabled: true,
        // command intentionally omitted
      },
      {
        id: 'good',
        transport: 'stdio',
        enabled: true,
        command: 'echo',
      },
    ]);
    const parsed = JSON.parse(raw as string) as {
      mcp: Record<string, unknown>;
    };
    expect(Object.keys(parsed.mcp)).toEqual(['good']);
  });

  it('skips remote servers missing a url', () => {
    const raw = buildOpenCodeMcpConfigContent([
      {
        id: 'broken',
        transport: 'http',
        enabled: true,
        // url intentionally omitted
      },
    ]);
    expect(raw).toBeNull();
  });

  it('injects a daemon-issued Bearer into oauth http servers without a pinned Authorization', () => {
    const raw = buildOpenCodeMcpConfigContent(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          authMode: 'oauth',
          url: 'https://mcp.higgsfield.ai/mcp',
        },
      ],
      { higgsfield: 'access-tok-xyz' },
    );
    const parsed = JSON.parse(raw as string) as {
      mcp: Record<string, Record<string, unknown>>;
    };
    expect(parsed.mcp.higgsfield?.headers).toEqual({
      Authorization: 'Bearer access-tok-xyz',
    });
  });

  it('does NOT overwrite a user-pinned Authorization header even when a token exists', () => {
    const raw = buildOpenCodeMcpConfigContent(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          authMode: 'oauth',
          url: 'https://mcp.higgsfield.ai/mcp',
          headers: { authorization: 'Bearer manual-token' },
        },
      ],
      { higgsfield: 'access-tok-xyz' },
    );
    const parsed = JSON.parse(raw as string) as {
      mcp: Record<string, Record<string, unknown>>;
    };
    expect(parsed.mcp.higgsfield?.headers).toEqual({
      authorization: 'Bearer manual-token',
    });
  });

  it('produces stable JSON formatting (no trailing whitespace, no BOM)', () => {
    const raw = buildOpenCodeMcpConfigContent([
      {
        id: 'a',
        transport: 'stdio',
        enabled: true,
        command: 'echo',
      },
    ]);
    expect(raw).not.toBeNull();
    expect((raw as string).charCodeAt(0)).not.toBe(0xfeff);
    // Round-trip MUST parse cleanly.
    expect(() => JSON.parse(raw as string)).not.toThrow();
  });
});

describe('isManagedProjectCwd', () => {
  const projectsDir = path.resolve('abs', '.od', 'projects');

  it('accepts a real per-project subdir', () => {
    expect(isManagedProjectCwd(path.join(projectsDir, 'abc'), projectsDir)).toBe(true);
    expect(
      isManagedProjectCwd(path.join(projectsDir, 'abc', 'sub'), projectsDir),
    ).toBe(true);
  });

  it('rejects the projects-dir root itself (no per-project id)', () => {
    expect(isManagedProjectCwd(projectsDir, projectsDir)).toBe(false);
  });

  it('rejects a git-linked baseDir outside of projects-dir', () => {
    expect(isManagedProjectCwd(path.resolve('home', 'me', 'code', 'repo'), projectsDir)).toBe(false);
  });

  it('rejects PROJECT_ROOT-shaped fallback', () => {
    expect(isManagedProjectCwd(path.dirname(projectsDir), projectsDir)).toBe(false);
  });

  it('rejects null / undefined cwd', () => {
    expect(isManagedProjectCwd(null, projectsDir)).toBe(false);
    expect(isManagedProjectCwd(undefined, projectsDir)).toBe(false);
    expect(isManagedProjectCwd('', projectsDir)).toBe(false);
  });

  it('rejects path-prefix collisions (different sibling dir)', () => {
    // `/abs/.od/projects-other` starts with `/abs/.od/projects` as a string,
    // but is NOT a child of `/abs/.od/projects/`. Strict-separator check
    // makes sure we don't accidentally write to an unrelated tree.
    expect(
      isManagedProjectCwd(path.join(`${projectsDir}-other`, 'x'), projectsDir),
    ).toBe(false);
  });
});

describe('MCP_TEMPLATES', () => {
  it('ships 50 unique documented starters without embedded credentials', () => {
    expect(MCP_TEMPLATES).toHaveLength(50);
    expect(new Set(MCP_TEMPLATES.map((t) => t.id)).size).toBe(50);
    for (const template of MCP_TEMPLATES) {
      expect(template.homepage).toMatch(/^https:/);
      expect(template.setup).toBeTruthy();
      expect(template.description).toBeTruthy();
      if (template.transport === 'stdio') {
        expect(template.command).toBeTruthy();
        expect(template.args?.length).toBeGreaterThan(0);
      } else expect(template.url || template.urlPlaceholder).toMatch(/^https:/);
      for (const field of [...template.envFields ?? [], ...template.headerFields ?? []]) {
        if (field.secret) expect(field.defaultValue).toBeUndefined();
      }
    }
  });
  it('explicitly uses public documentation endpoints without OAuth', () => {
    for (const id of ['openai-docs', 'microsoft-learn', 'astro-docs', 'svelte-docs']) {
      expect(MCP_TEMPLATES.find((t) => t.id === id)).toMatchObject({ transport: 'http', authMode: 'none' });
    }
  });
  it('requires user-provided WordPress credentials and endpoints', () => {
    for (const id of ['wordpress', 'acf', 'yoast']) {
      const template = MCP_TEMPLATES.find((t) => t.id === id)!;
      expect(template.args).toContain('@automattic/mcp-wordpress-remote@latest');
      expect(template.envFields?.find((f) => f.key === 'WP_API_PASSWORD')).toMatchObject({ required: true, secret: true });
      expect(template.envFields?.find((f) => f.key === 'WP_API_URL')?.defaultValue).toBeUndefined();
    }
    expect(MCP_TEMPLATES.find((t) => t.id === 'woocommerce')?.url).toBe('');
  });
});
