import { useT } from '../i18n';
import { en } from '../i18n/locales/en';
import selectStyles from './SearchableModelSelect.module.css';
import { Combobox } from '@base-ui/react/combobox';
import { forwardRef, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { AgentModelOption } from '../types';
import { workspacePortalTarget, workspacePortalThemeStyle } from './workspacePortalTarget';

export function renderModelOptions(models: AgentModelOption[]) {
  const groups = new Map<string, AgentModelOption[]>();
  const flat: AgentModelOption[] = [];
  for (const m of models) {
    const slash = m.id.indexOf('/');
    if (m.id === 'default' || slash <= 0) {
      flat.push(m);
      continue;
    }
    const provider = m.id.slice(0, slash);
    const arr = groups.get(provider) ?? [];
    arr.push(m);
    groups.set(provider, arr);
  }
  flat.sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : 0));
  if (groups.size === 0) {
    return (
      <>
        {flat.map((m) => (
          <option key={m.id} value={m.id} disabled={m.enabled === false}>
            {m.label}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      {flat.map((m) => (
        <option key={m.id} value={m.id} disabled={m.enabled === false}>
          {m.label}
        </option>
      ))}
      {Array.from(groups.entries()).map(([provider, items]) => (
        <optgroup key={provider} label={provider}>
          {items.map((m) => (
            <option key={m.id} value={m.id} disabled={m.enabled === false}>
              {m.label.startsWith(`${provider}/`)
                ? m.label.slice(provider.length + 1)
                : m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function orderModelOptionsByAvailability(
  models: AgentModelOption[],
): AgentModelOption[] {
  return [
    ...models.filter((model) => model.enabled !== false),
    ...models.filter((model) => model.enabled === false),
  ];
}

export function modelTradeoffLabel(model: AgentModelOption, t: ReturnType<typeof useT> = (key, vars) => en[key].replace(/\{(\w+)\}/g, (token, name: string) => String(vars?.[name] ?? token))): string | null {
  const labels: string[] = [];
  const cost = model.metadata?.cost;
  if (cost === 'low') labels.push(t('model.cost.low'));
  else if (cost === 'medium') labels.push(t('model.cost.medium'));
  else if (cost === 'high') labels.push(t('model.cost.high'));
  else if (cost === 'very_high') labels.push(t('model.cost.veryHigh'));
  else if (model.inputPriceUsdPerMillion !== undefined) {
    labels.push(t('model.cost.input', { price: model.inputPriceUsdPerMillion.toFixed(2) }));
  }
  const capability = model.metadata?.capability;
  if (capability === 'best_quality') labels.push(t('model.capability.best'));
  else if (capability === 'advanced') labels.push(t('model.capability.advanced'));
  else if (capability === 'standard') labels.push(t('model.capability.standard'));
  if (model.enabled === false) labels.push(t('model.unavailable'));
  return labels.length > 0 ? labels.join(' · ') : null;
}

function matchesModelSearch(model: AgentModelOption, query: string): boolean {
  const haystack = `${model.id}\n${model.label}`.toLowerCase();
  return haystack.includes(query);
}

interface SearchableModelSelectProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  models: AgentModelOption[];
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder: string;
  searchInputTestId?: string;
  popoverTestId?: string;
  popoverClassName?: string;
  additionalOptions?: Array<{ value: string; label: string }>;
  minSearchableOptions?: number;
  popoverMinWidth?: number;
}

export const SearchableModelSelect = forwardRef<
  HTMLButtonElement,
  SearchableModelSelectProps
>(function SearchableModelSelect(
  {
    models,
    value,
    onChange,
    searchPlaceholder,
    searchInputTestId,
    popoverTestId,
    popoverClassName,
    additionalOptions,
    minSearchableOptions = 8,
    popoverMinWidth,
    className,
    ...buttonProps
  },
  ref,
) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const allOptions = useMemo(() => {
    const merged = new Map<string, AgentModelOption>();
    for (const option of models) merged.set(option.id, option);
    for (const option of additionalOptions ?? []) {
      if (!merged.has(option.value)) {
        merged.set(option.value, { id: option.value, label: option.label });
      }
    }
    return orderModelOptionsByAvailability(Array.from(merged.values()));
  }, [additionalOptions, models]);
  const selectedOption =
    allOptions.find((option) => option.id === value) ??
    (value ? { id: value, label: value } : allOptions[0] ?? null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return allOptions;
    return allOptions.filter(
      (option) =>
        option.id === value ||
        option.id === CUSTOM_MODEL_SENTINEL ||
        matchesModelSearch(option, normalizedQuery),
    );
  }, [allOptions, normalizedQuery, value]);
  const shouldShowSearch = allOptions.length >= minSearchableOptions;
  const portalTarget = open ? workspacePortalTarget(buttonRef.current) : null;
  // The containing account dialog owns a stacking context. Its child picker
  // must sit above that context when both are siblings in the theme portal.
  let popupLayer = 10030;
  if (open) for (let node = buttonRef.current?.parentElement; node && node !== portalTarget; node = node.parentElement) {
    const layer = Number.parseInt(getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(layer)) popupLayer = Math.max(popupLayer, layer + 1);
  }

  return <div className={`model-select-searchable${open ? ' is-open' : ''}`}>
    <Combobox.Root items={filteredOptions.map(option => option.id)} filter={null}
      value={value} inputValue={query} onInputValueChange={setQuery}
      open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(''); }}
      onValueChange={next => { if (next !== null) onChange(next); }}
      itemToStringLabel={id => allOptions.find(option => option.id === id)?.label ?? id}>
      <Combobox.Trigger {...buttonProps} data-slot="model-selector-trigger"
        ref={node => { buttonRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
        className={`${className ?? ''} ${selectStyles.trigger}`}>
        {selectedOption?.label ?? ''}
        <svg className={selectStyles.chevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </Combobox.Trigger>
      <Combobox.Portal container={portalTarget}>
        <Combobox.Positioner sideOffset={6} align="start" positionMethod="fixed" className={selectStyles.positioner}
          style={{ ...workspacePortalThemeStyle(buttonRef.current), zIndex: popupLayer }}>
          <Combobox.Popup data-slot="model-selector-content" data-testid={popoverTestId}
            initialFocus={shouldShowSearch ? searchRef : false} finalFocus={buttonRef}
            className={`model-select-searchable__popover ${selectStyles.popup}${popoverClassName ? ` ${popoverClassName}` : ''}`}
            style={{ minWidth: popoverMinWidth, ...workspacePortalThemeStyle(buttonRef.current) }}>
            {shouldShowSearch && <div className="model-select-searchable__search-row">
              <Combobox.Input ref={searchRef} type="search" className="ds-picker-search model-select-searchable__input"
                placeholder={searchPlaceholder} aria-label={searchPlaceholder} data-testid={searchInputTestId}/>
            </div>}
            <Combobox.List className={`model-select-searchable__list ${selectStyles.list}`}>
              {filteredOptions.map(option => <Combobox.Item key={option.id} value={option.id} disabled={option.enabled === false}
                className={`model-select-searchable__option${option.id === value ? ' is-active' : ''}${option.enabled === false ? ' is-disabled' : ''}`}
                data-selected={option.id === value ? 'true' : undefined}>
                <span className="model-select-searchable__option-label">{option.label}</span>
                {modelTradeoffLabel(option, t) && <span className="model-select-searchable__option-meta">{modelTradeoffLabel(option, t)}</span>}
              </Combobox.Item>)}
              {filteredOptions.length === 0 && <Combobox.Empty className="model-select-searchable__empty">{t('model.noMatches')}</Combobox.Empty>}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  </div>;
});

export function isCustomModel(
  modelId: string | null | undefined,
  models: AgentModelOption[],
): boolean {
  if (!modelId) return false;
  return !models.some((m) => m.id === modelId);
}

export const CUSTOM_MODEL_SENTINEL = '__custom__';
