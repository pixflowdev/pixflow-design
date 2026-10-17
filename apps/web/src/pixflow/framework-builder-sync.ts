import type { PixflowDesignSystemProfile } from './framework';
import {
  buildFrameworkColorRamp,
  buildFrameworkNeutralRamp,
  resolveFrameworkDerivedTokens,
} from './framework-design-system';

export type PixflowBuilderStyleState = {
  themeStyles?: Record<string, unknown>;
  activeThemeStyleId?: string;
  colorPalette?: unknown[];
  globalVariables?: unknown[];
  globalVariableCategories?: unknown[];
  globalClasses?: unknown[];
  globalClassCategories?: unknown[];
  globalClassesLocked?: unknown[];
  styleManager?: Record<string, unknown>;
};

type BricksState = Record<string, unknown> & {
  forceRender?: number;
  rerenderControls?: number;
  globalChanges?: number;
  unsavedChanges?: unknown[];
};

type BricksGlobals = {
  $_state?: BricksState;
  $_forceRender?: () => void;
  $_forceRenderActiveInstance?: () => void;
  $_rerenderControls?: () => void;
};

type BricksVueApp = {
  config?: { globalProperties?: BricksGlobals };
  _context?: { provides?: Record<PropertyKey, unknown> };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getCanvasDocument() {
  for (const frame of Array.from(document.querySelectorAll('iframe'))) {
    try {
      if (frame.contentDocument?.querySelector('.brx-body')) return frame.contentDocument;
    } catch {
      // Cross-origin frames cannot be the same-origin Bricks canvas.
    }
  }
  return null;
}

function getBricksHosts() {
  const hosts = [
    document.querySelector('.brx-body'),
    getCanvasDocument()?.querySelector('.brx-body') ?? null,
  ];
  return hosts.filter(
    (host, index): host is HTMLElement =>
      host !== null &&
      host.nodeType === Node.ELEMENT_NODE &&
      hosts.indexOf(host) === index,
  );
}

function resolveVueApp(host: HTMLElement): BricksVueApp | null {
  return (host as HTMLElement & { __vue_app__?: BricksVueApp }).__vue_app__ ?? null;
}

function resolveGlobals(host: HTMLElement): BricksGlobals | null {
  const app = resolveVueApp(host);
  return app?.config?.globalProperties ?? null;
}

function isBricksState(value: unknown): value is BricksState {
  return isRecord(value) && (
    Array.isArray(value.content)
    || Array.isArray(value.header)
    || Array.isArray(value.footer)
  );
}

/**
 * Bricks 2.4 keeps the authoritative builder store in Vue's provided values
 * instead of exposing it as `$_state`. Resolve both shapes so a design-system
 * save updates the live builder rather than only the persisted options.
 */
function resolveState(host: HTMLElement, globals: BricksGlobals): BricksState | null {
  if (isRecord(globals.$_state)) return globals.$_state;

  const provides = resolveVueApp(host)?._context?.provides;
  if (!provides) return null;
  for (const key of Reflect.ownKeys(provides)) {
    const candidate = provides[key];
    if (isBricksState(candidate)) return candidate;
  }
  return null;
}

function getBricksContexts() {
  return getBricksHosts().flatMap((host) => {
    const globals = resolveGlobals(host);
    const state = globals ? resolveState(host, globals) : null;
    return globals && state ? [{ globals, state }] : [];
  });
}

function buildGlobalClassIndex(globalClasses: unknown[]) {
  return globalClasses.reduce<Record<string, number>>((index, entry, position) => {
    if (!isRecord(entry)) return index;
    const id = String(entry.id ?? '').trim();
    if (id) index[id] = position;
    return index;
  }, {});
}

function linkStyleManagerCollections(target: Record<string, unknown>) {
  if (!isRecord(target.styleManager)) return;
  const styleManager = target.styleManager;
  for (const key of [
    'colorPalette',
    'globalVariables',
    'globalVariablesCategories',
    'globalClasses',
    'globalClassesCategories',
    'globalClassesLocked',
  ]) {
    if (Array.isArray(target[key])) styleManager[key] = target[key];
  }
}

function applyCollections(target: Record<string, unknown>, state: PixflowBuilderStyleState) {
  if (state.themeStyles) target.themeStyles = clone(state.themeStyles);
  if (state.activeThemeStyleId) {
    target.themeStyleActiveId = state.activeThemeStyleId;
    target.themeStyleActiveIds = [state.activeThemeStyleId];
    const active = state.themeStyles?.[state.activeThemeStyleId];
    if (active) target.selectedThemeStyle = clone(active);
  }
  if (state.colorPalette) target.colorPalette = clone(state.colorPalette);
  if (state.globalVariables) target.globalVariables = clone(state.globalVariables);
  if (state.globalVariableCategories) target.globalVariablesCategories = clone(state.globalVariableCategories);
  if (state.globalClasses) {
    const globalClasses = clone(state.globalClasses);
    target.globalClasses = globalClasses;
    target.globalClassIndexById = buildGlobalClassIndex(globalClasses);
    target.globalClassesTimestamp = String(Date.now());
  }
  if (state.globalClassCategories) target.globalClassesCategories = clone(state.globalClassCategories);
  if (state.globalClassesLocked) target.globalClassesLocked = clone(state.globalClassesLocked);
  if (isRecord(target.styleManager)) {
    if (state.themeStyles) target.styleManager.themeStyles = target.themeStyles;
    if (state.activeThemeStyleId) {
      target.styleManager.themeStyleActiveId = target.themeStyleActiveId;
      target.styleManager.themeStyleActiveIds = target.themeStyleActiveIds;
      target.styleManager.selectedThemeStyle = target.selectedThemeStyle;
    }
    linkStyleManagerCollections(target);
  }
}

function collectDeclarations(state: PixflowBuilderStyleState) {
  const declarations = new Map<string, string>();
  for (const palette of state.colorPalette ?? []) {
    if (!isRecord(palette) || !Array.isArray(palette.colors)) continue;
    for (const color of palette.colors) {
      if (!isRecord(color)) continue;
      const match = String(color.raw ?? '').match(/^var\((--[^)]+)\)$/);
      const fallback = isRecord(color.rawValue) ? color.rawValue.light : '';
      const value = String(color.light ?? fallback ?? '').trim();
      if (match?.[1] && value) declarations.set(match[1], value);
    }
  }
  for (const variable of state.globalVariables ?? []) {
    if (!isRecord(variable)) continue;
    const name = String(variable.name ?? '').replace(/^--/, '').trim();
    const value = String(variable.value ?? '').trim();
    if (name && value) declarations.set(`--${name}`, value);
  }
  return declarations;
}

const PROFILE_SCHEMES = ['main', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary'] as const;

/**
 * Build the scheme declarations directly from the modal profile. The save
 * response is authoritative for Bricks collections, but it can arrive after
 * the modal has yielded control back to the builder. Publishing these values
 * optimistically keeps existing scheme assignments visually stable meanwhile.
 */
function collectProfileColorDeclarations(profile: PixflowDesignSystemProfile) {
  const declarations = new Map<string, string>();
  const neutral = buildFrameworkNeutralRamp(profile.neutralTintHex ?? null);
  [
    ['light', neutral[0]],
    ['neutral-l-3', neutral[1]],
    ['neutral-l-2', neutral[2]],
    ['neutral-l-1', neutral[3]],
    ['neutral', neutral[4]],
    ['neutral-d-1', neutral[5]],
    ['neutral-d-2', neutral[6]],
    ['neutral-d-3', neutral[7]],
    ['dark', neutral[7]],
    ['shadow', neutral[1]],
  ].forEach(([name, value]) => {
    if (name && value) declarations.set(`--${name}`, value);
  });

  const paletteNames = ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary'];
  (profile.sourcePalette ?? []).forEach((value, index) => {
    const name = paletteNames[index];
    if (name && value) declarations.set(`--${name}`, value);
  });

  const count = Math.max(1, Math.min(6, profile.colorSchemeCount ?? 3));
  PROFILE_SCHEMES.slice(0, count).forEach((scheme, index) => {
    const group = profile.colors[scheme] ?? profile.colors.main;
    const derived = resolveFrameworkDerivedTokens(group, profile.designStyle);
    const prefix = index === 0 ? '' : `s${index + 1}-`;
    const values = {
      background: derived.background,
      foreground: derived.foreground,
      heading: derived.heading,
      text: derived.text,
      accent: derived.accent,
      border: derived.border,
      input: derived.input,
      'btn-text': derived.buttonText,
    };
    Object.entries(values).forEach(([name, value]) => declarations.set(`--${prefix}${name}`, value));

    const accentRamp = buildFrameworkColorRamp(derived.accent);
    accentRamp.light.forEach((value, shade) => declarations.set(`--${prefix}accent-l-${shade + 1}`, value));
    accentRamp.dark.forEach((value, shade) => declarations.set(`--${prefix}accent-d-${shade + 1}`, value));
    buildFrameworkColorRamp(derived.background).legacyDark.forEach((value, shade) => {
      declarations.set(`--${prefix}background-d-${shade + 1}`, value);
    });
    buildFrameworkColorRamp(derived.foreground).legacyDark.forEach((value, shade) => {
      declarations.set(`--${prefix}foreground-d-${shade + 1}`, value);
    });
  });
  return declarations;
}

function buildPreviewCss(profile: PixflowDesignSystemProfile, declarations: Map<string, string>) {
  const weight = profile.headingWeightPreset === 'bold' ? '700' : profile.headingWeightPreset === 'normal' ? '400' : '600';
  const lineHeight = profile.headingStylePreset === 'uppercase' ? '1.1' : profile.headingStylePreset === 'spacious' ? '1.3' : '1.2';
  const transform = profile.headingStylePreset === 'uppercase' ? 'uppercase' : 'none';
  const spacing = profile.headingStylePreset === 'uppercase' ? '0.04em' : '0em';
  return [
    `:root{${Array.from(declarations, ([name, value]) => `${name}:${value};`).join('')}}`,
    `body{font-family:"${profile.bodyFont}",sans-serif;}`,
    `h1,h2,h3,h4,h5,h6{font-family:"${profile.headingFont}",sans-serif;font-weight:${weight};line-height:${lineHeight};text-transform:${transform};letter-spacing:${spacing};}`,
  ].join('\n');
}

function activeThemeStyleCss(state: PixflowBuilderStyleState) {
  if (!state.activeThemeStyleId || !state.themeStyles) return '';
  const style = state.themeStyles[state.activeThemeStyleId];
  if (!isRecord(style) || !isRecord(style.settings) || !isRecord(style.settings.css)) return '';
  return String(style.settings.css.stylesheet ?? '');
}

function managedGlobalClassCss(state: PixflowBuilderStyleState) {
  return (state.globalClasses ?? [])
    .filter(isRecord)
    .map((entry) => {
      if (!isRecord(entry.settings)) return '';
      const name = String(entry.name ?? '');
      const css = String(entry.settings._cssCustom ?? '').trim();
      return /^color-scheme-[2-6]$/.test(name) ? css : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function managedProfileClassCss(profile: PixflowDesignSystemProfile) {
  const count = Math.max(1, Math.min(6, profile.colorSchemeCount ?? 3));
  return PROFILE_SCHEMES.slice(1, count).map((_, index) => {
    const schemeNumber = index + 2;
    const names = [
      'background', 'background-d-1', 'background-d-2', 'background-d-3',
      'background-d-4', 'background-d-5', 'background-d-6', 'background-d-7',
      'foreground', 'foreground-d-1', 'foreground-d-2', 'foreground-d-3',
      'foreground-d-4', 'foreground-d-5', 'foreground-d-6', 'foreground-d-7',
      'accent', 'accent-d-1', 'accent-d-2', 'accent-d-3',
      'accent-l-1', 'accent-l-2', 'accent-l-3',
      'heading', 'text', 'border', 'input', 'btn-text',
    ];
    return `.color-scheme-${schemeNumber}{${names.map((name) => (
      `--${name}:var(--s${schemeNumber}-${name});`
    )).join('')}}`;
  }).join('\n');
}

function syncPreviewCss(state: PixflowBuilderStyleState, profile: PixflowDesignSystemProfile) {
  const canvas = getCanvasDocument();
  const documents = [document, canvas].filter((value): value is Document => value !== null);
  const declarations = collectDeclarations(state);
  for (const [name, value] of collectProfileColorDeclarations(profile)) declarations.set(name, value);
  const css = [
    buildPreviewCss(profile, declarations),
    managedGlobalClassCss(state) || managedProfileClassCss(profile),
    activeThemeStyleCss(state),
  ].filter(Boolean).join('\n\n');
  for (const target of documents) {
    let style = target.getElementById('pixflow-design-system-live-sync');
    const StyleElement = target.defaultView?.HTMLStyleElement ?? HTMLStyleElement;
    if (!(style instanceof StyleElement)) {
      style = target.createElement('style');
      style.id = 'pixflow-design-system-live-sync';
      target.head?.append(style);
    }
    style.textContent = css;
    target.head?.append(style);
    for (const [name, value] of declarations) target.documentElement.style.setProperty(name, value);
  }
}

function announceLiveProfile(profile: PixflowDesignSystemProfile) {
  const schemeCount = Math.max(1, Math.min(6, profile.colorSchemeCount ?? 3));
  const canvasWindow = getCanvasDocument()?.defaultView;
  const targets: Window[] = [window];
  if (canvasWindow && canvasWindow !== window) targets.push(canvasWindow);

  for (const target of targets) {
    const event = target.document.createEvent('CustomEvent');
    event.initCustomEvent(
      'pixflow-design:live-structure-profile',
      false,
      false,
      { colorSchemeCount: schemeCount },
    );
    target.dispatchEvent(event);
    target.document.dispatchEvent(event);
  }

  // Bricks can expose its preview window while deliberately withholding the
  // iframe document from the builder shell. The canvas bridge therefore also
  // accepts this same-origin message path instead of waiting for its poller.
  for (const frame of Array.from(document.querySelectorAll('iframe'))) {
    frame.contentWindow?.postMessage({
      source: 'pixflow-design',
      type: 'pixflow-design:live-structure-profile',
      profile: { colorSchemeCount: schemeCount },
    }, window.location.origin);
  }
}

function rerenderBricksControls() {
  for (const { globals, state } of getBricksContexts()) {
    if (typeof state.rerenderControls === 'number') state.rerenderControls += 1;
    globals.$_rerenderControls?.();
    globals.$_forceRenderActiveInstance?.();
  }
}

/**
 * Keep the Bricks scheme control aligned with the modal draft, matching the
 * live structure bridge that shipped in the legacy Pixflow AI plugin.
 */
export function syncPixflowDesignSystemStructureIntoBricks(
  profile: PixflowDesignSystemProfile,
) {
  announceLiveProfile(profile);
  window.requestAnimationFrame(rerenderBricksControls);
  window.setTimeout(rerenderBricksControls, 250);
}

export function syncPixflowDesignSystemDraftIntoBricks(profile: PixflowDesignSystemProfile) {
  syncPreviewCss({}, profile);
}

export function syncPixflowDesignSystemIntoBricks(
  state: PixflowBuilderStyleState,
  profile: PixflowDesignSystemProfile,
) {
  for (const { globals, state: bricksState } of getBricksContexts()) {
    const unsaved = Array.isArray(bricksState.unsavedChanges) ? [...bricksState.unsavedChanges] : null;
    applyCollections(bricksState, state);
    if (typeof bricksState.forceRender === 'number') bricksState.forceRender += 1;
    if (typeof bricksState.rerenderControls === 'number') bricksState.rerenderControls += 1;
    if (typeof bricksState.globalChanges === 'number') bricksState.globalChanges += 1;
    globals.$_forceRender?.();
    globals.$_forceRenderActiveInstance?.();
    globals.$_rerenderControls?.();
    if (unsaved) bricksState.unsavedChanges = unsaved;
  }

  const bricksData = (window as Window & { bricksData?: Record<string, unknown> }).bricksData;
  if (bricksData) {
    applyCollections(bricksData, state);
    if (isRecord(bricksData.loadData)) applyCollections(bricksData.loadData, state);
  }

  syncPreviewCss(state, profile);
  syncPixflowDesignSystemStructureIntoBricks(profile);
  window.requestAnimationFrame(() => syncPreviewCss(state, profile));
  window.setTimeout(() => syncPreviewCss(state, profile), 250);
  window.setTimeout(() => syncPreviewCss(state, profile), 900);
}

/** Merge one saved system without replacing unrelated, possibly unsaved classes. */
export function syncBricksLibrarySystem(id: string, snapshot: PixflowBuilderStyleState) {
  const contexts = getBricksContexts();
  for (const { state, globals } of contexts) {
    const incoming: PixflowBuilderStyleState = {};
    for (const [key, target] of [
      ['globalVariables', 'globalVariables'], ['globalVariableCategories', 'globalVariablesCategories'],
      ['globalClasses', 'globalClasses'], ['globalClassCategories', 'globalClassesCategories'], ['colorPalette', 'colorPalette'],
    ] as const) {
      const owned = (snapshot[key] ?? []).filter(row => isRecord(row) && (row.id === id || String(row.id).startsWith(`${id}-`)));
      const ownedIds = new Set(owned.map(row => (row as Record<string, unknown>).id));
      const existing = Array.isArray(state[target]) ? state[target] as unknown[] : [];
      incoming[key] = [...existing.filter(row => !isRecord(row) || !ownedIds.has(row.id)), ...owned];
    }
    if (snapshot.themeStyles?.[id]) incoming.themeStyles = { ...(isRecord(state.themeStyles) ? state.themeStyles : {}), [id]: snapshot.themeStyles[id] };
    applyCollections(state, incoming);
    if (typeof state.forceRender === 'number') state.forceRender += 1;
    globals.$_forceRender?.(); globals.$_rerenderControls?.();
  }
  const canvas = getCanvasDocument() || document;
  const styleId = `pixflow-library-${id}`;
  let style = canvas.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) { style = canvas.createElement('style'); style.id = styleId; canvas.head.appendChild(style); }
  style.textContent = `:root{${[...collectDeclarations(snapshot)].filter(([name]) => name.startsWith(`--${id}-`)).map(([name, value]) => `${name}:${value}`).join(';')}}`;
  return contexts.length > 0;
}
