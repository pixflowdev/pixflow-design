import { describe, expect, it } from 'vitest';
import {
  buildWebsiteCloneBricksHomeForward,
  extractPublicWebsiteCloneUrl,
  extractWebsiteCloneResumeProjectId,
  normalizePublicWebsiteCloneUrl,
  resolvePublicWebsiteCloneTarget,
  websiteCloneBricksPrompt,
} from '../../src/pixflow/website-clone';

describe('website clone URL and Bricks prompt', () => {
  it('accepts public http(s) URLs and strips fragments', () => {
    expect(normalizePublicWebsiteCloneUrl('https://example.com/path#hero')).toBe('https://example.com/path');
    expect(extractPublicWebsiteCloneUrl('clone https://open-design.ai/docs please')).toBe('https://open-design.ai/docs');
  });

  it('accepts a public URL pasted into the first-class clone composer', () => {
    expect(resolvePublicWebsiteCloneTarget('', 'https://ramos-app.webflow.io/')).toBe(
      'https://ramos-app.webflow.io/',
    );
    expect(resolvePublicWebsiteCloneTarget('', 'Clone https://www.outcrowd.io/branding-page please')).toBe(
      'https://www.outcrowd.io/branding-page',
    );
  });

  it('forwards the first-class clone card into Prototype Bricks inside the builder only', () => {
    expect(buildWebsiteCloneBricksHomeForward({
      locationHref: 'http://127.0.0.1:8088/page/?bricks=run',
      pluginId: 'example-web-clone',
      projectIntent: 'web-clone',
      configuredTarget: 'https://ramos-app.webflow.io/',
      prompt: 'https://ramos-app.webflow.io/',
    })).toEqual(expect.objectContaining({
      source: 'pixflow-design',
      type: 'pixflow-design:send-bricks-agent-prompt',
      prompt: '@Website Clone https://ramos-app.webflow.io/',
      patch: { promptSkillIds: ['website-clone', 'web-clone', 'prototype-bricks'] },
    }));
    expect(buildWebsiteCloneBricksHomeForward({
      locationHref: 'http://127.0.0.1:8088/wp-admin/admin.php?page=pixflow-design',
      pluginId: 'example-web-clone',
      projectIntent: 'web-clone',
      configuredTarget: 'https://ramos-app.webflow.io/',
      prompt: 'https://ramos-app.webflow.io/',
    })).toBeNull();
  });

  it('strips sentence punctuation from a public clone URL', () => {
    expect(extractPublicWebsiteCloneUrl('Continue https://ramos-app.webflow.io/: use the saved source.')).toBe(
      'https://ramos-app.webflow.io/',
    );
    expect(extractPublicWebsiteCloneUrl('Clone (https://example.com/path).')).toBe('https://example.com/path');
    expect(extractPublicWebsiteCloneUrl('Compare https://example.com/report_(final) next.')).toBe(
      'https://example.com/report_(final)',
    );
  });

  it('recognizes an explicit local clone project resume without treating unrelated ids as projects', () => {
    expect(extractWebsiteCloneResumeProjectId(
      'Resume project 6ce1ec61-7db1-48b4-bd95-6234a97f9a66 for this Website Clone.',
    )).toBe('6ce1ec61-7db1-48b4-bd95-6234a97f9a66');
    expect(extractWebsiteCloneResumeProjectId(
      'Clone issue 6ce1ec61-7db1-48b4-bd95-6234a97f9a66 into a new project.',
    )).toBeNull();
  });

  it('rejects private, local, credential-bearing, and non-web targets', () => {
    expect(normalizePublicWebsiteCloneUrl('http://127.0.0.1:8080')).toBeNull();
    expect(normalizePublicWebsiteCloneUrl('http://192.168.1.2')).toBeNull();
    expect(normalizePublicWebsiteCloneUrl('https://user:pass@example.com')).toBeNull();
    expect(normalizePublicWebsiteCloneUrl('file:///tmp/site.html')).toBeNull();
  });

  it('builds a Bricks-specific source-first prompt with audit and safety rules', () => {
    const prompt = websiteCloneBricksPrompt('@Website Clone make it responsive', 'https://example.com/');
    expect(prompt).toContain('https://example.com/');
    expect(prompt).toContain('NOTES.md');
    expect(prompt).toContain('staged web-clone skill as an executable workflow');
    expect(prompt).toContain('OD_PLAYWRIGHT_PATH');
    expect(prompt).toContain('RECON/original-recon.json');
    expect(prompt).toContain('asset-manifest.json');
    expect(prompt).toContain('Do not copy analytics');
    expect(prompt).toContain('Do not add visible audit labels');
    expect(prompt).toContain('Do not polish, modernize, embellish, simplify');
    expect(prompt).toContain('observed source values as authoritative');
    expect(prompt).toContain('Do not begin authored Stage A markup until those artifacts exist');
    expect(prompt).toContain('never emit @font-face');
    expect(prompt).toContain('Bricks font-system preflight');
    expect(prompt).toContain('responsive @media rule');
    expect(prompt).toContain('native controls');
    expect(prompt).toContain('_cssCustom');
  });

  it('tells a resumed Website Clone to reuse its completed source evidence', () => {
    const prompt = websiteCloneBricksPrompt(
      '@Website Clone Resume project 6ce1ec61-7db1-48b4-bd95-6234a97f9a66 for https://example.com/',
      'https://example.com/',
    );
    expect(prompt).toContain('Reuse the existing NOTES.md, RECON, harvested assets, and Stage A source');
    expect(prompt).not.toContain('Start a fresh NOTES.md for this clone run');
  });
});
