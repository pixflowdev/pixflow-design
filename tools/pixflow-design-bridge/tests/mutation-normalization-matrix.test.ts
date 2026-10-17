import { describe, expect, it } from 'vitest';

import {
  bricksMutationSkillBundle,
  buildStructuredCodePatchModelResult,
  buildStructuredCompoundPatchModelResult,
  buildStructuredConditionPatchModelResult,
  buildStructuredDynamicDataPatchModelResult,
  buildStructuredLinkPatchModelResult,
  buildStructuredQueryLoopPatchModelResult,
  normalizeBricksAgentMutationPlan,
} from '../bricks-agent/mutation-planner.mjs';
import { normalizeQuickTextEditResult } from '../bricks-handoff-cli.mjs';

const codeRuntimeContext = {
  knowledge: {
    codeElementSchema: {
      capabilities: {
        canExecuteCode: true,
        canReadSensitiveCode: true,
        nativeSavePipeline: true,
      },
    },
  },
};

describe('Bricks allowlisted mutation normalization matrix', () => {
  it.each([
    ['query', { action: 'query_loop', patches: [{ id: 'loop-1', settings: { hasLoop: true, query: { objectType: 'post' } } }] }, 'query-loops', 'bricks-query-loops'],
    ['dynamic', { action: 'dynamic_data', patches: [{ id: 'title-1', settings: { text: '{post_title}' } }] }, 'dynamic-data', 'bricks-dynamic-data'],
    ['condition', { action: 'condition', patches: [{ id: 'hero-1', settings: { _conditions: [[{ key: 'user_logged_in' }]] } }] }, 'bricks-conditions', 'bricks-element-conditions'],
    ['form', { action: 'form_update', patches: [{ id: 'form-1', settings: { formFields: [] } }] }, 'bricks-forms', 'bricks-forms'],
    ['code', { action: 'code_update', elements: [{ name: 'code', settings: { javascriptCode: 'window.ready = true;' } }] }, 'custom-code', 'bricks-custom-code'],
    ['interaction', { action: 'interaction_update', patches: [{ id: 'hero-1', settings: { _interactions: [] } }] }, 'bricks-interactions', 'bricks-interactions'],
    ['media', { action: 'media_update', patches: [{ id: 'hero-1', settings: { image: { id: 55 } } }] }, 'bricks-elements-media', 'bricks-media'],
    ['text', { action: 'patch', patches: [{ id: 'heading-1', settings: { text: 'New headline' } }] }, 'bricks-elements-text', 'bricks-element-schemas'],
    ['layout', { action: 'patch', patches: [{ id: 'container-1', settings: { _padding: { top: '1rem' } } }] }, 'bricks-controls-layout', 'bricks-breakpoints'],
  ])('attaches deterministic Pixflow and native evidence for %s operations', (_kind, operation, pixflowId, nativeId) => {
    const bundle = bricksMutationSkillBundle(operation);
    expect(bundle.skillIds).toContain(pixflowId);
    expect(bundle.nativeSkillIds).toContain(nativeId);
    expect(bundle.nativeAbilityRoutes.length).toBeGreaterThan(0);
  });

  it.each([
    ['text', 'text', 'Updated copy'],
    ['button_text', 'label', 'Submit'],
    ['heading_level', 'tag', 'h2'],
    ['button_option', 'style', 'primary'],
    ['link', 'link', { type: 'external', url: 'https://example.com', newTab: true }],
    ['media', 'image', { id: 55, url: 'https://example.com/image.jpg', size: 'large' }],
    ['icon', 'icon', { library: 'fontawesomeSolid', icon: 'fas fa-arrow-right' }],
    ['form', 'formActions', [{ action: 'email', email: 'site@example.com' }]],
    ['typography', '_typography', { 'font-size': '2rem', 'font-weight': '700' }],
    ['layout', '_padding', { top: '2rem', right: '1rem', bottom: '2rem', left: '1rem' }],
    ['attributes', '_attributes', [{ name: 'data-pixflow-toggle', value: 'details' }]],
    ['code_javascript', 'javascriptCode', 'window.pixflowTest = true;'],
    ['code_css', 'cssCode', '.pixflow-test { display: block; }'],
  ])('normalizes %s %s into one canonical id/settings patch', (targetKind, fieldKey, value) => {
    const elementId = `target-${String(targetKind).replace(/_/g, '-')}`;
    const target = {
      elementId,
      fieldKey,
      targetKind,
      targetLabel: `${targetKind} target`,
      currentText: typeof value === 'string' ? 'Current value' : undefined,
      currentVisibleText: typeof value === 'string' ? 'Current value' : undefined,
      valuePreview: typeof value === 'string' ? value : JSON.stringify(value),
    };
    const request = {
      targets: targetKind === 'text' || targetKind === 'button_text' ? [target] : [],
      editableOptionTargets: targetKind === 'text' || targetKind === 'button_text' ? [] : [target],
      mcpRuntimeContext: codeRuntimeContext,
    };

    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: `${targetKind}_update`,
      patches: [{ elementId, fieldKey, value }],
    }, request).patches).toEqual([expect.objectContaining({
      id: elementId,
      fieldKey,
      settings: fieldKey === '_attributes'
        ? { _attributes: [{ id: 'pxf001', name: 'data-pixflow-toggle', value: 'details' }] }
        : { [fieldKey]: value },
    })]);
  });

  it('normalizes conditions, query loops, and layout companion fields canonically', () => {
    const optionTargets = [
      { elementId: 'condition-1', fieldKey: '_conditions', targetKind: 'conditions', targetLabel: 'Conditional element' },
      { elementId: 'loop-1', fieldKey: 'hasLoop', targetKind: 'query_loop', targetLabel: 'Posts grid' },
      { elementId: 'loop-1', fieldKey: 'query', targetKind: 'query_loop', targetLabel: 'Posts grid' },
      { elementId: 'layout-1', fieldKey: '_direction', targetKind: 'layout', targetLabel: 'Container' },
      { elementId: 'layout-1', fieldKey: '_display', targetKind: 'layout', targetLabel: 'Container' },
    ];

    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: 'element_condition_update',
      patches: [{
        elementId: 'condition-1',
        fieldKey: '_conditions',
        value: [[{ key: 'user_logged_in', compare: '==', value: '1' }]],
      }],
    }, { editableOptionTargets: optionTargets }).patches).toEqual([
      expect.objectContaining({
        id: 'condition-1',
        fieldKey: '_conditions',
        settings: {
          _conditions: [[expect.objectContaining({
            key: 'user_logged_in',
            compare: '==',
            value: '1',
          })]],
        },
      }),
    ]);

    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: 'query_loop_update',
      patches: [
        { elementId: 'loop-1', fieldKey: 'hasLoop', value: true },
        {
          elementId: 'loop-1',
          fieldKey: 'query',
          value: {
            objectType: 'post',
            post_type: ['post'],
            posts_per_page: 6,
            orderby: 'date',
            order: 'DESC',
          },
        },
      ],
    }, { editableOptionTargets: optionTargets }).patches).toEqual([
      expect.objectContaining({ id: 'loop-1', settings: { hasLoop: true } }),
      expect.objectContaining({
        id: 'loop-1',
        settings: {
          query: {
            objectType: 'post',
            post_type: ['post'],
            posts_per_page: 6,
            orderby: 'date',
            order: 'DESC',
          },
        },
      }),
    ]);

    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: 'layout_settings_update',
      patches: [{ elementId: 'layout-1', fieldKey: '_direction', value: 'row' }],
    }, { editableOptionTargets: optionTargets }).patches).toEqual([
      expect.objectContaining({
        id: 'layout-1',
        fieldKey: '_direction',
        settings: { _direction: 'row', _display: 'flex' },
      }),
    ]);
  });

  it('normalizes native interactions against the Bricks trigger/action/target schema', () => {
    const target = {
      elementId: 'button-1',
      fieldKey: '_interactions',
      targetKind: 'interactions',
      targetLabel: 'CTA',
      valuePreview: '[]',
    };
    const request = { editableOptionTargets: [target] };

    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: 'interaction_update',
      patches: [{
        elementId: 'button-1',
        fieldKey: '_interactions',
        value: [{
          trigger: 'click',
          action: 'toggleAttribute',
          target: 'custom',
          targetSelector: '#brxe-hero01',
          actionAttributeKey: 'class',
          actionAttributeValue: 'is-active',
        }],
      }],
    }, request).patches).toEqual([
      expect.objectContaining({
        id: 'button-1',
        fieldKey: '_interactions',
        settings: {
          _interactions: [expect.objectContaining({
            id: expect.stringMatching(/^[a-z0-9]{6}$/),
            trigger: 'click',
            action: 'toggleAttribute',
            target: 'custom',
            targetSelector: '#brxe-hero01',
            actionAttributeKey: 'class',
            actionAttributeValue: 'is-active',
          })],
        },
      }),
    ]);

    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: 'interaction_update',
      patches: [{
        elementId: 'button-1',
        fieldKey: '_interactions',
        value: [{
          trigger: 'click',
          action: 'inventedAction',
          target: 'custom',
          targetSelector: '#brxe-hero01',
        }],
      }],
    }, request).patches).toEqual([]);
  });

  it('fails closed for unknown fields and never returns a raw model patch shape', () => {
    const target = {
      elementId: 'button-1',
      fieldKey: 'label',
      targetKind: 'button_text',
      targetLabel: 'CTA',
      currentText: 'Buy',
      currentVisibleText: 'Buy',
    };
    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{ elementId: 'button-1', fieldKey: 'invented', value: 'Unsafe' }],
    }, { targets: [target] }).patches).toEqual([]);

    const patches = normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{ elementId: 'button-1', fieldKey: 'label', value: 'Safe' }],
    }, { targets: [target] }).patches;
    expect(patches[0]).not.toHaveProperty('elementId');
    expect(patches[0]).not.toHaveProperty('value');
    expect(patches[0]).toMatchObject({ id: 'button-1', settings: { label: 'Safe' } });
  });

  it('passes ordinary and stale model-led native settings to Bricks for native repair', () => {
    const request = {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [{ id: 'container-1', name: 'container', settings: {} }],
      },
    };
    const patches = normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{
        elementId: 'container-1',
        fieldKey: '_nativeFutureSetting',
        value: { enabled: true },
      }],
    }, request).patches;

    expect(patches).toEqual([expect.objectContaining({
      id: 'container-1',
      settings: { _nativeFutureSetting: { enabled: true } },
    })]);
    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{ elementId: 'not-live', fieldKey: '_nativeFutureSetting', value: true }],
    }, request).patches).toEqual([expect.objectContaining({
      id: 'not-live',
      settings: { _nativeFutureSetting: true },
    })]);
  });

  it('normalizes a compound mutation across different targets and native action types', () => {
    const request = {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [
          { id: 'hero-title', name: 'heading', settings: { text: 'Old' } },
          { id: 'hero-card', name: 'container', settings: {} },
        ],
      },
    };
    const result = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [
        {
          opId: 'title-copy',
          action: 'patch',
          patches: [{ id: 'hero-title', settings: { text: 'New' } }],
          skillIds: ['bricks-text'],
        },
        {
          opId: 'card-code',
          action: 'insert',
          elements: [{ name: 'code', settings: { javascriptCode: 'window.pixflowReady = true;', executeCode: true } }],
          position: { mode: 'append_to', targetId: 'hero-card' },
          skillIds: ['bricks-code'],
        },
      ],
    }, request);

    expect(result).toMatchObject({
      action: 'compound_mutation',
      mutationType: 'compound_bricks_mutation',
      operationCount: 2,
    });
    expect(result.operations).toHaveLength(2);
    expect(result.operations[0]).toMatchObject({
      opId: 'title-copy',
      operation: 'patch',
      patches: [{ id: 'hero-title', settings: { text: 'New' } }],
      skillIds: expect.arrayContaining(['bricks-elements-text']),
      nativeSkillIds: expect.arrayContaining(['bricks-element-schemas']),
      nativeAbilityRoutes: expect.arrayContaining(['bricks/get-element-schema']),
    });
    expect(result.operations[1]).toMatchObject({
      opId: 'card-code',
      operation: 'insert',
      position: { mode: 'append_to', targetId: 'hero-card' },
      skillIds: expect.arrayContaining(['bricks-elements-code']),
      nativeSkillIds: expect.arrayContaining(['bricks-custom-code']),
      nativeAbilityRoutes: expect.arrayContaining(['bricks/get-page-settings']),
    });
    expect(result.skillIds).toEqual(expect.arrayContaining(['bricks-elements-text', 'bricks-elements-code']));
    expect(result.nativeSkillIds).toEqual(expect.arrayContaining(['bricks-element-schemas', 'bricks-custom-code']));
    expect(result.nativeAbilityRoutes).toEqual(expect.arrayContaining(['bricks/get-element-schema', 'bricks/get-page-settings']));
    expect(result.operations[1].elements[0]).not.toHaveProperty('id');
  });

  it('preserves nested model-led insert trees so native Bricks can generate their ids', () => {
    const result = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{
        opId: 'append-card',
        action: 'insert',
        elements: [{
          name: 'div',
          label: 'Feature card 04',
          settings: {},
          children: [
            { name: 'text-basic', settings: { text: '04' }, children: [] },
            { name: 'text-basic', settings: { text: 'Know which clients need attention' }, children: [] },
            { name: 'text-basic', settings: { text: 'Act before delayed invoices compound.' }, children: [] },
          ],
        }],
        position: { mode: 'append_to', targetId: 'cards1' },
      }],
    }, {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'cards1', name: 'div', settings: {} }] },
    });

    expect(result?.operations).toEqual([
      expect.objectContaining({
        opId: 'append-card',
        operation: 'insert',
        position: { mode: 'append_to', targetId: 'cards1' },
        elements: [{
          name: 'div',
          label: 'Feature card 04',
          settings: {},
          children: [
            { name: 'text-basic', settings: { text: '04' }, children: [] },
            { name: 'text-basic', settings: { text: 'Know which clients need attention' }, children: [] },
            { name: 'text-basic', settings: { text: 'Act before delayed invoices compound.' }, children: [] },
          ],
        }],
      }),
    ]);
    expect(result?.operations[0].elements[0]).not.toHaveProperty('id');
    expect(result?.operations[0].elements[0]).not.toHaveProperty('parent');
    expect(result?.operations[0].elements[0].children[0]).not.toHaveProperty('id');
  });

  it('carries a generated image request through a media patch without exposing provider credentials', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'media_update',
      mediaGenerations: [{
        token: 'hero-generated',
        surface: 'image',
        prompt: 'A calm blue architectural hero image at dawn.',
        providerId: 'nanobanana',
        model: 'gemini-3.1-flash-image-preview',
        aspect: '16:9',
        apiKey: 'must-not-cross-the-bridge',
      }],
      patches: [{
        elementId: 'hero-image',
        settings: { image: { generatedMediaToken: 'hero-generated' } },
      }],
      answer: 'I prepared a generated hero image for the selected image element.',
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'hero-image', name: 'image' }] },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'patch',
      mutationType: 'media_update',
      mediaGenerations: [{
        token: 'hero-generated',
        surface: 'image',
        providerId: 'nanobanana',
        model: 'gemini-3.1-flash-image-preview',
        aspect: '16:9',
      }],
      patches: [{
        id: 'hero-image',
        settings: { image: { generatedMediaToken: 'hero-generated' } },
      }],
    });
    expect(JSON.stringify(normalized)).not.toContain('must-not-cross-the-bridge');
  });

  it('carries a generated video request through the native Bricks media setting', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'media_update',
      mediaGenerations: [{
        token: 'hero-video',
        surface: 'video',
        prompt: 'A short cinematic product video of a cobalt blue desk lamp turning slowly.',
        providerId: 'nanobanana',
        model: 'veo-3.1-fast-generate-preview',
        aspect: '16:9',
        length: 5,
      }],
      patches: [{
        elementId: 'hero-video',
        settings: { videoType: 'media', media: { generatedMediaToken: 'hero-video' } },
      }],
      answer: 'I prepared a generated video for the selected video element.',
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'hero-video', name: 'video' }] },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'patch',
      mutationType: 'media_update',
      mediaGenerations: [{
        token: 'hero-video',
        surface: 'video',
        providerId: 'nanobanana',
        model: 'veo-3.1-fast-generate-preview',
        length: 5,
      }],
      patches: [{
        id: 'hero-video',
        settings: { videoType: 'media', media: { generatedMediaToken: 'hero-video' } },
      }],
    });
  });

  it('keeps generated media attached to a compound insert and patch transaction', () => {
    const result = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      mediaGenerations: [{ token: 'feature-image', prompt: 'A soft editorial product photo of a glass prism.' }],
      operations: [
        {
          opId: 'insert-section',
          action: 'insert',
          elements: [{
            id: 'feature-section',
            name: 'container',
            settings: {},
          }],
          position: { mode: 'append' },
        },
        {
          opId: 'bind-image',
          action: 'patch',
          patches: [{
            id: 'feature-image',
            settings: { image: { generatedMediaToken: 'feature-image' } },
          }],
        },
      ],
    }, {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [] },
    });

    expect(result).toMatchObject({
      operationCount: 2,
      mediaGenerations: [{ token: 'feature-image', surface: 'image' }],
      operations: [
        { opId: 'insert-section', operation: 'insert' },
        { opId: 'bind-image', operation: 'patch' },
      ],
    });
  });

  it('keeps one-operation and malformed model-led compounds on the native repair path', () => {
    const request = {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [{ id: 'hero-title', name: 'heading', settings: { text: 'Old' } }],
      },
    };

    const oneOperation = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{
        opId: 'future-native',
        action: 'future_native_setting_update',
        targetId: 'hero-title',
        settings: { _futureNativeSetting: { enabled: true } },
      }],
    }, request);
    expect(oneOperation).toMatchObject({
      action: 'compound_mutation',
      operationCount: 1,
      operations: [{
        opId: 'future-native',
        operation: 'future_native_setting_update',
      }],
    });

    const malformedPatch = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{
        opId: 'malformed-patch',
        action: 'patch',
        patches: [{ id: '', settings: {} }],
      }],
    }, request);
    expect(malformedPatch?.operations).toEqual([
      expect.objectContaining({
        opId: 'malformed-patch',
        operation: 'patch',
        patches: [{ id: '', settings: {} }],
      }),
    ]);

    const malformedInsert = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{
        opId: 'malformed-insert',
        action: 'insert',
        elements: [{ settings: { _futureNativeControl: true } }],
      }],
    }, request);
    expect(malformedInsert?.operations).toEqual([
      expect.objectContaining({
        opId: 'malformed-insert',
        operation: 'insert',
        elements: [expect.objectContaining({ settings: { _futureNativeControl: true } })],
      }),
    ]);
    expect(malformedInsert?.operations[0].elements[0]).not.toHaveProperty('id');

    const malformedSet = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{ opId: 'malformed-set', action: 'set', elements: [] }],
    }, request);
    expect(malformedSet?.operations).toEqual([
      expect.objectContaining({ opId: 'malformed-set', operation: 'set', elements: [] }),
    ]);

    const malformedReorder = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{ opId: 'malformed-reorder', action: 'reorder', orderedIds: [] }],
    }, request);
    expect(malformedReorder?.operations).toEqual([
      expect.objectContaining({ opId: 'malformed-reorder', operation: 'reorder', orderedIds: [] }),
    ]);
  });

  it('normalizes multiple targets for each typed native capability in one Design turn', () => {
    const request = {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [
          { id: 'code-1', name: 'code', settings: {} },
          { id: 'code-2', name: 'code', settings: {} },
          { id: 'condition-1', name: 'div', settings: {} },
          { id: 'condition-2', name: 'div', settings: {} },
          { id: 'loop-1', name: 'container', settings: {} },
          { id: 'loop-2', name: 'container', settings: {} },
          { id: 'title-1', name: 'heading', settings: {} },
          { id: 'title-2', name: 'heading', settings: {} },
          { id: 'link-1', name: 'button', settings: {} },
          { id: 'link-2', name: 'button', settings: {} },
        ],
      },
      editableOptionTargets: [
        { elementId: 'code-1', fieldKey: 'javascriptCode', targetKind: 'code_javascript', targetLabel: 'Code one' },
        { elementId: 'code-2', fieldKey: 'javascriptCode', targetKind: 'code_javascript', targetLabel: 'Code two' },
        { elementId: 'code-1', fieldKey: '_attributes', targetKind: 'attributes', targetLabel: 'Code one attributes', valuePreview: '[]' },
        { elementId: 'condition-1', fieldKey: '_conditions', targetKind: 'conditions', valuePreview: '[]' },
        { elementId: 'condition-2', fieldKey: '_conditions', targetKind: 'conditions', valuePreview: '[]' },
        { elementId: 'loop-1', fieldKey: 'hasLoop', targetKind: 'query_loop' },
        { elementId: 'loop-1', fieldKey: 'query', targetKind: 'query_loop' },
        { elementId: 'loop-2', fieldKey: 'hasLoop', targetKind: 'query_loop' },
        { elementId: 'loop-2', fieldKey: 'query', targetKind: 'query_loop' },
        { elementId: 'title-1', fieldKey: 'text', targetKind: 'text' },
        { elementId: 'title-2', fieldKey: 'text', targetKind: 'text' },
        { elementId: 'link-1', fieldKey: 'link', targetKind: 'link', valuePreview: '{}' },
        { elementId: 'link-2', fieldKey: 'link', targetKind: 'link', valuePreview: '{}' },
      ],
      mcpRuntimeContext: {
        ...codeRuntimeContext,
        knowledge: {
          ...codeRuntimeContext.knowledge,
          dynamicTags: [{ tag: 'post_title', runtimeAvailable: true, returns: 'text' }],
        },
      },
    };
    const query = {
      objectType: 'post',
      post_type: ['post'],
      posts_per_page: 3,
      orderby: 'date',
      order: 'DESC',
    };
    expect(buildStructuredCodePatchModelResult({
      action: 'code_update',
      targets: [
        {
          targetId: 'code-1',
          fieldKey: 'javascriptCode',
          source: 'window.one = true;',
          attributeBindings: [
            { elementId: 'code-1', name: 'data-one', value: '1' },
            { elementId: 'code-1', name: 'data-two', value: '2' },
          ],
        },
        { targetId: 'code-2', fieldKey: 'javascriptCode', source: 'window.two = true;' },
      ],
    }, request)?.patches).toHaveLength(3);
    const codeAttributePatch = buildStructuredCodePatchModelResult({
      action: 'code_update',
      targets: [{
        targetId: 'code-1',
        fieldKey: 'javascriptCode',
        source: 'window.one = true;',
        attributeBindings: [
          { elementId: 'code-1', name: 'data-one', value: '1' },
          { elementId: 'code-1', name: 'data-two', value: '2' },
        ],
      }],
    }, request)?.patches.find((patch) => patch.fieldKey === '_attributes');
    expect(codeAttributePatch?.value).toEqual([
      { id: expect.stringMatching(/^pxf[a-z0-9]{6}$/), name: 'data-one', value: '1' },
      { id: expect.stringMatching(/^pxf[a-z0-9]{6}$/), name: 'data-two', value: '2' },
    ]);
    expect(buildStructuredConditionPatchModelResult({
      action: 'condition',
      targets: [
        { targetId: 'condition-1', conditionGroups: [[{ key: 'user_logged_in', operator: '==', value: '1' }]] },
        { targetId: 'condition-2', conditionGroups: [[{ key: 'user_logged_in', operator: '==', value: '1' }]] },
      ],
    }, request)?.patches).toHaveLength(2);
    expect(buildStructuredQueryLoopPatchModelResult({
      action: 'query_loop',
      targets: [
        { targetId: 'loop-1', query },
        { targetId: 'loop-2', query },
      ],
    }, request)?.patches).toHaveLength(4);
    expect(buildStructuredDynamicDataPatchModelResult({
      action: 'dynamic_data',
      targets: [
        { targetId: 'title-1', fieldKey: 'text', expression: '{post_title}' },
        { targetId: 'title-2', fieldKey: 'text', expression: '{post_title}' },
      ],
    }, request)?.patches).toHaveLength(2);
    expect(buildStructuredLinkPatchModelResult({
      action: 'link_update',
      targets: [
        { targetId: 'link-1', value: { type: 'external', url: 'https://example.com/one' } },
        { targetId: 'link-2', value: { type: 'external', url: 'https://example.com/two' } },
      ],
    }, request)?.patches).toHaveLength(2);
  });

  it('keeps native form/interaction actions multi-target and can patch an element created earlier in the same compound', () => {
    const request = {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [
          { id: 'form-1', name: 'form', settings: {} },
          { id: 'hero-1', name: 'div', settings: {} },
        ],
      },
      editableOptionTargets: [
        { elementId: 'form-1', fieldKey: 'formFields', targetKind: 'form' },
        { elementId: 'hero-1', fieldKey: '_interactions', targetKind: 'interactions' },
      ],
    };
    const result = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [
        {
          opId: 'form-settings',
          action: 'form_update',
          targets: [{ targetId: 'form-1', settings: { formFields: [{ type: 'email', label: 'Email' }] } }],
        },
        {
          opId: 'interaction-settings',
          action: 'interaction_update',
          patches: [{ id: 'hero-1', settings: { _interactions: [] } }],
        },
        {
          opId: 'insert-code',
          action: 'insert',
          elements: [{ id: 'code-new', name: 'code', settings: { javascriptCode: 'window.ready = true;' } }],
          position: { mode: 'append' },
        },
        {
          opId: 'code-attributes',
          action: 'attribute_update',
          targets: [{ targetId: 'code-new', settings: { _attributes: [{ name: 'data-ready', value: '1' }] } }],
        },
      ],
    }, request);

    expect(result?.operations).toHaveLength(4);
    expect(result?.operations?.[0]).toMatchObject({
      opId: 'form-settings',
      operation: 'patch',
      patches: [{ id: 'form-1', settings: { formFields: [{ type: 'email', label: 'Email' }] } }],
    });
    expect(result?.operations?.[1]).toMatchObject({
      opId: 'interaction-settings',
      operation: 'patch',
      patches: [{ id: 'hero-1', settings: { _interactions: [] } }],
    });
    expect(result?.operations?.[3]).toMatchObject({
      opId: 'code-attributes',
      operation: 'patch',
      patches: [{ id: 'code-new', settings: { _attributes: [{ name: 'data-ready', value: '1' }] } }],
    });
  });

  it('lets a model-led generic update carry multiple native settings on multiple targets', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'update',
      targets: [
        { targetId: 'hero-1', settings: { _padding: { top: '4rem' } } },
        { targetId: 'card-1', settings: { _borderRadius: '1rem' } },
      ],
      answer: 'Updated the selected Bricks elements.',
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'hero-1' }, { id: 'card-1' }] },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'patch',
      patches: [
        { id: 'hero-1', settings: { _padding: { top: '4rem' } } },
        { id: 'card-1', settings: { _borderRadius: '1rem' } },
      ],
    });
  });

  it('turns a generic model-led mutation with mixed operations into one compound action', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'mutate',
      operations: [
        { opId: 'patch-heading', action: 'patch', patches: [{ id: 'heading-1', settings: { text: 'New heading' } }] },
        { opId: 'move-card', action: 'reorder', orderedIds: ['card-1', 'heading-1'] },
      ],
      answer: 'Applied the requested changes.',
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'heading-1' }, { id: 'card-1' }] },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'compound_mutation',
      operationCount: 2,
      operations: [
        { opId: 'patch-heading', operation: 'patch' },
        { opId: 'move-card', operation: 'reorder', orderedIds: ['card-1', 'heading-1'] },
      ],
    });
  });

  it('keeps an explicit full-page clear as a dedicated atomic operation', () => {
    const request = {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'page-section', name: 'section', settings: {} }] },
    };
    const compound = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{ opId: 'clear-page-content', action: 'clear', clear: true }],
    }, request);
    expect(compound?.operations).toEqual([
      expect.objectContaining({ opId: 'clear-page-content', operation: 'clear', clear: true }),
    ]);

    const normalized = normalizeQuickTextEditResult({
      action: 'clear',
      clear: true,
      answer: 'I will remove all page content.',
    }, request);
    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'compound_mutation',
      mutationType: 'bricks_content_clear',
      operations: [expect.objectContaining({ operation: 'clear', clear: true })],
    });
  });

  it('preserves an agent-owned cross-parent move as an explicit reparent operation', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'move',
      orderedIds: ['image-1', 'paragraph-1'],
      parentId: 'media-wrap',
      answer: 'Moved the paragraph below the image.',
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'image-1' }, { id: 'paragraph-1' }, { id: 'media-wrap' }] },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'reorder',
      orderedIds: ['image-1', 'paragraph-1'],
      parentId: 'media-wrap',
      reparent: true,
    });
  });

  it('materializes an agent-owned compound position move against the live destination siblings', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'compound_mutation',
      operations: [{
        opId: 'move-paragraph',
        action: 'reorder',
        targetId: 'paragraph-1',
        position: { mode: 'after', targetId: 'image-1' },
      }],
      answer: 'Moved the paragraph below the image.',
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [
          { id: 'hero', parent: 0, children: ['copy-wrap', 'media-wrap'] },
          { id: 'copy-wrap', parent: 'hero', children: ['paragraph-1'] },
          { id: 'paragraph-1', parent: 'copy-wrap', children: [] },
          { id: 'media-wrap', parent: 'hero', children: ['image-1', 'caption-1'] },
          { id: 'image-1', parent: 'media-wrap', children: [] },
          { id: 'caption-1', parent: 'media-wrap', children: [] },
        ],
      },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'compound_mutation',
      operations: [{
        opId: 'move-paragraph',
        operation: 'reorder',
        orderedIds: ['image-1', 'paragraph-1', 'caption-1'],
        parentId: 'media-wrap',
        reparent: true,
      }],
    });
  });

  it('normalizes sequential compound destination moves against the state produced by earlier operations', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'compound_mutation',
      operations: [
        {
          opId: 'restore-paragraph',
          action: 'reorder',
          elementId: 'paragraph-1',
          orderedIds: ['paragraph-1'],
          destination: {
            parentId: 'copy-wrap',
            position: { mode: 'before', targetId: 'actions-1' },
          },
        },
        {
          opId: 'move-button',
          action: 'reorder',
          elementId: 'button-1',
          orderedIds: ['button-1'],
          destination: {
            parentId: 'media-wrap',
            position: { mode: 'after', targetId: 'image-1' },
          },
        },
      ],
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [
          { id: 'hero', parent: 0, children: ['copy-wrap', 'media-wrap'] },
          { id: 'copy-wrap', parent: 'hero', children: ['eyebrow-1', 'heading-1', 'actions-1'] },
          { id: 'eyebrow-1', parent: 'copy-wrap', children: [] },
          { id: 'heading-1', parent: 'copy-wrap', children: [] },
          { id: 'actions-1', parent: 'copy-wrap', children: ['button-1', 'button-2'] },
          { id: 'button-1', parent: 'actions-1', children: [] },
          { id: 'button-2', parent: 'actions-1', children: [] },
          { id: 'media-wrap', parent: 'hero', children: ['image-1', 'paragraph-1', 'caption-1'] },
          { id: 'image-1', parent: 'media-wrap', children: [] },
          { id: 'paragraph-1', parent: 'media-wrap', children: [] },
          { id: 'caption-1', parent: 'media-wrap', children: [] },
        ],
      },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'compound_mutation',
      operations: [
        {
          opId: 'restore-paragraph',
          operation: 'reorder',
          orderedIds: ['eyebrow-1', 'heading-1', 'paragraph-1', 'actions-1'],
          parentId: 'copy-wrap',
          reparent: true,
        },
        {
          opId: 'move-button',
          operation: 'reorder',
          orderedIds: ['image-1', 'button-1', 'caption-1'],
          parentId: 'media-wrap',
          reparent: true,
        },
      ],
    });
  });

  it('normalizes agent reorder shorthand whose moving id and destination parent are carried by orderedIds and position', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'compound_mutation',
      operations: [
        {
          opId: 'restore-paragraph',
          action: 'reorder',
          orderedIds: ['paragraph-1'],
          position: { mode: 'before', targetId: 'actions-1', parentId: 'copy-wrap' },
        },
        {
          opId: 'move-button',
          action: 'reorder',
          orderedIds: ['button-1'],
          position: { mode: 'after', targetId: 'image-1', parentId: 'media-wrap' },
        },
      ],
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [
          { id: 'hero', parent: 0, children: ['copy-wrap', 'media-wrap'] },
          { id: 'copy-wrap', parent: 'hero', children: ['eyebrow-1', 'heading-1', 'actions-1'] },
          { id: 'eyebrow-1', parent: 'copy-wrap', children: [] },
          { id: 'heading-1', parent: 'copy-wrap', children: [] },
          { id: 'actions-1', parent: 'copy-wrap', children: ['button-1', 'button-2'] },
          { id: 'button-1', parent: 'actions-1', children: [] },
          { id: 'button-2', parent: 'actions-1', children: [] },
          { id: 'media-wrap', parent: 'hero', children: ['image-1', 'paragraph-1', 'caption-1'] },
          { id: 'image-1', parent: 'media-wrap', children: [] },
          { id: 'paragraph-1', parent: 'media-wrap', children: [] },
          { id: 'caption-1', parent: 'media-wrap', children: [] },
        ],
      },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'compound_mutation',
      operations: [
        {
          opId: 'restore-paragraph',
          operation: 'reorder',
          orderedIds: ['eyebrow-1', 'heading-1', 'paragraph-1', 'actions-1'],
          parentId: 'copy-wrap',
          reparent: true,
        },
        {
          opId: 'move-button',
          operation: 'reorder',
          orderedIds: ['image-1', 'button-1', 'caption-1'],
          parentId: 'media-wrap',
          reparent: true,
        },
      ],
    });
  });

  it('treats append_to placement as the destination parent for a top-level cross-parent reorder', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'reorder',
      orderedIds: ['image-1', 'paragraph-1', 'caption-1'],
      position: { mode: 'append_to', targetId: 'media-wrap' },
      answer: 'Moved the paragraph below the image.',
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [
          { id: 'hero', parent: 0, children: ['copy-wrap', 'media-wrap'] },
          { id: 'copy-wrap', parent: 'hero', children: ['paragraph-1'] },
          { id: 'paragraph-1', parent: 'copy-wrap', children: [] },
          { id: 'media-wrap', parent: 'hero', children: ['image-1', 'caption-1'] },
          { id: 'image-1', parent: 'media-wrap', children: [] },
          { id: 'caption-1', parent: 'media-wrap', children: [] },
        ],
      },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'reorder',
      orderedIds: ['image-1', 'paragraph-1', 'caption-1'],
      parentId: 'media-wrap',
      reparent: true,
    });
  });

  it.each([
    [
      'top-level reorder with a position anchor',
      {
        action: 'reorder',
        targetId: 'paragraph-1',
        position: { mode: 'after', targetId: 'image-1', preserveExisting: true },
      },
      'reorder',
    ],
    [
      'top-level reorder with an existing partial order and position anchor',
      {
        action: 'reorder',
        elementId: 'paragraph-1',
        orderedIds: ['image-1', 'paragraph-1'],
        parentId: 'media-wrap',
        position: { mode: 'after', targetId: 'image-1', preserveExisting: true },
      },
      'reorder',
    ],
    [
      'compound move with a placement anchor',
      {
        action: 'compound_mutation',
        operations: [{
          opId: 'move-paragraph',
          action: 'move',
          targetId: 'paragraph-1',
          placement: { mode: 'after', targetId: 'image-1', preserveExisting: true },
        }],
      },
      'compound_mutation',
    ],
    [
      'compound repair with separate subject and anchor ids',
      {
        action: 'compound_mutation',
        operations: [{
          opId: 'move-paragraph',
          operation: 'move',
          elementId: 'paragraph-1',
          sourceParentId: 'copy-wrap',
          parentId: 'media-wrap',
          targetId: 'image-1',
          mode: 'after',
          preserveExisting: true,
        }],
      },
      'compound_mutation',
    ],
  ])('materializes %s as one cross-parent reorder', (_label, modelResult, expectedAction) => {
    const normalized = normalizeQuickTextEditResult(modelResult, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      bricksContext: {
        elements: [
          { id: 'hero', parent: 0, children: ['copy-wrap', 'media-wrap'] },
          { id: 'copy-wrap', parent: 'hero', children: ['paragraph-1'] },
          { id: 'paragraph-1', parent: 'copy-wrap', children: [] },
          { id: 'media-wrap', parent: 'hero', children: ['image-1', 'caption-1'] },
          { id: 'image-1', parent: 'media-wrap', children: [] },
          { id: 'caption-1', parent: 'media-wrap', children: [] },
        ],
      },
    }, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: expectedAction,
    });
    const reorder = expectedAction === 'compound_mutation'
      ? normalized.operations?.[0]
      : normalized;
    expect(reorder).toMatchObject({
      orderedIds: ['image-1', 'paragraph-1', 'caption-1'],
      parentId: 'media-wrap',
      reparent: true,
    });
  });
});
