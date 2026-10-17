import { describe, expect, it } from 'vitest';

import {
  buildPixflowBricksGlobalClass,
  getPixflowBricksElementCapability,
  resolvePixflowBricksCompatibilityContext,
  resolvePixflowBricksCssMapping,
  validatePixflowBricksGlobalReferences,
  validatePixflowBricksNativeSettings,
  validatePixflowBricksPayload,
} from '../html-to-bricks-compatibility.mjs';

describe('Pixflow-owned Bricks compatibility adapter', () => {
  it('does not add wall-clock data to deterministic converter output', async () => {
    const first = resolvePixflowBricksCompatibilityContext({});
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(resolvePixflowBricksCompatibilityContext({})).toEqual(first);
  });

  it('resolves installed 2.4 facts without consulting native conversion output', () => {
    const context = resolvePixflowBricksCompatibilityContext({
      bricksVersion: '2.4-beta2',
      source: 'bricks_runtime_with_pixflow_fallbacks',
      breakpoints: [
        { key: 'desktop', width: 1279, base: true },
        { key: 'tablet_portrait', width: 991 },
        { key: 'custom_phone', width: 520 },
      ],
      breakpointMode: { baseKey: 'desktop', baseWidth: 1279, mobileFirst: false },
    });

    expect(context.profileId).toBe('bricks-2.4');
    expect(context.status).toBe('supported');
    expect(context.provenance.nativeConverterConsulted).toBe(false);
    expect(context.breakpoints.map((item) => item.key)).toEqual(['desktop', 'tablet_portrait', 'custom_phone']);
  });

  it('uses the versioned fallback profile when the optional runtime snapshot is missing', () => {
    const context = resolvePixflowBricksCompatibilityContext({});

    expect(context).toMatchObject({
      profileId: 'bricks-2.4',
      status: 'partial',
      fallbackUsed: true,
      fallbackReason: 'runtime_context_unavailable',
    });
    expect(context.provenance.nativeConverterConsulted).toBe(false);
  });

  it('routes an unavailable or renamed control to scoped CSS with a precise diagnostic', () => {
    const context = resolvePixflowBricksCompatibilityContext({ bricksVersion: '2.5.0' });
    const mapping = resolvePixflowBricksCssMapping('scrollbar-color', context);
    const validation = validatePixflowBricksNativeSettings({
      elementName: 'div',
      settings: { _display: 'flex', _removedControl: 'unsafe' },
      context,
    });

    expect(mapping).toMatchObject({
      ownership: 'scoped_css',
      reason: 'css_property_not_registered_for_profile',
      diagnostic: expect.objectContaining({ code: 'bricks_css_mapping_unavailable', severity: 'warning' }),
    });
    expect(validation.ok).toBe(false);
    expect(validation.nativeSettings).toEqual({ _display: 'flex' });
    expect(validation.fallbackSettings).toEqual({ _removedControl: 'unsafe' });
    expect(validation.diagnostics[0]).toMatchObject({
      code: 'bricks_control_unavailable',
      control: '_removedControl',
      ownership: 'scoped_css',
    });
  });

  it('publishes versioned element capabilities for compiler structure decisions', () => {
    const context = resolvePixflowBricksCompatibilityContext({ bricksVersion: '2.4' });

    expect(getPixflowBricksElementCapability('container', context)).toMatchObject({
      supported: true,
      nestable: true,
      semanticTagControl: 'tag',
    });
    expect(getPixflowBricksElementCapability('image', context)).toMatchObject({
      supported: true,
      nestable: false,
      media: true,
    });
    expect(getPixflowBricksElementCapability('future-widget', context)).toMatchObject({
      supported: false,
      fallbackElement: 'div',
      reason: 'element_not_registered_for_profile',
    });
  });

  it('validates responsive composite keys against runtime breakpoints and pseudo states', () => {
    const context = resolvePixflowBricksCompatibilityContext({
      bricksVersion: '2.4',
      breakpoints: [
        { key: 'desktop', width: 1279, base: true },
        { key: 'phone', width: 520 },
      ],
      pseudoStates: ['hover'],
    });
    const result = validatePixflowBricksNativeSettings({
      elementName: 'button',
      settings: {
        '_typography:phone:hover': { color: { raw: '#fff' } },
        '_padding:missing:hover': { top: '1rem' },
        '_background:phone:focus': { color: { raw: '#000' } },
      },
      context,
    });

    expect(result.nativeSettings).toHaveProperty('_typography:phone:hover');
    expect(result.fallbackSettings).toHaveProperty('_padding:missing:hover');
    expect(result.fallbackSettings).toHaveProperty('_background:phone:focus');
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'bricks_breakpoint_unavailable',
      'bricks_pseudo_state_unavailable',
    ]);
  });

  it('blocks dependent class references when global persistence is not verified', () => {
    const context = resolvePixflowBricksCompatibilityContext({ bricksVersion: '2.4' });
    const globalClass = buildPixflowBricksGlobalClass({ id: 'class-card', name: 'card', settings: { _display: 'flex' } }, context);
    const payload = {
      content: [{ id: 'card', name: 'div', parent: '', children: [], settings: { _cssGlobalClasses: ['class-card'] } }],
      globalClasses: [globalClass.value],
    };

    expect(validatePixflowBricksPayload(payload, context).ok).toBe(true);
    expect(validatePixflowBricksGlobalReferences({
      content: payload.content,
      persistedGlobalClasses: [],
      persistenceVerified: false,
    })).toMatchObject({
      ok: false,
      code: 'bricks_global_data_not_persisted',
      blockedReferenceIds: ['class-card'],
    });
  });
});
