import { describe, expect, it } from 'vitest';

import {
  activateWpAdminSkillsFromDecision,
  mergeWpAdminSkillCatalogues,
  wpAdminGutenbergPreparationFailurePolicy,
} from '../../src/pixflow/wp-admin-gutenberg-skill-router';

const root = {
  id: 'wordpress-gutenberg-authoring', label: 'Gutenberg authoring', description: 'Root', active: true,
  instruction: 'ROOT INSTRUCTION', relatedIds: ['wordpress-gutenberg-context-exact-read'],
};
const branches = [
  { id: 'wordpress-gutenberg-context-exact-read', label: 'Exact read', description: 'Read', active: true, instruction: 'READ INSTRUCTION', internal: true },
  { id: 'wordpress-gutenberg-author-create-article', label: 'Create article', description: 'Create', active: true, instruction: 'CREATE INSTRUCTION', internal: true },
  { id: 'wordpress-gutenberg-author-metadata-preservation', label: 'Preserve content', description: 'Metadata', active: true, instruction: 'PRESERVE INSTRUCTION', internal: true },
  { id: 'wordpress-gutenberg-blocks-media', label: 'Media blocks', description: 'Media', active: true, instruction: 'MEDIA INSTRUCTION', internal: true },
  { id: 'wordpress-gutenberg-media-bindings', label: 'Media bindings', description: 'Bindings', active: true, instruction: 'BINDING INSTRUCTION', internal: true },
  { id: 'wordpress-gutenberg-prepare-canonicalize', label: 'Prepare', description: 'Prepare', active: true, instruction: 'PREPARE INSTRUCTION', internal: true },
  { id: 'wordpress-gutenberg-apply-transaction', label: 'Apply', description: 'Apply', active: true, instruction: 'APPLY INSTRUCTION', internal: true },
];

describe('WP Admin Gutenberg skill router', () => {
  it('preserves the managed library namespace and immutable selection', () => {
    const id = `pixflow-library-website-animation-${'a'.repeat(64)}`;
    const merged = mergeWpAdminSkillCatalogues({}, { skills: [{ id, name: 'Website Animation', source: 'official-library' }] });
    expect(merged.skills[0]).toMatchObject({ id, source: 'official-library' });
  });
  it('keeps native mentions available alongside a large installed skill library', () => {
    const installed = Array.from({ length: 140 }, (_, index) => ({ id: `installed-${index}`, name: `Installed ${index}` }));
    const merged = mergeWpAdminSkillCatalogues({ skills: [root, { id: 'wordpress-content', label: 'WordPress Content' }] }, { skills: installed });
    expect(merged.skills.map(skill => skill.id)).toContain('wordpress-content');
    expect(merged.skills.map(skill => skill.id)).toContain('installed-139');
  });
  it('keeps internal Pixflow leaves out of the composer while retaining their instruction bodies', () => {
    const merged = mergeWpAdminSkillCatalogues(
      { skills: [root], branches },
      { skills: [{ id: 'user-writing', name: 'User writing', description: 'User skill', enabled: true }] },
    );
    expect(merged.skills.map((skill) => skill.id)).toContain('wordpress-gutenberg-authoring');
    expect(merged.skills.map((skill) => skill.id)).toContain('user-writing');
    expect(merged.skills.map((skill) => skill.id)).not.toContain('wordpress-gutenberg-context-exact-read');
    expect(merged.branches.find((skill) => skill.id === 'wordpress-gutenberg-context-exact-read')?.instruction).toBe('READ INSTRUCTION');
  });

  it('activates only the bounded source-backed path selected by the semantic agent', () => {
    const activated = activateWpAdminSkillsFromDecision({
      selectedSkillIds: [
        'wordpress-gutenberg-authoring',
        'wordpress-gutenberg-context-exact-read',
        'wordpress-gutenberg-author-create-article',
        'wordpress-gutenberg-blocks-media',
        'wordpress-gutenberg-media-bindings',
        'wordpress-gutenberg-prepare-canonicalize',
        'wordpress-gutenberg-apply-transaction',
      ],
      skills: [root],
      branches,
    });
    expect(activated.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      'wordpress-gutenberg-authoring',
      'wordpress-gutenberg-context-exact-read',
      'wordpress-gutenberg-author-create-article',
      'wordpress-gutenberg-blocks-media',
      'wordpress-gutenberg-media-bindings',
      'wordpress-gutenberg-prepare-canonicalize',
      'wordpress-gutenberg-apply-transaction',
    ]));
    expect(activated.every((skill) => Boolean(skill.instruction))).toBe(true);
    expect(activated.length).toBeLessThanOrEqual(12);
  });

  it('does not grant a repair for empty output, timeouts, stale context, or permissions', () => {
    expect(wpAdminGutenbergPreparationFailurePolicy(new Error('empty serialized content'))).toBe('fail_closed');
    expect(wpAdminGutenbergPreparationFailurePolicy(new Error('target Block Editor did not finish preparing'))).toBe('fail_closed');
    expect(wpAdminGutenbergPreparationFailurePolicy(new Error('post changed after preparation'))).toBe('fail_closed');
    expect(wpAdminGutenbergPreparationFailurePolicy(new Error('current user cannot edit the post'))).toBe('fail_closed');
    expect(wpAdminGutenbergPreparationFailurePolicy(new Error('Unavailable target-editor blocks: core/missing'))).toBe('repair_once');
    expect(wpAdminGutenbergPreparationFailurePolicy(new Error('Block validation failed: invalid attribute'))).toBe('repair_once');
  });

  it('does not infer a process from prompt vocabulary or activate unselected leaves', () => {
    const first = activateWpAdminSkillsFromDecision({
      selectedSkillIds: ['wordpress-gutenberg-author-metadata-preservation'],
      skills: [root],
      branches,
    });
    const second = activateWpAdminSkillsFromDecision({
      selectedSkillIds: ['wordpress-gutenberg-author-metadata-preservation'],
      skills: [root],
      branches,
    });
    const ids = first.map((skill) => skill.id);
    expect(ids).toContain('wordpress-gutenberg-author-metadata-preservation');
    expect(ids).not.toContain('wordpress-gutenberg-author-create-article');
    expect(ids).not.toContain('wordpress-gutenberg-apply-transaction');
    expect(second.map((skill) => skill.id)).toEqual(ids);
  });
});
