import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PluginManifestSchema } from '@open-design/contracts';

type PromptModule = { composeSystemPrompt(input: { skillName: string; skillBody: string; pluginBlock?: string; locale?: string }): string };
// Load each owner's actual source using its own resolver, rather than pulling
// bundler-mode app dependencies into the e2e NodeNext compilation boundary.
const { composeSystemPrompt: apiPrompt } = await import(new URL('../../packages/contracts/src/prompts/system.ts', import.meta.url).href) as PromptModule;
const { composeSystemPrompt: cliPrompt } = await import(new URL('../../apps/daemon/src/prompts/system.ts', import.meta.url).href) as PromptModule;
const { DISCOVERY_AND_PHILOSOPHY: apiDiscovery } = await import(new URL('../../packages/contracts/src/prompts/discovery.ts', import.meta.url).href) as { DISCOVERY_AND_PHILOSOPHY: string };
const { DISCOVERY_AND_PHILOSOPHY: cliDiscovery } = await import(new URL('../../apps/daemon/src/prompts/discovery.ts', import.meta.url).href) as { DISCOVERY_AND_PHILOSOPHY: string };

const root = fileURLToPath(new URL('../../', import.meta.url));
const routerPath = `${root}/plugins/_official/scenarios/od-default/`;
const skill = readFileSync(`${routerPath}SKILL.md`, 'utf8');
const manifest = JSON.parse(readFileSync(`${routerPath}open-design.json`, 'utf8'));
const options = [
  { label: 'WordPress page or post', value: 'wordpress-content' },
  { label: 'WordPress administration', value: 'wordpress-admin' },
  { label: 'Other — describe the task', value: 'other' },
];
function taskOptions(text: string) {
  const form = text.match(/<question-form id="task-type"[^>]*>\s*([\s\S]*?)<\/question-form>/)?.[1];
  expect(form).toBeTruthy();
  return JSON.parse(form!).questions.find((question: { id: string }) => question.id === 'taskType').options;
}

describe('Pixflow fallback router across packaged resources and API/CLI prompts', () => {
  it('retains the stored router ID but advertises only baseline tasks and no media atoms', () => {
    expect(PluginManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.name).toBe('od-default');
    expect(manifest.od.hidden).toBe(true);
    expect(manifest.title).toContain('Pixflow');
    expect(manifest.od.genui.surfaces[0].schema.properties.taskType.enum).toEqual(options.map(option => option.value));
    expect(manifest.od.capabilities).toEqual(['prompt:inject', 'genui:choice']);
    expect(manifest.od.pipeline.stages.flatMap((stage: { atoms: string[] }) => stage.atoms)).toEqual([]);
    expect(taskOptions(skill)).toEqual(options);
    expect(skill).not.toMatch(/Open Design|OD media generation|HyperFrames/);
  });

  for (const [surface, compose, discovery] of [['API', apiPrompt, apiDiscovery], ['CLI', cliPrompt, cliDiscovery]] as const) {
    it(`${surface} uses the same Free-safe choices in its overriding discovery layer`, () => {
      expect(taskOptions(discovery)).toEqual(options);
      const prompt = compose({ skillName: 'od-default', skillBody: skill });
      expect(taskOptions(prompt)).toEqual(options);
      expect(prompt).toContain('This router does not grant capabilities');
      expect(prompt).toContain('Unavailable, expired or unverified Pro access');
      expect(prompt).toContain('Do not bypass edition checks');
    });
    it(`${surface} retains the Pro dispatch rule without putting premium instructions in Free`, () => {
      const prompt = compose({ skillName: 'od-default', skillBody: skill, pluginBlock: '## Active plugin\nPixflow task router (`od-default@0.2.0`)' });
      expect(prompt).toContain('When active Pro access and the required tool are confirmed');
      expect(prompt).toContain('load the relevant available Pro skill');
      expect(prompt).toContain('existing content, settings, fonts, icons and native WordPress editing');
      expect(skill).not.toMatch(/\bOD_BIN\b|\bmedia generate\b|\bmedia stock\b/);
    });
    it(`${surface} localizes labels without changing routing values in every supported locale`, () => {
      for (const locale of ['ar', 'de', 'en', 'es-ES', 'fa', 'fr', 'hu', 'id', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'th', 'tr', 'uk', 'zh-CN', 'zh-TW']) {
        const prompt = compose({ skillName: 'od-default', skillBody: skill, locale });
        expect(taskOptions(prompt), locale).toEqual(options);
        expect(prompt, locale).not.toContain('Do not translate, reorder, or rewrite those option labels');
        expect(prompt, locale).toContain('Translate labels, preserve option values');
        if (locale !== 'en') expect(prompt, locale).toContain('translate option labels and preserve the machine-readable values');
      }
    });
  }
});
