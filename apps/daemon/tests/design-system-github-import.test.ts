import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  importGitHubDesignSystemProject,
  parseGitHubRepoUrl,
} from '../src/design-system-github-import.js';

describe('parseGitHubRepoUrl', () => {
  it('normalizes public GitHub repository URLs to clone URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/acme/design-system')).toEqual({
      owner: 'acme',
      repo: 'design-system',
      cloneUrl: 'https://github.com/acme/design-system.git',
    });
    expect(parseGitHubRepoUrl('https://github.com/acme/design-system.git')).toEqual({
      owner: 'acme',
      repo: 'design-system',
      cloneUrl: 'https://github.com/acme/design-system.git',
    });
  });

  it('rejects non-root or non-GitHub URLs', () => {
    expect(() => parseGitHubRepoUrl('https://example.com/acme/design-system')).toThrow(
      /github\.com/,
    );
    expect(() => parseGitHubRepoUrl('https://github.com/acme/design-system/tree/main')).toThrow(
      /repository root/,
    );
  });
});

describe('importGitHubDesignSystemProject', () => {
  let tempRoot: string;
  let fixtureRoot: string;
  let tmpRoot: string;
  let userDesignSystemsRoot: string;
  let fakeGit: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'od-ds-github-import-'));
    fixtureRoot = path.join(tempRoot, 'fixture-repo');
    tmpRoot = path.join(tempRoot, '.tmp');
    userDesignSystemsRoot = path.join(tempRoot, 'user-design-systems');
    fs.mkdirSync(path.join(fixtureRoot, 'src', 'components'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'src', 'styles'), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify({
        name: 'github-design-kit',
        description: 'A GitHub-hosted design kit.',
        dependencies: { react: '^18.0.0' },
      }),
    );
    fs.writeFileSync(path.join(fixtureRoot, 'README.md'), '# GitHub Design Kit\n\nRemote style source.\n');
    fs.writeFileSync(path.join(fixtureRoot, 'src', 'styles', 'tokens.css'), ':root { --primary: #22c55e; }');
    fs.writeFileSync(path.join(fixtureRoot, 'src', 'components', 'Card.tsx'), 'export function Card() {}');

    const runner = path.join(tempRoot, 'fake-git.cjs');
    fs.writeFileSync(runner, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'clone') {
  fs.cpSync(process.env.FAKE_GIT_SOURCE, args.at(-1), { recursive: true });
} else if (args.includes('rev-parse')) {
  console.log(args.includes('--abbrev-ref') ? 'main' : 'abc123def456');
} else { process.exitCode = 1; }
`);
    fs.chmodSync(runner, 0o755);
    fakeGit = runner;
    if (process.platform === 'win32') {
      fakeGit = path.join(tempRoot, 'fake-git.cmd');
      fs.writeFileSync(fakeGit, `@echo off\r\n"${process.execPath}" "${runner}" %*\r\n`);
    }
    process.env.FAKE_GIT_SOURCE = fixtureRoot;
  });

  afterEach(() => {
    delete process.env.FAKE_GIT_SOURCE;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('clones a public GitHub URL and imports through the local project format', async () => {
    const result = await importGitHubDesignSystemProject(
      'https://github.com/acme/design-kit',
      tmpRoot,
      userDesignSystemsRoot,
      {
        gitBin: fakeGit,
        now: new Date('2026-05-18T10:00:00.000Z'),
        importMode: 'normalized',
        craftApplies: ['color'],
      },
    );

    expect(result.id).toBe('github-design-kit');
    const manifest = JSON.parse(fs.readFileSync(path.join(result.dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: 'od-design-system-project/v1',
      id: 'github-design-kit',
      source: {
        type: 'github',
        url: 'https://github.com/acme/design-kit.git',
        branch: 'main',
        commit: 'abc123def456',
        importedAt: '2026-05-18T10:00:00.000Z',
      },
      files: {
        design: 'DESIGN.md',
        tokens: 'tokens.css',
        components: 'components.html',
      },
      usage: 'USAGE.md',
      componentsManifest: 'components.manifest.json',
      importMode: 'normalized',
      craft: {
        applies: ['color'],
      },
      sourceFiles: {
        scanned: 'source/scanned-files.json',
        evidence: 'source/evidence.md',
        tokens: 'source/tokens.source.json',
        report: 'source/token-contract.report.json',
        snippets: 'source/snippets/INDEX.json',
      },
    });
    expect(fs.readFileSync(path.join(result.dir, 'DESIGN.md'), 'utf8')).toContain(
      'A GitHub-hosted design kit.',
    );
    expect(fs.existsSync(path.join(result.dir, 'USAGE.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, 'components.manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, 'source', 'token-contract.report.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, 'preview', 'app.html'))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, 'source', 'snippets', 'card.tsx'))).toBe(true);
  });
});
