import { describe, expect, it } from 'vitest';

import { applyStageBGeneratedCapabilityRequirements } from '../bricks-handoff-cli.mjs';

function card(id: string, date: string, title: string, excerpt: string) {
  const imageId = `${id}-image`;
  const metaId = `${id}-meta`;
  const headingId = `${id}-heading`;
  const excerptId = `${id}-excerpt`;
  const linkId = `${id}-link`;
  return [
    {
      id,
      name: 'block',
      parent: 'grid',
      settings: { tag: 'article', _cssGlobalClasses: ['post-card'] },
      children: [imageId, metaId, headingId, excerptId, linkId],
    },
    {
      id: imageId,
      name: 'div',
      parent: id,
      settings: { _attributes: [{ id: `${id}-role`, name: 'role', value: 'img' }] },
      children: [],
    },
    { id: metaId, name: 'text-basic', parent: id, settings: { tag: 'span', text: date }, children: [] },
    { id: headingId, name: 'heading', parent: id, settings: { tag: 'h3', text: title }, children: [] },
    { id: excerptId, name: 'text-basic', parent: id, settings: { tag: 'p', text: excerpt }, children: [] },
    { id: linkId, name: 'button', parent: id, settings: { text: 'Read the note', link: { type: 'external', url: '#' } }, children: [] },
  ];
}

describe('generated capability baseline repair', () => {
  it('turns repeated static blog cards into one native post loop with dynamic bindings', () => {
    const baseline = {
      content: [
        { id: 'section', name: 'section', settings: {}, children: ['grid'] },
        { id: 'grid', name: 'block', parent: 'section', settings: {}, children: ['card-a', 'card-b', 'card-c'] },
        ...card('card-a', 'May 28, 2026', 'First note', 'A useful first note with enough copy to identify the excerpt field.'),
        ...card('card-b', 'May 14, 2026', 'Second note', 'A useful second note with enough copy to identify the excerpt field.'),
        ...card('card-c', 'Apr 30, 2026', 'Third note', 'A useful third note with enough copy to identify the excerpt field.'),
      ],
    };

    const repair = applyStageBGeneratedCapabilityRequirements(baseline, {
      generationPrompt: 'show the latest three posts with the post title, excerpt, date and featured image',
      generationRequirements: [
        { kind: 'query_loop', minimumMatches: 1, source: 'prompt' },
        { kind: 'dynamic_data', minimumMatches: 1, source: 'prompt' },
      ],
    });

    const loop = baseline.content.find((element) => element.id === 'card-a');
    expect(repair.applied).toBe(true);
    expect(repair.loopElementId).toBe('card-a');
    expect(loop?.settings.hasLoop).toBe(true);
    expect(loop?.settings.query).toMatchObject({
      objectType: 'post',
      post_type: ['post'],
      posts_per_page: 3,
      orderby: 'date',
      order: 'DESC',
    });
    expect(baseline.content.some((element) => element.id === 'card-b')).toBe(false);
    expect(baseline.content.some((element) => element.id === 'card-c')).toBe(false);
    expect(baseline.content.find((element) => element.id === 'card-a-heading')?.settings.text).toBe('{post_title}');
    expect(baseline.content.find((element) => element.id === 'card-a-excerpt')?.settings.text).toBe('{post_excerpt}');
    expect(baseline.content.find((element) => element.id === 'card-a-meta')?.settings.text).toBe('{post_date}');
    expect(baseline.content.find((element) => element.id === 'card-a-link')?.settings.link).toMatchObject({
      type: 'meta',
      useDynamicData: '{post_url}',
    });
    expect(baseline.content.find((element) => element.id === 'card-a-image')?.name).toBe('image');
    expect(baseline.content.find((element) => element.id === 'card-a-image')?.settings.image).toMatchObject({
      useDynamicData: '{featured_image}',
    });
  });
});
