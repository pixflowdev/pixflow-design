import { describe, expect, it } from 'vitest';

import {
  countStageBEffectiveLinkAffordances,
  inspectStageBGenerationRequirements,
  normalizeStageBGenerationRequirements,
} from '../bricks-handoff-cli.mjs';

describe('generated Bricks nested capabilities', () => {
  it('accepts query and condition capabilities on the intended generated wrapper', () => {
    const result = inspectStageBGenerationRequirements([
      { id: 'section1', name: 'section', parent: '', children: ['cardwrap'], settings: {} },
      {
        id: 'cardwrap',
        name: 'block',
        parent: 'section1',
        children: ['title1'],
        settings: {
          hasLoop: true,
          query: {
            objectType: 'post',
            post_type: ['post'],
            posts_per_page: 6,
            orderby: 'date',
            order: 'DESC',
          },
          _conditions: [[
            { id: 'logged', key: 'user_logged_in', compare: '==', value: '1' },
            { id: 'role', key: 'user_role', compare: '==', value: 'subscriber' },
          ]],
        },
      },
      { id: 'title1', name: 'heading', parent: 'cardwrap', children: [], settings: { text: '{post_title}' } },
    ], [
      { kind: 'query_loop', minimumMatches: 1, source: 'prompt' },
      { kind: 'conditions', minimumMatches: 1, source: 'prompt' },
      { kind: 'dynamic_data', minimumMatches: 1, source: 'prompt' },
    ]);

    expect(result.issues).toEqual([]);
    expect(result.matches.query_loop).toEqual(['cardwrap']);
    expect(result.matches.conditions).toEqual(['cardwrap']);
    expect(result.matches.dynamic_data).toEqual(['title1']);
  });

  it('fails closed when a generated structure omits one requested capability', () => {
    const result = inspectStageBGenerationRequirements([
      {
        id: 'cardwrap',
        name: 'block',
        settings: {
          hasLoop: true,
          query: { objectType: 'post', post_type: ['post'] },
        },
      },
    ], [
      { kind: 'query_loop', minimumMatches: 1, source: 'prompt' },
      { kind: 'conditions', minimumMatches: 1, source: 'prompt' },
    ]);

    expect(result.matches.query_loop).toEqual(['cardwrap']);
    expect(result.issues).toEqual([
      expect.objectContaining({
        id: 'stage_b_generation_requirement_missing_conditions',
        severity: 'p0',
      }),
    ]);
  });

  it('normalizes only bounded allowlisted requirement families', () => {
    expect(normalizeStageBGenerationRequirements([
      { kind: 'query_loop', minimumMatches: 99, source: 'prompt' },
      { kind: 'query_loop', minimumMatches: 2, source: 'skill' },
      { kind: 'conditions', minimumMatches: 1, source: 'skill' },
      { kind: 'raw_patch', minimumMatches: 1, source: 'prompt' },
    ])).toEqual([
      { kind: 'query_loop', minimumMatches: 4, source: 'prompt' },
      { kind: 'conditions', minimumMatches: 1, source: 'skill' },
    ]);
  });

  it('counts one native query-loop card as the configured repeated link inventory', () => {
    expect(countStageBEffectiveLinkAffordances([
      { id: 'section1', name: 'section', parent: '', children: ['cta', 'grid'], settings: {} },
      { id: 'cta', name: 'text-link', parent: 'section1', children: [], settings: { link: { url: '/blog' } } },
      { id: 'grid', name: 'block', parent: 'section1', children: ['card'], settings: {} },
      {
        id: 'card',
        name: 'div',
        parent: 'grid',
        children: ['cardLink'],
        settings: {
          hasLoop: true,
          query: { objectType: 'post', posts_per_page: 6 },
        },
      },
      {
        id: 'cardLink',
        name: 'block',
        parent: 'card',
        children: [],
        settings: { link: { useDynamicData: '{post_url}' } },
      },
    ])).toBe(7);
  });

  it('recognizes the native Bricks string checkbox shape for a query loop', () => {
    const content = [
      {
        id: 'card',
        name: 'block',
        parent: '',
        children: ['link'],
        settings: {
          hasLoop: '1',
          query: { objectType: 'post', posts_per_page: '6' },
        },
      },
      { id: 'link', name: 'block', parent: 'card', children: [], settings: { link: { useDynamicData: '{post_url}' } } },
    ];

    expect(inspectStageBGenerationRequirements(content, [
      { kind: 'query_loop', minimumMatches: 1, source: 'prompt' },
    ]).matches.query_loop).toEqual(['card']);
    expect(countStageBEffectiveLinkAffordances(content)).toBe(6);
  });

  it('fails closed when static generated card duplicates remain beside a query-loop template', () => {
    const result = inspectStageBGenerationRequirements([
      { id: 'grid', name: 'block', parent: '', children: ['card1', 'card2'], settings: {} },
      {
        id: 'card1',
        name: 'div',
        parent: 'grid',
        children: ['title1'],
        settings: {
          _cssGlobalClasses: ['post-card'],
          hasLoop: true,
          query: { objectType: 'post', posts_per_page: 6 },
        },
      },
      { id: 'title1', name: 'heading', parent: 'card1', children: [], settings: { _cssGlobalClasses: ['post-card-title'], text: '{post_title}' } },
      {
        id: 'card2',
        name: 'div',
        parent: 'grid',
        children: ['title2'],
        settings: { _cssGlobalClasses: ['post-card'] },
      },
      { id: 'title2', name: 'heading', parent: 'card2', children: [], settings: { _cssGlobalClasses: ['post-card-title'], text: 'Placeholder post' } },
    ], [
      { kind: 'query_loop', minimumMatches: 1, source: 'prompt' },
    ]);

    expect(result.matches.query_loop).toEqual(['card1']);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'stage_b_query_loop_static_template_duplicates',
        severity: 'p0',
      }),
    ]));
  });
});
