import { useT } from '../i18n';
import { en } from '../i18n/locales/en';
import selectStyles from './SearchableModelSelect.module.css';
import { createPortal } from 'react-dom';
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  const [popoverStyle, setPopoverStyle] = useState<({ left: number; width: number; maxHeight: number } & ({ top: number; bottom?: never } | { bottom: number; top?: never })) | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useMemo(
    () => `model-picker-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );
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

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handlePopoverKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect =
        buttonRef.current?.getBoundingClientRect() ??
        wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = typeof window === 'undefined' ? rect.width : window.innerWidth;
      const viewportHeight = typeof window === 'undefined' ? rect.height : window.innerHeight;
      const portalComputed = portalTarget ? window.getComputedStyle(portalTarget) : null;
      const portalCreatesFixedContainingBlock = Boolean(portalComputed && (
        portalComputed.transform !== 'none'
        || portalComputed.perspective !== 'none'
        || portalComputed.filter !== 'none'
        || portalComputed.backdropFilter !== 'none'
        || /(?:layout|paint|strict|content)/.test(portalComputed.contain)
        || /(?:transform|perspective|filter)/.test(portalComputed.willChange)
      ));
      const portalRect = portalCreatesFixedContainingBlock
        ? portalTarget?.getBoundingClientRect()
        : null;
      const coordinateOffsetLeft = portalRect?.left ?? 0;
      const coordinateOffsetTop = portalRect?.top ?? 0;
      const coordinateBottom = portalRect?.bottom ?? viewportHeight;
      const desiredWidth = Math.max(rect.width, popoverMinWidth ?? 0);
      const maxWidth = Math.max(160, viewportWidth - 16);
      const width = Math.min(desiredWidth, maxWidth);
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, viewportWidth - width - 8),
      );
      const availableBelow = Math.max(0, viewportHeight - rect.bottom - 12);
      const availableAbove = Math.max(0, rect.top - 12);
      const shouldOpenUpward = availableBelow < 260 && availableAbove > availableBelow;
      const maxHeight = Math.min(360, shouldOpenUpward ? availableAbove : availableBelow);
      if (shouldOpenUpward) {
        setPopoverStyle({
          bottom: Math.max(8, coordinateBottom - rect.top + 6),
          left: left - coordinateOffsetLeft,
          width,
          maxHeight,
        });
        return;
      }
      setPopoverStyle({
        top: rect.bottom + 6 - coordinateOffsetTop,
        left: left - coordinateOffsetLeft,
        width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, popoverMinWidth, portalTarget]);

  useEffect(() => {
    if (!open || !shouldShowSearch) return;
    searchRef.current?.focus();
  }, [open, shouldShowSearch]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <div className={`model-select-searchable${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        {...buttonProps}
        ref={(node) => {
          buttonRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        className={`${className ?? ''} ${selectStyles.trigger}`}
        onClick={(event) => {
          buttonProps.onClick?.(event);
          if (!event.defaultPrevented) setOpen((prev) => !prev);
        }}
      >
        {selectedOption?.label ?? ''}
        <svg className={selectStyles.chevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && popoverStyle && portalTarget
        ? createPortal(
            <div
              ref={popoverRef}
              className={`model-select-searchable__popover${popoverClassName ? ` ${popoverClassName}` : ''}`}
              role="presentation"
              data-testid={popoverTestId}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handlePopoverKeyDown}
              style={{
                ...workspacePortalThemeStyle(buttonRef.current),
                position: 'fixed',
                top: popoverStyle.top != null ? `${popoverStyle.top}px` : 'auto',
                bottom: popoverStyle.bottom != null ? `${popoverStyle.bottom}px` : 'auto',
                left: `${popoverStyle.left}px`,
                width: `${popoverStyle.width}px`,
                maxHeight: `${popoverStyle.maxHeight}px`,
              }}
            >
              {shouldShowSearch ? (
                <div className="model-select-searchable__search-row">
                  <input
                    ref={searchRef}
                    type="search"
                    className="ds-picker-search model-select-searchable__input"
                    value={query}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    data-testid={searchInputTestId}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              ) : null}
              <div
                className={`model-select-searchable__list ${selectStyles.list}`}
                id={listboxId}
                role="listbox"
                style={{
                  maxHeight: `${Math.max(0, popoverStyle.maxHeight - (shouldShowSearch ? 52 : 12))}px`,
                }}
              >
                {filteredOptions.map((option) => {
                  const active = option.id === value;
                  const disabled = option.enabled === false;
                  const tradeoff = modelTradeoffLabel(option, t);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-disabled={disabled}
                      disabled={disabled}
                      className={`model-select-searchable__option${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                      data-selected={active ? 'true' : undefined}
                      onClick={() => {
                        if (disabled) return;
                        onChange(option.id);
                        setOpen(false);
                      }}
                    >
                      <span className="model-select-searchable__option-label">{option.label}</span>
                      {tradeoff ? (
                        <span className="model-select-searchable__option-meta">{tradeoff}</span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredOptions.length === 0 ? (
                  <div className="model-select-searchable__empty">{t('model.noMatches')}</div>
                ) : null}
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
});

export function isCustomModel(
  modelId: string | null | undefined,
  models: AgentModelOption[],
): boolean {
  if (!modelId) return false;
  return !models.some((m) => m.id === modelId);
}

export const CUSTOM_MODEL_SENTINEL = '__custom__';
