import { useT as usePixflowUiTranslation } from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { IconBolt } from '@tabler/icons-react';
import type { PixflowSurface, PixflowWpAdminCapabilitySummaryResponse } from '@open-design/contracts';
import { Icon } from './Icon';
import { requestWordPressRest } from '../pixflow/license';
import styles from './PixflowMcpSection.module.css';
import { localizeAbilityLabel, localizeAbilityText } from '../i18n/ability-display';
import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';

type Catalogue = PixflowWpAdminCapabilitySummaryResponse;
type CatalogueCache = { key: string; value: Catalogue | null; checkedAt: number; pending: Promise<Catalogue> | null };
let pageCatalogue: CatalogueCache | null = null;
function catalogueCache(): CatalogueCache {
  const config = getPixflowWordPressConfig();
  const access = typeof window === 'undefined' ? undefined : window.__PIXFLOW_DESIGN_LICENSE_STATUS_CACHE__?.value;
  // Display metadata only, kept in this page's memory. Server permissions still
  // govern every operation; site/user/nonce/access changes cannot reuse a list.
  const key = JSON.stringify([config?.restBaseUrl, config?.restRouteBaseUrl, config?.siteHash,
    config?.userId, config?.restNonce, access?.license.valid, access?.central_entitlement]);
  if (pageCatalogue?.key !== key) pageCatalogue = { key, value: null, checkedAt: 0, pending: null };
  return pageCatalogue;
}

async function fetchCatalogue(force: boolean, failure: string, invalid: string): Promise<Catalogue> {
  const cache = catalogueCache();
  if (cache.pending) return cache.pending;
  if (!force && cache.value && Date.now() - cache.checkedAt < 30_000) return cache.value;
  cache.pending = (async () => {
    const response = await requestWordPressRest<Catalogue & { message?: string }>('wp-admin/capabilities', { method: 'GET' });
    if (!response.ok) throw new Error(response.body?.message || failure);
    if (!Array.isArray(response.body?.families) || !Array.isArray(response.body?.unavailable)) throw new Error(invalid);
    cache.value = response.body;
    cache.checkedAt = Date.now();
    return response.body;
  })().finally(() => { cache.pending = null; });
  return cache.pending;
}

/** Abilities are executable actions; skill preferences belong in Skills. */
export function PixflowMcpSection(_props: { surface?: PixflowSurface }) {
  const translateUi = usePixflowUiTranslation();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(() => catalogueCache().value);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const alive = useRef(true);
  const requestId = useRef(0);
  const load = useCallback(async (force = false) => {
    const id = ++requestId.current;
    const cache = catalogueCache();
    const current = () => alive.current && id === requestId.current && catalogueCache() === cache;
    setCatalogue(cache.value);
    setLoading(true); setError('');
    try {
      const result = await fetchCatalogue(force, translateUi("ui.pixflowMcpSection.feedback64"), translateUi("ui.pixflowMcpSection.feedback65"));
      if (current()) setCatalogue(result);
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : translateUi("ui.pixflowMcpSection.feedback64")); }
    finally { if (current()) setLoading(false); }
  }, [translateUi]);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; requestId.current++; }; }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);
  const query = search.trim().toLowerCase();
  const families = useMemo(() => (catalogue?.families ?? []).filter(family => family.available).flatMap(family => {
    const displayLabel = localizeAbilityText(family.label, translateUi);
    const displayDescription = localizeAbilityText(family.description, translateUi);
    const match = `${family.label} ${family.description} ${displayLabel} ${displayDescription}`.toLowerCase().includes(query);
    const abilities = (family.capabilities ?? []).map(ability => ({ ...ability, displayLabel: localizeAbilityLabel(ability, displayLabel, translateUi) }))
      .filter(ability => match || `${ability.label} ${ability.displayLabel} ${ability.id}`.toLowerCase().includes(query));
    return match || abilities.length ? [{ ...family, displayLabel, displayDescription, capabilities: abilities }] : [];
  }), [catalogue, query, translateUi]);
  const unavailable = (catalogue?.unavailable ?? []).map(family => ({ ...family, displayLabel: localizeAbilityText(family.label, translateUi) }))
    .filter(family => `${family.label} ${family.displayLabel}`.toLowerCase().includes(query));
  return <section className={`settings-section ${styles.root}`} aria-busy={loading}>
    <p className={styles.intro}>{translateUi("ui.pixflowMcpSection.abilitiesAreActionsAgentsCanPerformIntegrations")}</p>
    <div className={styles.toolbar}>
      <input className="library-search" type="search" aria-label={translateUi("ui.pixflowMcpSection.searchAbilities")} placeholder={translateUi("ui.pixflowMcpSection.searchAbilities")} value={search} onChange={event => setSearch(event.target.value)} />
      <Button onClick={() => { void load(true); }} disabled={loading}><Icon name="refresh" size={15} />{loading ? translateUi("liveArtifact.refresh.statusRunning") : translateUi("designFiles.refresh")}</Button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading && !catalogue && <p role="status" className={styles.muted}>{translateUi("ui.pixflowMcpSection.checkingThisSiteSAbilities")}</p>}
    <div className={styles.list}>{families.map(family => <details key={family.id} className={styles.family} open={query ? true : undefined}>
      <summary><IconBolt size={18} stroke={1.6} aria-hidden="true" /><span className={styles.name}>{family.displayLabel}</span><span className={styles.count}>{family.capabilities?.length ?? 0}</span><span className={styles.active}>{translateUi("chat.importDesignSystemActive")}</span><Icon name="chevron-down" size={14} /></summary>
      <div className={styles.body}><p className={styles.muted}>{family.displayDescription}</p><ul>{family.capabilities?.map(ability => <li key={ability.id}>{ability.displayLabel}</li>)}</ul>{!family.capabilities?.length && <p className={styles.muted}>{translateUi("ui.pixflowMcpSection.noActionsAreAvailableForThisIntegration")}</p>}</div>
    </details>)}</div>
    {!loading && !error && !families.length && <p className={styles.muted}>{query ? translateUi("ui.pixflowMcpSection.noActiveAbilitiesMatchYourSearch") : translateUi("ui.pixflowMcpSection.noActiveAbilitiesWereReportedByThis")}</p>}
    {unavailable.length > 0 && <details className={styles.unavailable} open={query ? true : undefined}><summary><span className={styles.disclosureCopy}><strong>{translateUi("ui.pixflowMcpSection.unavailableIntegrations")} <span className={styles.count}>{unavailable.length}</span></strong><span>{translateUi("ui.pixflowMcpSection.reviewPlanRequirementsAndInactiveIntegrations")}</span></span><Icon name="chevron-down" size={16} className={styles.chevron} /></summary>
      <div className={styles.unavailableBody}>{unavailable.map(family => <div key={family.id} className={`${styles.unavailableRow}${family.requiresPro ? ` ${styles.proRow}` : ''}`} aria-disabled={family.requiresPro || undefined}><IconBolt size={17} stroke={1.6} className={styles.unavailableIcon} aria-hidden="true" /><div className={styles.unavailableCopy}><span>{family.displayLabel}</span><small>{family.requiresPro ? translateUi("ui.pixflowMcpSection.requiresPixflowDesignPro") : family.reason === 'missing' ? translateUi("ui.pixflowMcpSection.notInstalledOrInactive") : family.reason === 'inactive' ? translateUi("ui.bricksExtensionsSection.inactive") : family.reason === 'incompatible' ? translateUi("ui.pixflowMcpSection.requiresACompatibleVersion", { value1: family.requiredVersion ? ` (${family.requiredVersion}+)` : '' }) : family.reason === 'wrong_edition' ? translateUi("ui.pixflowMcpSection.requiresASupportedEdition") : translateUi("connectors.unavailable")}</small></div>{family.requiresPro && <span className={styles.proBadge}>{translateUi("ui.chatComposer.pro")}</span>}</div>)}</div>
    </details>}
  </section>;
}
