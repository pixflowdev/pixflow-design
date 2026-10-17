import { useT as usePixflowUiTranslation } from '../i18n';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

// Pixflow-owned: shared WordPress project sync controls live outside OD's
// generation/chat flow and only operate on explicit user actions.
import { isPixflowWordPressEmbed } from '../pixflow/license';
import {
  acquirePixflowWordPressProjectLock,
  exportPixflowProjectToWordPress,
  fetchPixflowSyncStatus,
  fetchPixflowWordPressProject,
  importPixflowProjectFromWordPress,
  releasePixflowWordPressProjectLock,
  requestPixflowSyncAuth,
  type PixflowProjectSyncConflict,
  type PixflowSyncProject,
  type PixflowWordPressProjectLock,
} from '../pixflow/project-sync';
import { workspacePortalTarget } from './workspacePortalTarget';

interface PixflowProjectSyncControlProps {
  projectId: string;
  projectName: string;
  onToast?: (message: string) => void;
}

type SyncState = {
  loading: boolean;
  syncing: boolean;
  syncedProject: PixflowSyncProject | null;
  sharedProjectUuid: string | null;
  lock: PixflowWordPressProjectLock | null;
  conflict: PixflowProjectSyncConflict | null;
  error: string | null;
};

export function PixflowProjectSyncControl({
  projectId,
  projectName,
  onToast,
}: PixflowProjectSyncControlProps) {
  const translateUi = usePixflowUiTranslation();
  const sessionIdRef = useRef(`pixflow-${createSyncSessionId()}`);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [state, setState] = useState<SyncState>({
    loading: true,
    syncing: false,
    syncedProject: null,
    sharedProjectUuid: null,
    lock: null,
    conflict: null,
    error: null,
  });

  const refreshLocalSyncState = useCallback(async () => {
    const status = await fetchPixflowSyncStatus();
    const syncedProject = status.state?.projects?.[projectId] ?? null;
    setState((current) => ({
      ...current,
      loading: false,
      syncedProject,
      sharedProjectUuid: syncedProject?.wpProjectUuid ?? null,
      error: null,
    }));
    return syncedProject;
  }, [projectId]);

  const acquireLock = useCallback(async (wpProjectUuid: string) => {
    const lock = await acquirePixflowWordPressProjectLock({
      wpProjectUuid,
      sessionId: sessionIdRef.current,
      ttlSeconds: 180,
      metadata: {
        // Pixflow-owned: diagnostic-only lock metadata for team visibility.
        localProjectId: projectId,
        projectName,
      },
    });
    setState((current) => ({ ...current, lock, error: null }));
    return lock;
  }, [projectId, projectName]);

  useEffect(() => {
    let cancelled = false;
    let heartbeatId: number | null = null;
    let lockedProjectUuid = '';

    void (async () => {
      try {
        const syncedProject = await refreshLocalSyncState();
        const wpProjectUuid = syncedProject?.wpProjectUuid ?? '';
        if (!wpProjectUuid || !isPixflowWordPressEmbed()) return;

        lockedProjectUuid = wpProjectUuid;
        const lock = await acquirePixflowWordPressProjectLock({
          wpProjectUuid,
          sessionId: sessionIdRef.current,
          ttlSeconds: 180,
          metadata: {
            localProjectId: projectId,
            projectName,
          },
        });
        if (cancelled) return;
        setState((current) => ({ ...current, lock, error: null }));
        heartbeatId = window.setInterval(() => {
          void acquireLock(wpProjectUuid).catch((error) => {
            if (!cancelled) {
              setState((current) => ({
                ...current,
                error: error instanceof Error ? error.message : 'Could not renew shared project lock.',
              }));
            }
          });
        }, 60000);
      } catch {
        if (!cancelled) {
          // Pixflow-owned: old bridges without sync routes should read as local
          // projects, not as blocking workspace errors.
          setState((current) => ({ ...current, loading: false, error: null }));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (heartbeatId !== null) window.clearInterval(heartbeatId);
      if (lockedProjectUuid) {
        void releasePixflowWordPressProjectLock({
          wpProjectUuid: lockedProjectUuid,
          sessionId: sessionIdRef.current,
        }).catch(() => {});
      }
    };
  }, [acquireLock, projectId, projectName, refreshLocalSyncState]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      setMenuStyle({
        top: Math.round(anchor.bottom + 6),
        left: Math.round(Math.min(window.innerWidth - 336, Math.max(12, anchor.left))),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (buttonRef.current?.contains(target)) return;
      if ((target as Element | null)?.closest?.('.pixflow-project-sync-menu')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  const runSyncAction = useCallback(async (
    action: 'save' | 'save-as-new-version' | 'open-latest',
  ) => {
    setState((current) => ({ ...current, syncing: true, error: null, conflict: null }));
    try {
      const auth = await requestPixflowSyncAuth();
      const current = state.syncedProject ?? await refreshLocalSyncState();
      const wpProjectUuid = current?.wpProjectUuid ?? '';

      if (action === 'open-latest') {
        if (!wpProjectUuid) throw new Error(translateUi("ui.pixflowProjectSyncControl.feedback66"));
        await importPixflowProjectFromWordPress({
          wpProjectUuid,
          restBaseUrl: auth.restBaseUrl,
          token: auth.token,
          projectId,
          overwrite: true,
        });
        await refreshLocalSyncState();
        onToast?.('Latest shared project opened locally.');
        setState((current) => ({ ...current, syncing: false }));
        setOpen(false);
        return;
      }

      const result = await exportPixflowProjectToWordPress({
        projectId,
        restBaseUrl: auth.restBaseUrl,
        token: auth.token,
        wpProjectUuid,
        title: projectName,
        expectedVersionNumber: current?.latestVersion ?? null,
        expectedFileHash: current?.lastSyncedHash ?? '',
        lockSessionId: sessionIdRef.current,
        saveAsNewVersion: action === 'save-as-new-version',
      }) as { wpProjectUuid?: string };
      await refreshLocalSyncState();
      if (result.wpProjectUuid || wpProjectUuid) {
        await acquireLock(result.wpProjectUuid || wpProjectUuid);
      }
      onToast?.(action === 'save-as-new-version' ? 'Saved as a new shared version.' : 'Project saved to the site.');
      setOpen(false);
    } catch (error) {
      const maybeConflict = conflictFromError(error);
      if (maybeConflict) {
        setState((current) => ({
          ...current,
          syncing: false,
          conflict: maybeConflict,
          error: maybeConflict.message ?? 'Shared project conflict.',
        }));
        return;
      }
      setState((current) => ({
        ...current,
        syncing: false,
        error: error instanceof Error ? error.message : 'Shared project sync failed.',
      }));
      return;
    }
    setState((current) => ({ ...current, syncing: false }));
  }, [translateUi, acquireLock, onToast, projectId, projectName, refreshLocalSyncState, state.syncedProject]);

  const checkRemote = useCallback(async () => {
    if (!state.sharedProjectUuid) return;
    setState((current) => ({ ...current, syncing: true, error: null }));
    try {
      const remote = await fetchPixflowWordPressProject(state.sharedProjectUuid);
      const latest = remote?.latestVersion;
      const latestVersion = latest?.versionNumber ?? null;
      const currentVersion = state.syncedProject?.latestVersion ?? null;
      if (latestVersion !== null && currentVersion !== null && latestVersion !== currentVersion) {
        setState((current) => ({
          ...current,
          syncing: false,
          conflict: {
            ok: false,
            code: 'remote_changed',
            message: 'This shared project has a newer version on the site.',
            latestVersion: latest ?? undefined,
            resolution: {
              openLatest: true,
              saveAsNewVersion: true,
              keepLocalCopy: true,
            },
          },
        }));
        return;
      }
      setState((current) => ({ ...current, syncing: false, error: null }));
      onToast?.('Shared project is up to date.');
    } catch (error) {
      setState((current) => ({
        ...current,
        syncing: false,
        error: error instanceof Error ? error.message : 'Could not check shared project.',
      }));
    }
  }, [onToast, state.sharedProjectUuid, state.syncedProject?.latestVersion]);

  const label = state.loading
    ? 'Checking sync'
    : state.error || state.conflict
      ? 'Sync issue'
      : state.sharedProjectUuid
        ? 'Shared'
        : 'Local';
  const title = state.error
    ?? state.conflict?.message
    ?? (state.lock?.userName ? `Shared project locked by ${state.lock.userName}` : undefined);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={[
          'pixflow-project-sync-pill',
          state.sharedProjectUuid ? 'is-shared' : 'is-local',
          state.error || state.conflict ? 'is-error' : '',
        ].filter(Boolean).join(' ')}
        title={title}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && menuStyle && typeof document !== 'undefined'
        ? createPortal(
          <div className="pixflow-project-sync-menu" style={menuStyle} role="dialog" aria-label={translateUi("ui.pixflowProjectSyncControl.projectSync")}>
            <div className="pixflow-project-sync-menu__head">
              <strong>{state.sharedProjectUuid ? translateUi("ui.pixflowProjectSyncControl.sharedProject") : translateUi("ui.pixflowProjectSyncControl.localProject")}</strong>
              <span>{state.syncedProject?.latestVersion ? `v${state.syncedProject.latestVersion}` : translateUi("ui.pixflowProjectSyncControl.notSavedToSite")}</span>
            </div>
            {state.lock?.userName ? (
              <p className="pixflow-project-sync-menu__note">
                {translateUi("ui.pixflowProjectSyncControl.activeLock")} {state.lock.userName}
              </p>
            ) : null}
            {state.conflict ? (
              <div className="pixflow-project-sync-menu__warning">
                <strong>{conflictTitle(state.conflict.code)}</strong>
                <p>{state.conflict.message ?? translateUi("ui.pixflowProjectSyncControl.reviewTheSharedProjectBeforeSaving")}</p>
              </div>
            ) : state.error ? (
              <div className="pixflow-project-sync-menu__warning">
                <strong>{translateUi("ui.pixflowProjectSyncControl.syncIssue")}</strong>
                <p>{state.error}</p>
              </div>
            ) : (
              <p className="pixflow-project-sync-menu__note">
                {state.sharedProjectUuid
                  ? translateUi("ui.pixflowProjectSyncControl.thisLocalProjectIsLinkedToThe")
                  : translateUi("ui.pixflowProjectSyncControl.saveThisProjectToTheWordpressSite")}
              </p>
            )}
            <div className="pixflow-project-sync-menu__actions">
              <button type="button" onClick={() => void runSyncAction('save')} disabled={state.syncing}>
                {state.sharedProjectUuid ? translateUi("ui.pixflowProjectSyncControl.saveToSite") : translateUi("ui.pixflowProjectSyncControl.saveSharedCopy")}
              </button>
              {state.sharedProjectUuid ? (
                <>
                  <button type="button" onClick={checkRemote} disabled={state.syncing}>{translateUi("ui.pixflowProjectSyncControl.checkRemote")}</button>
                  <button type="button" onClick={() => void runSyncAction('open-latest')} disabled={state.syncing}>{translateUi("ui.pixflowProjectSyncControl.openLatest")}</button>
                </>
              ) : null}
              {state.conflict ? (
                <>
                  <button type="button" onClick={() => void runSyncAction('save-as-new-version')} disabled={state.syncing}>
                    {translateUi("ui.pixflowProjectSyncControl.saveAsNewVersion")} </button>
                  <button type="button" onClick={() => setState((current) => ({ ...current, conflict: null, error: null }))}>
                    {translateUi("ui.pixflowProjectSyncControl.keepLocal")} </button>
                </>
              ) : null}
            </div>
          </div>,
          workspacePortalTarget() ?? document.body,
        )
        : null}
    </>
  );
}

function conflictFromError(error: unknown): PixflowProjectSyncConflict | null {
  const payload = (error as { body?: unknown })?.body;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const body = payload as PixflowProjectSyncConflict;
    if (typeof body.code === 'string') return body;
  }

  const message = error instanceof Error ? error.message : '';
  if (/remote changed/i.test(message)) {
    return { ok: false, code: 'remote_changed', message };
  }
  if (/locked/i.test(message)) {
    return { ok: false, code: 'project_locked', message };
  }
  return null;
}

function conflictTitle(code: string): string {
  if (code === 'remote_changed') return 'Remote changed';
  if (code === 'project_locked') return 'Project locked';
  if (code === 'version_exists') return 'Version exists';
  return 'Conflict detected';
}

function createSyncSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
