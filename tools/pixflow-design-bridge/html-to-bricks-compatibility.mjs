/**
 * Pixflow-owned Bricks compatibility boundary for the standalone bridge.
 *
 * This module contains schema and payload knowledge only. It never calls,
 * imports, probes, or falls back to Bricks' native HTML converter. The bridge
 * is copied as a self-contained compatibility runtime, so this executable MJS
 * module deliberately has no workspace-package dependency.
 */

export const PIXFLOW_BRICKS_COMPATIBILITY_SCHEMA = 'pixflow.html_to_bricks.bricks_compatibility.v1';
export const PIXFLOW_BRICKS_PROFILE_VERSION = '2026-08-10.1';

const DEFAULT_BREAKPOINTS = Object.freeze([
  Object.freeze({ key: 'desktop', label: 'Desktop', width: 1279, base: true }),
  Object.freeze({ key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false }),
  Object.freeze({ key: 'mobile_landscape', label: 'Mobile landscape', width: 767, base: false }),
  Object.freeze({ key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false }),
]);

const DEFAULT_PSEUDO_STATES = Object.freeze([
  'hover', 'focus', 'focus-visible', 'active', 'visited', 'disabled', 'before', 'after',
]);

const SHARED_NATIVE_CONTROLS = new Set([
  '_alignContentGrid', '_alignItems', '_alignItemsGrid', '_alignSelf', '_aspectRatio',
  '_attributes', '_background', '_border', '_bottom', '_boxShadow', '_columnGap',
  '_conditions', '_cssCustom', '_cssFilters', '_cssGlobalClasses', '_cssTransition',
  '_cursor', '_direction', '_display', '_flexBasis', '_flexGrow', '_flexShrink',
  '_flexWrap', '_gradient', '_gridColumn', '_gridItemJustifySelf', '_gridRow',
  '_gridTemplateColumns', '_gridTemplateRows', '_height', '_heightMax', '_heightMin',
  '_interactions', '_isolation', '_justifyContent', '_justifyContentGrid',
  '_justifyItemsGrid', '_left', '_margin', '_mixBlendMode', '_objectFit',
  '_objectPosition', '_opacity', '_order', '_overflow', '_padding', '_perspective',
  '_perspectiveOrigin', '_pointerEvents', '_position', '_right', '_rowGap',
  '_scrollMargin', '_scrollSnapAlign', '_scrollSnapStop', '_scrollSnapType', '_top',
  '_transform', '_transformOrigin', '_typography', '_visibility', '_width', '_widthMax',
  '_widthMin', '_zIndex',
]);

const CSS_CONTROL_REGISTRY = Object.freeze({
  display: ['_display'],
  'flex-direction': ['_direction'],
  'flex-wrap': ['_flexWrap'],
  flex: ['_flexGrow', '_flexShrink', '_flexBasis'],
  'flex-grow': ['_flexGrow'],
  'flex-shrink': ['_flexShrink'],
  'flex-basis': ['_flexBasis'],
  'align-self': ['_alignSelf'],
  order: ['_order'],
  'justify-self': ['_gridItemJustifySelf'],
  'align-items': ['_alignItems', '_alignItemsGrid'],
  'justify-content': ['_justifyContent', '_justifyContentGrid'],
  'justify-items': ['_justifyItemsGrid'],
  'align-content': ['_alignContentGrid'],
  'place-items': ['_display', '_alignItems', '_alignItemsGrid', '_justifyContent', '_justifyItemsGrid'],
  'place-content': ['_display', '_alignContentGrid', '_justifyContentGrid'],
  gap: ['_rowGap', '_columnGap'],
  'column-gap': ['_columnGap'],
  'row-gap': ['_rowGap'],
  'grid-template-columns': ['_gridTemplateColumns'],
  'grid-template-rows': ['_gridTemplateRows'],
  'grid-column': ['_gridColumn'],
  'grid-column-start': ['_gridColumn'],
  'grid-column-end': ['_gridColumn'],
  'grid-row': ['_gridRow'],
  'grid-row-start': ['_gridRow'],
  'grid-row-end': ['_gridRow'],
  width: ['_width', '_widthMax'],
  height: ['_height'],
  'min-width': ['_widthMin'],
  'max-width': ['_widthMax'],
  'min-height': ['_heightMin'],
  'max-height': ['_heightMax'],
  'aspect-ratio': ['_aspectRatio'],
  'object-fit': ['_objectFit'],
  'object-position': ['_objectPosition'],
  overflow: ['_overflow'],
  'overflow-x': ['_overflow'],
  'overflow-y': ['_overflow'],
  visibility: ['_visibility'],
  opacity: ['_opacity'],
  cursor: ['_cursor'],
  isolation: ['_isolation'],
  'mix-blend-mode': ['_mixBlendMode'],
  'pointer-events': ['_pointerEvents'],
  perspective: ['_perspective'],
  'perspective-origin': ['_perspectiveOrigin'],
  'scroll-snap-type': ['_scrollSnapType'],
  'scroll-snap-align': ['_scrollSnapAlign'],
  'scroll-snap-stop': ['_scrollSnapStop'],
  'scroll-margin': ['_scrollMargin'],
  filter: ['_cssFilters'],
  position: ['_position'],
  inset: ['_top', '_right', '_bottom', '_left'],
  top: ['_top'],
  right: ['_right'],
  bottom: ['_bottom'],
  left: ['_left'],
  'z-index': ['_zIndex'],
  translate: ['_transform'],
  transform: ['_transform'],
  'transform-origin': ['_transformOrigin'],
  transition: ['_cssTransition'],
  padding: ['_padding'],
  'padding-block': ['_padding'],
  'padding-inline': ['_padding'],
  'padding-top': ['_padding'],
  'padding-right': ['_padding'],
  'padding-bottom': ['_padding'],
  'padding-left': ['_padding'],
  margin: ['_margin'],
  'margin-block': ['_margin'],
  'margin-inline': ['_margin'],
  'margin-top': ['_margin'],
  'margin-right': ['_margin'],
  'margin-bottom': ['_margin'],
  'margin-left': ['_margin'],
  color: ['_typography'],
  font: ['_typography'],
  'font-family': ['_typography'],
  'font-size': ['_typography'],
  'font-weight': ['_typography'],
  'font-style': ['_typography'],
  'font-variation-settings': ['_typography'],
  'line-height': ['_typography'],
  'letter-spacing': ['_typography'],
  'white-space': ['_typography'],
  'text-wrap': ['_typography'],
  'text-align': ['_typography'],
  'text-transform': ['_typography'],
  'text-decoration': ['_typography'],
  'text-shadow': ['_typography'],
  background: ['_background', '_gradient'],
  'background-color': ['_background'],
  'background-image': ['_background', '_gradient'],
  'background-repeat': ['_background'],
  'background-position': ['_background'],
  'background-size': ['_background'],
  'background-attachment': ['_background'],
  'background-blend-mode': ['_background'],
  border: ['_border'],
  'border-radius': ['_border'],
  'border-top-left-radius': ['_border'],
  'border-top-right-radius': ['_border'],
  'border-bottom-right-radius': ['_border'],
  'border-bottom-left-radius': ['_border'],
  'border-top': ['_border'],
  'border-right': ['_border'],
  'border-bottom': ['_border'],
  'border-left': ['_border'],
  'border-width': ['_border'],
  'border-style': ['_border'],
  'border-color': ['_border'],
  'border-top-width': ['_border'],
  'border-right-width': ['_border'],
  'border-bottom-width': ['_border'],
  'border-left-width': ['_border'],
  'border-top-style': ['_border'],
  'border-right-style': ['_border'],
  'border-bottom-style': ['_border'],
  'border-left-style': ['_border'],
  'border-top-color': ['_border'],
  'border-right-color': ['_border'],
  'border-bottom-color': ['_border'],
  'border-left-color': ['_border'],
  'box-shadow': ['_boxShadow'],
});

const ELEMENT_CAPABILITY_REGISTRY = Object.freeze({
  section: capability({ nestable: true, semanticTagControl: 'tag' }),
  container: capability({ nestable: true, semanticTagControl: 'tag' }),
  block: capability({ nestable: true, semanticTagControl: 'tag' }),
  div: capability({ nestable: true, semanticTagControl: 'tag' }),
  heading: capability({ semanticTagControl: 'tag', link: true }),
  text: capability({ semanticTagControl: 'tag', link: true }),
  'text-basic': capability({ semanticTagControl: 'tag', link: true }),
  'text-link': capability({ semanticTagControl: 'tag', link: true }),
  button: capability({ semanticTagControl: 'tag', link: true }),
  divider: capability({}),
  image: capability({ media: true }),
  icon: capability({ media: true }),
  svg: capability({ svg: true, media: true }),
  video: capability({ media: true }),
  audio: capability({ media: true }),
  form: capability({ nestable: true, form: true }),
  'nav-menu': capability({ nestable: true, link: true }),
  'tabs-nested': capability({ nestable: true }),
  'accordion-nested': capability({ nestable: true }),
  'slider-nested': capability({ nestable: true, media: true }),
  code: capability({ code: true }),
  html: capability({ code: true }),
  shortcode: capability({ code: true }),
  'image-gallery': capability({ nestable: true, media: true }),
  map: capability({ media: true }),
  counter: capability({}),
  'social-icons': capability({ nestable: true, link: true }),
  'post-title': capability({ link: true }),
  'post-excerpt': capability({ link: true }),
  'post-content': capability({ nestable: true, link: true, media: true }),
  'post-taxonomy': capability({ link: true }),
  'filter-search': capability({ form: true }),
  'product-title': capability({ link: true }),
  'product-price': capability({}),
  'product-gallery': capability({ nestable: true, media: true }),
  'product-add-to-cart': capability({ form: true }),
});

export function resolvePixflowBricksCompatibilityContext(snapshot = {}) {
  const outer = record(snapshot);
  const source = Object.keys(record(outer.catalog)).length > 0 ? record(outer.catalog) : outer;
  const bricksVersion = firstString(source.bricksVersion, outer.bricksVersion);
  const parsedVersion = parseVersion(bricksVersion);
  const fallbackUsed = !bricksVersion;
  const status = compatibilityStatus(parsedVersion, fallbackUsed);
  const profileId = 'bricks-2.4';
  const runtimeBreakpoints = normalizeBreakpoints(source.breakpoints || outer.breakpoints);
  const breakpoints = runtimeBreakpoints.length > 0
    ? runtimeBreakpoints
    : DEFAULT_BREAKPOINTS.map((item) => ({ ...item }));
  const rawMode = record(source.breakpointMode || outer.breakpointMode);
  const base = breakpoints.find((item) => item.base)
    || breakpoints.find((item) => item.key === firstString(rawMode.baseKey))
    || breakpoints[0];
  const runtimePseudos = uniqueStrings(source.pseudoStates || source.pseudoClasses || outer.pseudoStates)
    .map(normalizePseudoState)
    .filter(Boolean);
  const pseudoStates = runtimePseudos.length > 0 ? runtimePseudos : [...DEFAULT_PSEUDO_STATES];
  const runtimeElements = record(source.elements);
  const elementCapabilities = {};
  for (const [name, profile] of Object.entries(ELEMENT_CAPABILITY_REGISTRY)) {
    elementCapabilities[name] = {
      ...profile,
      runtimeSchemaObserved: Boolean(runtimeElements[name]),
    };
  }
  const diagnostics = [];
  if (status === 'unknown') {
    diagnostics.push(buildDiagnostic({
      code: 'bricks_profile_unknown',
      message: `Bricks ${bricksVersion || 'unknown'} is not verified by ${profileId}; unverified declarations use scoped CSS.`,
      profileId,
      bricksVersion: bricksVersion || null,
      ownership: 'scoped_css',
    }));
  } else if (status === 'incompatible') {
    diagnostics.push(buildDiagnostic({
      code: 'bricks_profile_incompatible',
      severity: 'error',
      message: `Bricks ${bricksVersion} predates Pixflow's safe compatibility boundary.`,
      profileId,
      bricksVersion,
      ownership: 'blocked',
    }));
  } else if (fallbackUsed) {
    diagnostics.push(buildDiagnostic({
      code: 'bricks_runtime_context_unavailable',
      message: `Runtime Bricks facts were unavailable; Pixflow is using its version-labelled ${profileId} fallback profile.`,
      profileId,
      bricksVersion: null,
      ownership: 'scoped_css',
    }));
  }

  return {
    schema: PIXFLOW_BRICKS_COMPATIBILITY_SCHEMA,
    version: 1,
    profileVersion: PIXFLOW_BRICKS_PROFILE_VERSION,
    profileId,
    status,
    statusReason: compatibilityStatusReason(status, bricksVersion, fallbackUsed),
    bricksVersion: bricksVersion || null,
    source: firstString(source.source, outer.source, fallbackUsed ? 'pixflow_profile' : 'wordpress_runtime'),
    capturedAt: firstString(source.capturedAt, outer.capturedAt),
    fallbackUsed,
    fallbackReason: fallbackUsed ? 'runtime_context_unavailable' : '',
    breakpoints,
    breakpointMode: {
      baseKey: firstString(rawMode.baseKey, base?.key, 'desktop'),
      baseWidth: positiveNumber(rawMode.baseWidth) || positiveNumber(base?.width) || 1279,
      mobileFirst: rawMode.mobileFirst === true,
      narrowerRule: firstString(rawMode.narrowerRule, rawMode.mobileFirst === true ? 'min-width' : 'max-width'),
      widerRule: firstString(rawMode.widerRule, rawMode.mobileFirst === true ? 'max-width' : 'min-width'),
    },
    pseudoStates,
    compositeKeyFormat: '{control}:{breakpoint}:{pseudo}',
    themeStyleLoadingMethod: normalizeThemeStyleLoadingMethod(
      source.themeStyleLoadingMethod || source.themeStyleLoadMethod || outer.themeStyleLoadingMethod,
    ),
    globalData: resolveGlobalDataCapabilities(source),
    elementCapabilities,
    controlRegistry: {
      cssPropertyCount: Object.keys(CSS_CONTROL_REGISTRY).length,
      nativeControlCount: SHARED_NATIVE_CONTROLS.size,
    },
    provenance: {
      owner: 'pixflow',
      nativeConverterConsulted: false,
      runtimeFields: [
        ...(bricksVersion ? ['bricksVersion'] : []),
        ...(runtimeBreakpoints.length > 0 ? ['breakpoints'] : []),
        ...(Object.keys(rawMode).length > 0 ? ['breakpointMode'] : []),
        ...(runtimePseudos.length > 0 ? ['pseudoStates'] : []),
        ...(Object.keys(runtimeElements).length > 0 ? ['elements'] : []),
      ],
      profileFields: [
        ...(runtimeBreakpoints.length === 0 ? ['breakpoints'] : []),
        ...(runtimePseudos.length === 0 ? ['pseudoStates'] : []),
        'elementCapabilities',
        'controlRegistry',
        'payloadValidators',
      ],
    },
    diagnostics,
  };
}

export function getPixflowBricksElementCapability(elementName, context = {}) {
  const name = firstString(elementName).toLowerCase();
  const capabilities = record(context.elementCapabilities);
  if (capabilities[name]) return { ...record(capabilities[name]) };
  if (ELEMENT_CAPABILITY_REGISTRY[name]) return { ...ELEMENT_CAPABILITY_REGISTRY[name] };
  return {
    supported: false,
    nestable: false,
    semanticTagControl: null,
    link: false,
    form: false,
    media: false,
    svg: false,
    code: false,
    fallbackElement: 'div',
    reason: 'element_not_registered_for_profile',
    runtimeSchemaObserved: false,
  };
}

export function resolvePixflowBricksCssMapping(cssProperty, context = {}) {
  const property = firstString(cssProperty).toLowerCase();
  const controls = CSS_CONTROL_REGISTRY[property];
  if (controls && context.status !== 'incompatible') {
    return {
      cssProperty: property,
      ownership: 'native_control',
      controls: [...controls],
      reason: 'registered_for_profile',
      diagnostic: null,
    };
  }
  const reason = controls ? 'profile_incompatible' : 'css_property_not_registered_for_profile';
  return {
    cssProperty: property,
    ownership: context.status === 'incompatible' ? 'blocked' : 'scoped_css',
    controls: [],
    reason,
    diagnostic: buildDiagnostic({
      code: controls ? 'bricks_profile_incompatible' : 'bricks_css_mapping_unavailable',
      severity: context.status === 'incompatible' ? 'error' : 'warning',
      message: controls
        ? `${property} cannot be emitted natively for incompatible profile ${firstString(context.profileId, 'unknown')}.`
        : `${property} has no verified native-control mapping in profile ${firstString(context.profileId, 'unknown')}; preserve it in scoped CSS.`,
      context,
      ownership: context.status === 'incompatible' ? 'blocked' : 'scoped_css',
      cssProperty: property,
    }),
  };
}

export function validatePixflowBricksNativeSettings({ elementName = '', settings = {}, context = {} } = {}) {
  const nativeSettings = {};
  const fallbackSettings = {};
  const diagnostics = [];
  const breakpointKeys = new Set(arrayValue(context.breakpoints).map((item) => firstString(item?.key)).filter(Boolean));
  const pseudoStates = new Set(uniqueStrings(context.pseudoStates).map(normalizePseudoState).filter(Boolean));
  for (const [compositeKey, value] of Object.entries(record(settings))) {
    const [baseKey, breakpoint = '', pseudo = '', ...extra] = compositeKey.split(':');
    let diagnostic = null;
    if (baseKey.startsWith('_') && !SHARED_NATIVE_CONTROLS.has(baseKey)) {
      diagnostic = buildDiagnostic({
        code: 'bricks_control_unavailable',
        message: `${baseKey} is not available in profile ${firstString(context.profileId, 'unknown')}; preserve the declaration in scoped CSS.`,
        context,
        ownership: 'scoped_css',
        control: baseKey,
        elementName,
      });
    } else if (extra.length > 0) {
      diagnostic = buildDiagnostic({
        code: 'bricks_composite_key_invalid',
        message: `${compositeKey} does not match {control}:{breakpoint}:{pseudo}.`,
        context,
        ownership: 'scoped_css',
        control: baseKey,
        elementName,
      });
    } else if (breakpoint && !breakpointKeys.has(breakpoint)) {
      diagnostic = buildDiagnostic({
        code: 'bricks_breakpoint_unavailable',
        message: `Breakpoint ${breakpoint} is not available in profile ${firstString(context.profileId, 'unknown')}.`,
        context,
        ownership: 'scoped_css',
        control: baseKey,
        elementName,
      });
    } else if (pseudo && !pseudoStates.has(normalizePseudoState(pseudo))) {
      diagnostic = buildDiagnostic({
        code: 'bricks_pseudo_state_unavailable',
        message: `Pseudo state ${pseudo} is not available in profile ${firstString(context.profileId, 'unknown')}.`,
        context,
        ownership: 'scoped_css',
        control: baseKey,
        elementName,
      });
    }
    if (diagnostic) {
      fallbackSettings[compositeKey] = value;
      diagnostics.push(diagnostic);
    } else {
      nativeSettings[compositeKey] = value;
    }
  }
  return {
    ok: diagnostics.length === 0,
    nativeSettings,
    fallbackSettings,
    diagnostics,
  };
}

export function buildPixflowBricksGlobalClass(input, context) {
  return buildRecord('global_class', input, context, ['id', 'name'], true);
}

export function buildPixflowBricksPalette(input, context) {
  return buildRecord('palette', input, context, ['id', 'name', 'colors']);
}

export function buildPixflowBricksVariable(input, context) {
  return buildRecord('variable', input, context, ['id', 'name', 'value']);
}

export function buildPixflowBricksThemeStyle(input, context) {
  return buildRecord('theme_style', input, context, ['id', 'name', 'settings'], true);
}

/**
 * Map Pixflow's versioned, semantic page-foundation contract to the native
 * Bricks Theme Style groups exposed by the active compatibility profile.
 * Source classification stays in the converter; only Bricks keys live here.
 */
export function buildPixflowBricksPageFoundationThemeStyle(input = {}, context = {}) {
  const source = record(input);
  const semantic = record(source.semanticDefaults);
  const resolved = resolvePixflowBricksCompatibilityContext(context);
  const diagnostics = [...arrayValue(resolved.diagnostics)];
  const supported = resolved.status !== 'incompatible'
    && resolved.runtimeCapabilities?.themeStyles !== 'unavailable';
  if (!supported) {
    diagnostics.push(buildDiagnostic({
      code: 'bricks_theme_style_profile_unavailable',
      severity: 'error',
      message: `Theme Style controls are unavailable for profile ${firstString(resolved.profileId, 'unknown')}.`,
      context: resolved,
      ownership: 'scoped_css',
    }));
  }

  const settings = {};
  if (source.conditions && typeof source.conditions === 'object') {
    settings.conditions = cloneRecord(source.conditions);
  }
  if (supported) {
    const typography = compactRecord({
      typographyHtml: semantic.htmlFontSize,
      typographyBody: semantic.bodyTypography,
      typographyHeadings: semantic.headingTypography,
      typographyHeadingH1: record(semantic.headings).h1,
      typographyHeadingH2: record(semantic.headings).h2,
      typographyHeadingH3: record(semantic.headings).h3,
      typographyHeadingH4: record(semantic.headings).h4,
      typographyHeadingH5: record(semantic.headings).h5,
      typographyHeadingH6: record(semantic.headings).h6,
      focusOutline: semantic.focusOutline,
    });
    if (Object.keys(typography).length > 0) settings.typography = typography;
    if (isNonEmptyRecord(semantic.siteBackground)) {
      settings.general = { siteBackground: cloneRecord(semantic.siteBackground) };
    }
    for (const group of ['links', 'section', 'container', 'button', 'form']) {
      const semanticKey = group === 'links' ? 'link' : group;
      if (isNonEmptyRecord(semantic[semanticKey])) {
        settings[group] = cloneRecord(semantic[semanticKey]);
      }
    }
  }
  const stylesheet = firstString(source.stylesheet);
  if (stylesheet) settings.css = { stylesheet };

  return {
    ok: supported,
    value: {
      id: firstString(source.id),
      name: firstString(source.label, source.name),
      label: firstString(source.label, source.name),
      settings,
      compatibility: {
        profileId: resolved.profileId,
        profileVersion: resolved.profileVersion,
        bricksVersion: resolved.bricksVersion,
        loadingMethod: resolved.themeStyleLoadingMethod,
        status: resolved.status,
        supported,
      },
    },
    diagnostics,
  };
}

export function buildPixflowBricksPageSettings(input, context) {
  return buildRecord('page_settings', input, context, [], false);
}

export function buildPixflowBricksContentElement(input, context) {
  const result = buildRecord('content_element', input, context, ['id', 'name', 'settings'], true);
  const capabilityResult = getPixflowBricksElementCapability(record(input).name, context);
  if (!capabilityResult.supported) {
    result.ok = false;
    result.diagnostics.push(buildDiagnostic({
      code: 'bricks_element_unavailable',
      message: `Element ${firstString(record(input).name)} is not registered for profile ${firstString(context?.profileId, 'unknown')}.`,
      context,
      ownership: 'scoped_css',
      elementName: firstString(record(input).name),
    }));
  }
  return result;
}

export function validatePixflowBricksPayload(payload = {}, context = {}) {
  const source = record(payload);
  const content = arrayValue(source.content);
  const globalClasses = arrayValue(source.globalClasses || source.global_classes);
  const diagnostics = [...arrayValue(context.diagnostics)];
  const elementIds = new Set();
  const classIds = new Set();
  for (const item of globalClasses) {
    const result = buildPixflowBricksGlobalClass(item, context);
    diagnostics.push(...result.diagnostics);
    const id = firstString(result.value?.id);
    if (id && classIds.has(id)) diagnostics.push(buildDiagnostic({
      code: 'bricks_global_class_id_duplicate',
      severity: 'error',
      message: `Global class id ${id} is duplicated.`,
      context,
      ownership: 'blocked',
    }));
    if (id) classIds.add(id);
  }
  for (const item of content) {
    const result = buildPixflowBricksContentElement(item, context);
    diagnostics.push(...result.diagnostics);
    const id = firstString(result.value?.id);
    if (id && elementIds.has(id)) diagnostics.push(buildDiagnostic({
      code: 'bricks_element_id_duplicate',
      severity: 'error',
      message: `Element id ${id} is duplicated.`,
      context,
      ownership: 'blocked',
      elementName: firstString(result.value?.name),
    }));
    if (id) elementIds.add(id);
  }
  for (const item of content) {
    const element = record(item);
    const parent = firstString(element.parent);
    if (parent && !elementIds.has(parent)) diagnostics.push(buildDiagnostic({
      code: 'bricks_parent_reference_missing',
      severity: 'error',
      message: `Element ${firstString(element.id)} references missing parent ${parent}.`,
      context,
      ownership: 'blocked',
      elementName: firstString(element.name),
    }));
    for (const child of uniqueStrings(element.children)) {
      if (!elementIds.has(child)) diagnostics.push(buildDiagnostic({
        code: 'bricks_child_reference_missing',
        severity: 'error',
        message: `Element ${firstString(element.id)} references missing child ${child}.`,
        context,
        ownership: 'blocked',
        elementName: firstString(element.name),
      }));
    }
    for (const classId of uniqueStrings(record(element.settings)._cssGlobalClasses)) {
      if (!classIds.has(classId)) diagnostics.push(buildDiagnostic({
        code: 'bricks_global_class_reference_missing',
        severity: 'error',
        message: `Element ${firstString(element.id)} references missing global class ${classId}.`,
        context,
        ownership: 'blocked',
        elementName: firstString(element.name),
      }));
    }
  }
  const errors = diagnostics.filter((item) => item.severity === 'error');
  return {
    ok: errors.length === 0,
    profileId: firstString(context.profileId),
    profileVersion: firstString(context.profileVersion),
    diagnostics,
    errors,
    warnings: diagnostics.filter((item) => item.severity === 'warning'),
  };
}

export function validatePixflowBricksGlobalReferences({
  content = [],
  persistedGlobalClasses = [],
  persistenceVerified = false,
} = {}) {
  const referencedIds = uniqueStrings(arrayValue(content).flatMap((element) => (
    uniqueStrings(record(record(element).settings)._cssGlobalClasses)
  )));
  const persistedIds = new Set(arrayValue(persistedGlobalClasses).map((item) => firstString(record(item).id)).filter(Boolean));
  const missingIds = referencedIds.filter((id) => !persistedIds.has(id));
  const blockedReferenceIds = persistenceVerified ? missingIds : referencedIds;
  if (blockedReferenceIds.length > 0) {
    return {
      ok: false,
      code: persistenceVerified ? 'bricks_global_reference_missing' : 'bricks_global_data_not_persisted',
      message: persistenceVerified
        ? 'One or more Bricks elements reference a global class that was not persisted.'
        : 'Pixflow blocked Bricks global-class references because global-data persistence was not verified.',
      blockedReferenceIds,
    };
  }
  return { ok: true, code: 'bricks_global_references_verified', message: '', blockedReferenceIds: [] };
}

export function pixflowBricksControlRegistrySnapshot() {
  return {
    profileVersion: PIXFLOW_BRICKS_PROFILE_VERSION,
    cssProperties: Object.fromEntries(Object.entries(CSS_CONTROL_REGISTRY).map(([property, controls]) => [property, [...controls]])),
    nativeControls: [...SHARED_NATIVE_CONTROLS].sort(),
    elementCapabilities: Object.fromEntries(Object.entries(ELEMENT_CAPABILITY_REGISTRY).map(([name, value]) => [name, { ...value }])),
  };
}

function buildRecord(kind, input, context = {}, requiredKeys = [], validateSettings = false) {
  const value = { ...record(input) };
  const diagnostics = [];
  for (const key of requiredKeys) {
    const present = key === 'settings' || key === 'colors'
      ? value[key] && typeof value[key] === 'object'
      : firstString(value[key]);
    if (!present) diagnostics.push(buildDiagnostic({
      code: `bricks_${kind}_field_missing`,
      severity: 'error',
      message: `${kind} requires ${key}.`,
      context,
      ownership: 'blocked',
    }));
  }
  if (validateSettings) {
    const validated = validatePixflowBricksNativeSettings({
      elementName: kind === 'content_element' ? firstString(value.name) : kind,
      settings: value.settings,
      context,
    });
    value.settings = validated.nativeSettings;
    diagnostics.push(...validated.diagnostics);
  }
  return { ok: diagnostics.every((item) => item.severity !== 'error'), value, diagnostics };
}

function resolveGlobalDataCapabilities(source) {
  const runtime = record(source.runtimeCapabilities || source.globalDataCapabilities);
  const runtimeObserved = Object.keys(source).length > 0 && firstString(source.source) !== 'missing_wordpress_schema_snapshot';
  return {
    globalClasses: capabilityStatus(runtime.globalClasses, runtimeObserved || Array.isArray(source.globalClasses)),
    variables: capabilityStatus(runtime.variables, runtimeObserved),
    palettes: capabilityStatus(runtime.palettes, runtimeObserved),
    themeStyles: capabilityStatus(runtime.themeStyles, runtimeObserved),
    pageSettings: capabilityStatus(runtime.pageSettings, runtimeObserved),
  };
}

function capabilityStatus(value, runtimeObserved) {
  if (value === true) return 'supported';
  if (value === false) return 'unavailable';
  return runtimeObserved ? 'supported' : 'partial';
}

function capability(overrides = {}) {
  return Object.freeze({
    supported: true,
    nestable: false,
    semanticTagControl: null,
    link: false,
    form: false,
    media: false,
    svg: false,
    code: false,
    fallbackElement: 'div',
    reason: 'registered_for_profile',
    ...overrides,
  });
}

function normalizeBreakpoints(value) {
  const normalized = [];
  for (const entry of arrayValue(value)) {
    const item = record(entry);
    const key = firstString(item.key, item.name, item.id);
    const width = positiveNumber(item.width ?? item.value ?? item.maxWidth ?? item.max_width);
    if (!key || !width) continue;
    normalized.push({
      key,
      label: firstString(item.label, key),
      width,
      base: item.base === true || /^(?:desktop|base)$/i.test(key),
    });
  }
  return normalized.filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index);
}

function compatibilityStatus(version, fallbackUsed) {
  if (fallbackUsed) return 'partial';
  if (!version) return 'unknown';
  if (version.major < 2) return 'incompatible';
  if (version.major > 2 || version.minor > 4) return 'unknown';
  return version.minor === 4 ? 'supported' : 'partial';
}

function compatibilityStatusReason(status, version, fallbackUsed) {
  if (fallbackUsed) return 'Runtime facts were unavailable; using the Pixflow Bricks 2.4 fallback profile.';
  if (status === 'supported') return `Bricks ${version} matches the verified Pixflow Bricks 2.4 profile.`;
  if (status === 'partial') return `Bricks ${version} uses verified common controls plus scoped CSS for unverified behaviour.`;
  if (status === 'incompatible') return `Bricks ${version} predates Pixflow's safe compatibility boundary.`;
  return `Bricks ${version || 'unknown'} is not verified by the current Pixflow profile.`;
}

function normalizeThemeStyleLoadingMethod(value) {
  const method = firstString(value).toLowerCase();
  return method === 'all' || method === 'specific' ? method : 'unknown';
}

function buildDiagnostic({
  code,
  severity = 'warning',
  message,
  context = {},
  profileId,
  bricksVersion,
  ownership = 'scoped_css',
  control,
  cssProperty,
  elementName,
}) {
  return {
    code,
    severity,
    message,
    profileId: firstString(profileId, context.profileId),
    bricksVersion: firstString(bricksVersion, context.bricksVersion) || null,
    ownership,
    ...(control ? { control } : {}),
    ...(cssProperty ? { cssProperty } : {}),
    ...(elementName ? { elementName } : {}),
  };
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)/.exec(firstString(value));
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

function normalizePseudoState(value) {
  return firstString(value).replace(/^:+/, '').trim().toLowerCase();
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneRecord(value) {
  const source = record(value);
  return JSON.parse(JSON.stringify(source));
}

function compactRecord(value) {
  return Object.fromEntries(Object.entries(record(value)).filter(([, item]) => (
    typeof item === 'string' ? item.trim() !== '' : isNonEmptyRecord(item)
  )));
}

function isNonEmptyRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(value) {
  return [...new Set(arrayValue(value).map((item) => firstString(item)).filter(Boolean))];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
