import { describe, expect, it } from 'vitest';

import {
  applyStageBRepairSettings,
  dedupeStageBClassAttributesAgainstGlobalClasses,
  enforceStageBSourceClassInventory,
  promoteStageBDirectStylesToClasses,
  preserveStageBBaselineClassStructure,
  shouldWarnStageBReservedButtonClass,
} from '../stage-b-bem-classes.mjs';

describe('Stage B BEM class preservation', () => {
  it('allows source-owned BEM button modifiers while still flagging invented reserved names', () => {
    const sourceNames = ['helio-button', 'helio-button--primary', 'helio-button--secondary'];

    expect(shouldWarnStageBReservedButtonClass('helio-button--primary', sourceNames)).toBe(false);
    expect(shouldWarnStageBReservedButtonClass('helio-button--secondary', sourceNames)).toBe(false);
    expect(shouldWarnStageBReservedButtonClass('pf-stage-b-primary-button', sourceNames)).toBe(true);
    expect(shouldWarnStageBReservedButtonClass('helio-button--accent', sourceNames)).toBe(false);
  });

  it('merges normalized repair settings into an existing BEM class without inventing a class', () => {
    const result = {
      content: [{
        id: 'copy1',
        name: 'div',
        parent: 'section1',
        children: [],
        settings: {
          _cssGlobalClasses: ['hero-copy'],
          _attributes: [{ name: 'class', value: 'brand-hero__copy' }],
        },
      }],
      global_classes: [{
        id: 'hero-copy',
        name: 'brand-hero__copy',
        settings: { _display: 'flex' },
      }],
    };

    applyStageBRepairSettings(
      result.content[0],
      new Map(result.global_classes.map((classItem) => [classItem.id, classItem])),
      {
        _padding: { left: '24px', right: '24px' },
        _typography: { 'font-size': '18px' },
      },
    );

    expect(result.global_classes).toEqual([{
      id: 'hero-copy',
      name: 'brand-hero__copy',
      settings: {
        _display: 'flex',
        _padding: { left: '24px', right: '24px' },
        _typography: { 'font-size': '18px' },
      },
    }]);
    expect(result.content[0].settings._cssGlobalClasses).toEqual(['hero-copy']);
  });

  it('does not turn a repair into ID-level styling on an unclassed structural wrapper', () => {
    const result = {
      content: [{
        id: 'wrapper1',
        name: 'container',
        parent: 'section1',
        children: [],
        settings: {},
      }],
      global_classes: [],
    };

    const outcome = applyStageBRepairSettings(result.content[0], new Map(), {
      _width: '100%',
      _widthMax: '100%',
      _padding: { left: '0', right: '0' },
    });

    expect(result.global_classes).toEqual([]);
    expect(result.content[0].settings).toEqual({});
    expect(outcome).toEqual({ target: 'skipped_unclassed', classId: '' });
  });

  it('never folds an element-specific repair into a shared measured class', () => {
    const measured = { id: 'measured', name: 'pixflow-measured-abc123', settings: { _display: 'block' } };
    const element = {
      id: 'faq-list', name: 'div', parent: '', children: [],
      settings: { _cssGlobalClasses: ['measured'] },
    };

    const outcome = applyStageBRepairSettings(element, new Map([['measured', measured]]), {
      _width: 'auto',
    });

    expect(outcome).toEqual({ target: 'skipped_unclassed', classId: '' });
    expect(measured.settings).toEqual({ _display: 'block' });
  });

  it('promotes element styling into existing BEM classes and discards unclassed ID styling', () => {
    const result = {
      content: [
        {
          id: 'hero1',
          name: 'section',
          parent: '',
          children: [],
          settings: {
            _cssGlobalClasses: ['hero-class'],
            _attributes: [{ name: 'class', value: 'brand-hero' }],
            _display: 'block',
            '_padding:mobile_portrait': { left: '20px', right: '20px' },
          },
        },
        {
          id: 'wrapper1',
          name: 'div',
          parent: 'hero1',
          children: [],
          settings: { _width: 'auto' },
        },
      ],
      global_classes: [{ id: 'hero-class', name: 'brand-hero', settings: { _display: 'flex' } }],
    };

    const summary = promoteStageBDirectStylesToClasses(result);

    expect(result.content[0].settings).toEqual({
      _cssGlobalClasses: ['hero-class'],
      _attributes: [{ name: 'class', value: 'brand-hero' }],
    });
    expect(result.global_classes[0].settings).toEqual({
      _display: 'flex',
      '_padding:mobile_portrait': { left: '20px', right: '20px' },
    });
    expect(result.content[1].settings).toEqual({});
    expect(summary).toMatchObject({
      promotedElementCount: 1,
      promotedSettingCount: 1,
      skippedUnclassedElementCount: 1,
      skippedUnclassedSettingCount: 1,
      discardedDuplicateClassSettingCount: 1,
      movedToDirectSettings: 0,
    });
  });

  it('keeps only source-owned class names and folds helper styling into an existing BEM class', () => {
    const result = {
      content: [
        {
          id: 'copy1',
          name: 'div',
          parent: '',
          children: [],
          settings: {
            _cssGlobalClasses: ['source-copy', 'helper-copy'],
            _attributes: [{ name: 'class', value: 'brand-card__copy' }],
          },
        },
        {
          id: 'plain1',
          name: 'heading',
          parent: 'copy1',
          children: [],
          settings: { _cssGlobalClasses: ['helper-heading'] },
        },
      ],
      global_classes: [
        { id: 'source-copy', name: 'brand-card__copy', settings: { _display: 'grid' } },
        { id: 'helper-copy', name: 'stage-a-card-copy-style', settings: { _rowGap: '12px' } },
        { id: 'helper-heading', name: 'stage-a-h2-type', settings: { _typography: { 'font-size': '32px' } } },
      ],
    };

    const summary = enforceStageBSourceClassInventory(result, ['brand-card__copy']);

    expect(result.global_classes).toEqual([{
      id: 'source-copy',
      name: 'brand-card__copy',
      settings: { _display: 'grid', _rowGap: '12px' },
    }]);
    expect(result.content[0].settings._cssGlobalClasses).toEqual(['source-copy']);
    expect(result.content[1].settings).toEqual({});
    expect(summary).toMatchObject({
      preservedClassCount: 1,
      removedHelperClassCount: 2,
      mergedHelperClasses: 1,
      discardedUnclassedHelperClasses: 1,
    });
  });

  it('keeps three-letter collision-prefixed source classes in the source inventory', () => {
    const result = {
      content: [{
        id: 'hero1',
        name: 'section',
        parent: '',
        children: [],
        settings: { _cssGlobalClasses: ['hero', 'title', 'helper'] },
      }],
      global_classes: [
        { id: 'hero', name: 'aur-hero', settings: { _display: 'block' } },
        { id: 'title', name: 'aur-hero__title', settings: { _typography: { 'font-size': '48px' } } },
        { id: 'helper', name: 'stage-a-section-display', settings: { _padding: { left: '0' } } },
      ],
    };

    enforceStageBSourceClassInventory(result, ['hero', 'hero__title']);

    expect(result.global_classes.map((classItem) => classItem.name)).toEqual([
      'aur-hero',
      'aur-hero__title',
    ]);
    expect(result.content[0].settings._cssGlobalClasses).toEqual(['hero', 'title']);
  });

  it('never lets a converter helper override a setting owned by any source BEM class on the element', () => {
    const result = {
      content: [{
        id: 'card1',
        name: 'div',
        parent: '',
        children: [],
        settings: {
          _cssGlobalClasses: ['card', 'card-emphasis', 'helper'],
          _attributes: [{ name: 'class', value: 'brand-card brand-card--emphasis' }],
        },
      }],
      global_classes: [
        { id: 'card', name: 'brand-card', settings: { _display: 'flex' } },
        { id: 'card-emphasis', name: 'brand-card--emphasis', settings: { _background: { color: 'black' } } },
        { id: 'helper', name: 'stage-a-div-layout', settings: { _display: 'block', _rowGap: '16px' } },
      ],
    };

    const summary = enforceStageBSourceClassInventory(
      result,
      ['brand-card', 'brand-card--emphasis'],
    );

    expect(result.global_classes).toEqual([
      { id: 'card', name: 'brand-card', settings: { _display: 'flex' } },
      {
        id: 'card-emphasis',
        name: 'brand-card--emphasis',
        settings: { _background: { color: 'black' }, _rowGap: '16px' },
      },
    ]);
    expect(summary.discardedConflictingHelperSettings).toBe(1);
  });

  it('removes every class custom attribute after Bricks class references are restored', () => {
    const result = {
      content: [{
        id: 'hero1',
        name: 'section',
        parent: '',
        children: [],
        settings: {
          _cssGlobalClasses: ['hero', 'hero-dark'],
          _attributes: [
            { id: 'class-attr', name: 'class', value: 'brand-hero brand-hero--dark runtime-only' },
            { id: 'label-attr', name: 'aria-label', value: 'Hero' },
          ],
        },
      }],
      global_classes: [
        { id: 'hero', name: 'brand-hero', settings: {} },
        { id: 'hero-dark', name: 'brand-hero--dark', settings: {} },
      ],
    };

    const summary = dedupeStageBClassAttributesAgainstGlobalClasses(result);

    expect(result.content[0].settings._attributes).toEqual([
      { id: 'label-attr', name: 'aria-label', value: 'Hero' },
    ]);
    expect(summary).toEqual({
      applied: true,
      affectedElementCount: 1,
      removedTokenCount: 3,
      preservedRawTokenCount: 0,
    });
  });

  it('restores baseline BEM names and folds model-invented classes into that inventory', () => {
    const baseline = {
      content: [
        {
          id: 'copy1',
          name: 'div',
          parent: 'section1',
          children: [],
          settings: { _cssGlobalClasses: ['hero-copy'] },
        },
        {
          id: 'wrapper1',
          name: 'container',
          parent: 'section1',
          children: [],
          settings: {},
        },
      ],
      global_classes: [{
        id: 'hero-copy',
        name: 'brand-hero__copy',
        settings: { _display: 'flex' },
      }],
    };
    const result = {
      content: [
        {
          id: 'copy1',
          name: 'div',
          parent: 'section1',
          children: [],
          settings: { _cssGlobalClasses: ['hero-copy', 'invented-repair'] },
        },
        {
          id: 'wrapper1',
          name: 'container',
          parent: 'section1',
          children: [],
          settings: { _cssGlobalClasses: ['invented-wrapper'] },
        },
      ],
      global_classes: [
        {
          id: 'hero-copy',
          name: 'model-renamed-copy',
          settings: { _display: 'grid' },
        },
        {
          id: 'invented-repair',
          name: 'pf-stage-b-div-copy1-settings-repair',
          settings: { _padding: { left: '32px', right: '32px' } },
        },
        {
          id: 'invented-wrapper',
          name: 'pf-stage-b-container-wrapper1-settings-repair',
          settings: { _width: '100%', _widthMax: '100%' },
        },
      ],
    };

    const summary = preserveStageBBaselineClassStructure(result, baseline);

    expect(result.global_classes).toEqual([{
      id: 'hero-copy',
      name: 'brand-hero__copy',
      settings: {
        _display: 'grid',
        _padding: { left: '32px', right: '32px' },
      },
    }]);
    expect(result.content[0].settings._cssGlobalClasses).toEqual(['hero-copy']);
    expect(result.content[1].settings).toEqual({});
    expect(summary).toMatchObject({
      applied: true,
      restoredNames: 1,
      removedInventedClasses: 2,
      mergedIntoBaselineClasses: 1,
      movedToDirectSettings: 0,
      skippedUnclassedRepairs: 1,
    });
  });

  it('does not let an invented helper overwrite an authoritative baseline class setting', () => {
    const baseline = {
      content: [{
        id: 'mobile-nav-element',
        settings: { _cssGlobalClasses: ['mobile-nav'] },
      }],
      global_classes: [{
        id: 'mobile-nav',
        name: 'mobile-nav',
        settings: {
          _display: 'none',
          '_display:tablet_portrait': 'flex',
        },
      }],
    };
    const result = {
      content: [{
        id: 'mobile-nav-element',
        settings: { _cssGlobalClasses: ['mobile-nav', 'measured-helper'] },
      }],
      global_classes: [
        structuredClone(baseline.global_classes[0]),
        {
          id: 'measured-helper',
          name: 'pixflow-measured-layout',
          settings: { _display: 'flex', _padding: { left: '0', right: '0' } },
        },
      ],
    };

    preserveStageBBaselineClassStructure(result, baseline);

    expect(result.global_classes).toEqual([{
      id: 'mobile-nav',
      name: 'mobile-nav',
      settings: {
        _display: 'none',
        '_display:tablet_portrait': 'flex',
        _padding: { left: '0', right: '0' },
      },
    }]);
  });

  it('keeps unique ID-selector styling out of reusable source utility classes', () => {
    const result = {
      content: [{
        id: 'menu1',
        name: 'div',
        parent: '',
        children: [],
        settings: {
          _cssGlobalClasses: ['hidden-class', 'menu-id-class'],
          _attributes: [
            { name: 'id', value: 'nav-services-list' },
            { name: 'class', value: 'd-none' },
          ],
          _top: '100%',
          _width: '1168px',
          _opacity: '0',
        },
      }],
      global_classes: [
        { id: 'hidden-class', name: 'ilt-d-none', settings: { _display: 'none' } },
        { id: 'menu-id-class', name: 'pixflow-source-id-nav-services-list', settings: {} },
      ],
    };

    promoteStageBDirectStylesToClasses(result);

    expect(result.global_classes[0].settings).toEqual({ _display: 'none' });
    expect(result.global_classes[1].settings).toEqual({
      _top: '100%',
      _width: '1168px',
      _opacity: '0',
    });
  });

  it('preserves a matching source ID-selector class instead of folding it into a utility class', () => {
    const baselineResult = {
      content: [{
        id: 'menu1',
        name: 'div',
        parent: '',
        children: [],
        settings: {
          _cssGlobalClasses: ['hidden-class'],
          _attributes: [
            { name: 'id', value: 'nav-services-list' },
            { name: 'class', value: 'd-none' },
          ],
        },
      }],
      global_classes: [{ id: 'hidden-class', name: 'ilt-d-none', settings: { _display: 'none' } }],
    };
    const result = structuredClone(baselineResult) as any;
    result.global_classes.push({
      id: 'menu-id-class',
      name: 'pixflow-source-id-nav-services-list',
      settings: { _top: '100%', _width: '1168px', _opacity: '0' },
    });
    result.content[0].settings._cssGlobalClasses.push('menu-id-class');

    const summary = preserveStageBBaselineClassStructure(result, baselineResult);

    expect(result.global_classes[0].settings).toEqual({ _display: 'none' });
    expect(result.global_classes[1]).toEqual({
      id: 'menu-id-class',
      name: 'pixflow-source-id-nav-services-list',
      settings: { _top: '100%', _width: '1168px', _opacity: '0' },
    });
    expect(result.content[0].settings._cssGlobalClasses).toEqual(['hidden-class', 'menu-id-class']);
    expect(summary).toMatchObject({ preservedSourceIdClassCount: 1, mergedIntoBaselineClasses: 0 });
  });

  it('preserves deterministic baseline helpers while removing later invented helpers', () => {
    const baselineResult = {
      content: [{
        id: 'copy',
        settings: { _cssGlobalClasses: ['source-copy', 'baseline-helper'] },
      }],
      global_classes: [
        { id: 'source-copy', name: 'copy', settings: { _display: 'block' } },
        { id: 'baseline-helper', name: 'stage-a-copy-p-style', settings: { _widthMax: '44ch' } },
      ],
    };
    const result = {
      content: [{
        id: 'copy',
        settings: { _cssGlobalClasses: ['source-copy', 'baseline-helper', 'invented-helper'] },
      }],
      global_classes: [
        ...baselineResult.global_classes.map((classItem) => structuredClone(classItem)),
        { id: 'invented-helper', name: 'stage-b-invented-copy', settings: { _rowGap: '12px' } },
      ],
    };

    const summary = enforceStageBSourceClassInventory(result, ['copy'], { baselineResult });

    expect(result.global_classes.map((classItem) => classItem.id)).toEqual([
      'source-copy',
      'baseline-helper',
    ]);
    expect(result.content[0].settings._cssGlobalClasses).toEqual([
      'source-copy',
      'baseline-helper',
    ]);
    expect(summary).toMatchObject({
      baselineClassCount: 2,
      preservedBaselineHelperClassCount: 1,
      removedHelperClassCount: 1,
    });
  });

  it.each(['baseline', 'source'])('keeps only actively derived inheritance helpers during %s cleanup', (cleanup) => {
    const baselineResult = {
      content: [{ id: 'copy', settings: { _cssGlobalClasses: ['source-copy'] } }],
      global_classes: [{ id: 'source-copy', name: 'copy', settings: { _display: 'block' } }],
    };
    const result = {
      content: [{ id: 'copy', settings: { _cssGlobalClasses: ['source-copy', 'derived', 'forged'] } }],
      global_classes: [
        ...structuredClone(baselineResult.global_classes),
        { id: 'derived', name: 'pixflow-inherited-foreground-derived', settings: { _typography: { color: { raw: '#fff' } } } },
        { id: 'forged', name: 'pixflow-inherited-foreground-forged', settings: { _typography: { color: { raw: '#123456' } }, _width: '999px' } },
      ],
    };
    const options = { baselineResult, compilerClassIds: ['derived'] };

    if (cleanup === 'baseline') preserveStageBBaselineClassStructure(result, baselineResult, options);
    else enforceStageBSourceClassInventory(result, ['copy'], options);

    expect(result.global_classes.map((entry) => entry.id)).toEqual(['source-copy', 'derived']);
    expect(result.content[0].settings._cssGlobalClasses).toEqual(['source-copy', 'derived']);
    expect(result.global_classes[0].settings).toEqual({ _display: 'block' });
    expect(result.global_classes[1].settings).toEqual({ _typography: { color: { raw: '#fff' } } });
  });
});
