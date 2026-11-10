import type { PixflowDirectSiteSession } from '@open-design/contracts';
/** Replace stale client snapshots; preserve explicit per-turn references and live editor context. */
export function withRunDesignGuidance(context: unknown, session: PixflowDirectSiteSession): Record<string, unknown> {
  const { siteDesignGuidance: _previous, ...rest } = context && typeof context === 'object' && !Array.isArray(context) ? context as Record<string, unknown> : {};
  if (!session.designGuidance) return rest;
  // Optional operation instructions are selected separately for the current preference.
  // Never smuggle them into ordinary reference data when the operation is disabled.
  const { extension: _extension, ...guidance } = session.designGuidance;
  return { ...rest, siteDesignGuidance: guidance };
}
