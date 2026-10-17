import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { PixflowFrameworkDesignSystemProfile } from '@open-design/contracts';

import {
  pixflowFrameworkProfileHash,
  publishPixflowFrameworkDesignSystem,
  readPixflowFrameworkProfile,
} from '../src/pixflow-framework-design-system.js';

const roots: string[] = [];

const profile: PixflowFrameworkDesignSystemProfile = {
  colors: {
    main: {
      background: '#f8fafc',
      foreground: '#ffffff',
      heading: '#0f172a',
      text: '#334155',
      accent: '#2563eb',
    },
    secondary: {
      background: '#eff6ff',
      foreground: '#dbeafe',
      heading: '#172554',
      text: '#1e3a8a',
      accent: '#3b82f6',
    },
    tertiary: {
      background: '#020617',
      foreground: '#0f172a',
      heading: '#f8fafc',
      text: '#cbd5e1',
      accent: '#60a5fa',
    },
  },
  sourcePalette: ['#2563eb', '#020617'],
  headingFont: 'Space Grotesk',
  bodyFont: 'Inter',
  typographySize: 'large',
  headingWeightPreset: 'bold',
  headingStylePreset: 'spacious',
  designStyle: 'flat',
  buttonStylePreset: 'sleek',
  buttonRadius: 'medium',
  surfaceRadius: 'large',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pixflow-framework-design-system-'));
  roots.push(root);
  return root;
}

describe('Pixflow Framework design system publishing', () => {
  it('creates a rich reusable package with a lossless round-trip profile', async () => {
    const root = await tempRoot();
    const result = await publishPixflowFrameworkDesignSystem(root, {
      title: 'Acme Product System',
      summary: 'The exact system used by the Acme Bricks site.',
      routeId: 'pixflow-native-bricks',
      siteUrl: 'https://acme.example',
      profile,
      routeContext: { allowlists: { cssVariables: ['--primary'] } },
      bricksTokenMap: { primary: '--primary' },
    });

    expect(result.created).toBe(true);
    expect(result.designSystemId).toMatch(/^user:/);
    expect(result.syncHash).toBe(pixflowFrameworkProfileHash(profile));

    const document = await readPixflowFrameworkProfile(root, result.designSystemId);
    expect(document?.profile).toEqual(profile);
    expect(document?.source).toMatchObject({
      routeId: 'pixflow-native-bricks',
      siteUrl: 'https://acme.example',
    });

    const directory = path.join(root, result.designSystemId.replace(/^user:/, ''));
    await expect(readFile(path.join(directory, 'DESIGN.md'), 'utf8')).resolves.toContain(
      'Exact round-trip profile: `pixflow/profile.json`',
    );
    await expect(readFile(path.join(directory, 'tokens.css'), 'utf8')).resolves.toContain(
      '--pixflow-main-accent: #2563eb;',
    );
    await expect(readFile(path.join(directory, 'preview', 'colors-primary.html'), 'utf8')).resolves.toContain(
      '<!doctype html>',
    );
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as {
      schemaVersion: string;
      id: string;
      usage: string;
    };
    expect(manifest).toMatchObject({
      schemaVersion: 'od-design-system-project/v1',
      id: result.designSystemId.replace(/^user:/, ''),
      usage: 'pixflow/profile.json',
    });
  });

  it('updates the same package instead of duplicating it', async () => {
    const root = await tempRoot();
    const first = await publishPixflowFrameworkDesignSystem(root, {
      title: 'Acme Product System',
      routeId: 'pixflow-native-bricks',
      profile,
    });
    const updatedProfile = {
      ...profile,
      colors: {
        ...profile.colors,
        main: { ...profile.colors.main, accent: '#7c3aed' },
      },
    };
    const second = await publishPixflowFrameworkDesignSystem(root, {
      title: 'Acme Product System',
      routeId: 'pixflow-native-bricks',
      profile: updatedProfile,
      existingDesignSystemId: first.designSystemId,
    });

    expect(second.created).toBe(false);
    expect(second.designSystemId).toBe(first.designSystemId);
    expect(second.syncHash).not.toBe(first.syncHash);
    expect((await readPixflowFrameworkProfile(root, first.designSystemId))?.profile).toEqual(updatedProfile);
  });

  it('rejects malformed colors and non-user update targets', async () => {
    const root = await tempRoot();
    await expect(publishPixflowFrameworkDesignSystem(root, {
      title: 'Invalid',
      routeId: 'pixflow-native-bricks',
      profile: {
        ...profile,
        colors: {
          ...profile.colors,
          main: { ...profile.colors.main, accent: 'red' },
        },
      },
    })).rejects.toThrow('profile.colors.main.accent must be a six-digit hex color');

    await expect(publishPixflowFrameworkDesignSystem(root, {
      title: 'Invalid update',
      routeId: 'pixflow-native-bricks',
      profile,
      existingDesignSystemId: 'built-in:stripe',
    })).rejects.toThrow('editable design system not found');

    let nested: Record<string, unknown> = {};
    for (let index = 0; index < 30; index += 1) nested = { nested };
    await expect(publishPixflowFrameworkDesignSystem(root, {
      title: 'Invalid context',
      routeId: 'pixflow-native-bricks',
      profile,
      routeContext: nested,
    })).rejects.toThrow('published design-system context is too deeply nested');
  });
});
