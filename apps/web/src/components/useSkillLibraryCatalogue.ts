import { useCallback, useEffect, useState } from 'react';
import type { SkillLibraryResponse } from '@open-design/contracts';
import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';

export function availableSkillUpdates(state: SkillLibraryResponse | null) {
  return state?.pro ? state.skills.filter(item => item.installedVersion && item.updateAvailable && item.canInstall && item.digest) : [];
}

/** One catalogue per open settings dialog, shared by navigation and management. */
export function useSkillLibraryCatalogue(enabled = true) {
  const [state, setState] = useState<SkillLibraryResponse | null>(null);
  const [error, setError] = useState('');
  const active = enabled && hasPixflowWordPressContext();
  const load = useCallback(async (refresh = false) => {
    if (!active) return;
    const response = await pixflowWordPressRestFetch(`/skill-library${refresh ? '?refresh=1' : ''}`);
    const data = await response.json() as SkillLibraryResponse;
    if (response.status === 403) { setState({ skills: [], error: null, pro: false }); return; }
    if (!response.ok) throw new Error(data.error || response.statusText);
    setState(data);
  }, [active]);
  useEffect(() => { void load().catch(e => setError(String(e.message))); }, [load]);
  return { state, error, setError, load };
}

export type SkillLibraryCatalogue = ReturnType<typeof useSkillLibraryCatalogue>;
