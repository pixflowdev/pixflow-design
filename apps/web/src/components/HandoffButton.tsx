import { useT as usePixflowUiTranslation } from '../i18n';
// Hand-off menu in the ChatPane header. The left split button opens the
// current design project folder in a local editor, while the dropdown also
// exposes copy-to-CLI prompts for handing the same local folder to code agents.

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentInfo,
  HostEditor,
  HostEditorId,
  HostEditorsResponse,
} from '@open-design/contracts';
import {
  handoffTargetIdToTracking,
  type TrackingArtifactKind,
} from '@open-design/contracts/analytics';
import { fetchHostEditors, openProjectInEditor } from '../providers/registry';
import { useAnalytics } from '../analytics/provider';
import { trackHandoffClick } from '../analytics/events';
import { useT } from '../i18n';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { Icon } from './Icon';
import { EditorIcon } from './EditorIcon';
import { AgentIcon } from './AgentIcon';

const PREFERRED_EDITOR_KEY = 'open-design:preferred-editor';
const PREFERRED_FRAMEWORK_KEY = 'open-design:handoff-framework';
const PROJECT_PATH_COPY_ID = 'project-path';

type HandoffTab = 'editor' | 'cli';
type FrameworkId = 'react' | 'vue' | 'svelte' | 'solid' | 'next' | 'vanilla';

interface FrameworkTarget {
  id: FrameworkId;
}

const FRAMEWORKS: FrameworkTarget[] = [
  { id: 'react' },
  { id: 'vue' },
  { id: 'svelte' },
  { id: 'solid' },
  { id: 'next' },
  { id: 'vanilla' },
];

const DEFAULT_FRAMEWORK: FrameworkTarget = FRAMEWORKS[0] ?? {
  id: 'react',
};

interface CliTarget {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  version?: string | null;
}

const CLI_ORDER = [
  'claude',
  'codex',
  'opencode',
  'cursor-agent',
  'antigravity',
  'qwen',
  'qoder',
  'copilot',
  'grok-build',
  'deepseek',
  'kimi',
  'hermes',
  'devin',
  'kiro',
  'kilo',
  'vibe',
  'aider',
  'trae-cli',
  'pi',
  'reasonix',
];

const FALLBACK_CLI_TARGETS: CliTarget[] = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', available: false },
  { id: 'codex', name: 'Codex CLI', bin: 'codex', available: false },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode-cli', available: false },
  { id: 'cursor-agent', name: 'Cursor Agent', bin: 'cursor-agent', available: false },
  { id: 'qwen', name: 'Qwen Code', bin: 'qwen', available: false },
  { id: 'qoder', name: 'Qoder CLI', bin: 'qodercli', available: false },
  { id: 'copilot', name: 'GitHub Copilot CLI', bin: 'copilot', available: false },
  { id: 'grok-build', name: 'Grok Build', bin: 'grok', available: false },
  { id: 'deepseek', name: 'DeepSeek TUI', bin: 'deepseek', available: false },
  { id: 'kimi', name: 'Kimi CLI', bin: 'kimi', available: false },
  { id: 'hermes', name: 'Hermes', bin: 'hermes', available: false },
  { id: 'devin', name: 'Devin for Terminal', bin: 'devin', available: false },
  { id: 'kiro', name: 'Kiro CLI', bin: 'kiro-cli', available: false },
  { id: 'kilo', name: 'Kilo', bin: 'kilo', available: false },
  { id: 'vibe', name: 'Mistral Vibe CLI', bin: 'vibe-acp', available: false },
  { id: 'antigravity', name: 'Antigravity', bin: 'agy', available: false },
  { id: 'aider', name: 'Aider', bin: 'aider', available: false },
  { id: 'trae-cli', name: 'Trae CLI', bin: 'traecli', available: false },
  { id: 'pi', name: 'Pi', bin: 'pi', available: false },
  { id: 'reasonix', name: 'DeepSeek Reasonix', bin: 'reasonix', available: false },
];

interface Props {
  projectId: string;
  projectName?: string;
  projectDir?: string | null;
  agents?: AgentInfo[];
  // Active artifact context, so handoff clicks carry the same artifact_id /
  // artifact_kind dimensions as the rest of the artifact_header funnel.
  // Undefined when no artifact tab is active.
  artifactId?: string;
  artifactKind?: TrackingArtifactKind;
  // Optional fallback "always open in OS file manager" falls back to the
  // existing shell.openPath bridge in case the daemon catalogue is empty
  // (highly unlikely on macOS / Win / Linux but harmless to support).
  onRequestRevealInFinder?: () => void;
  onRequestBricksHandoff?: () => void | Promise<void>;
}

function readPreferred(): HostEditorId | null {
  try {
    const v = window.localStorage.getItem(PREFERRED_EDITOR_KEY);
    return (v as HostEditorId) || null;
  } catch {
    return null;
  }
}

function writePreferred(id: HostEditorId): void {
  try {
    window.localStorage.setItem(PREFERRED_EDITOR_KEY, id);
  } catch {
    // ignore quota or sandboxed
  }
}

function fallbackEditorIdForPlatform(platform: HostEditorsResponse['platform']): HostEditorId {
  if (platform === 'win32') return 'explorer';
  if (platform === 'linux') return 'file-manager';
  return 'finder';
}

function detectBrowserPlatform(): HostEditorsResponse['platform'] {
  if (typeof navigator === 'undefined') return 'unknown';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = `${nav.userAgentData?.platform ?? ''} ${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`.toLowerCase();
  if (/win/.test(platform)) return 'win32';
  if (/linux|x11/.test(platform)) return 'linux';
  if (/mac|darwin/.test(platform)) return 'darwin';
  return 'unknown';
}

function fallbackLabelForPlatform(platform: HostEditorsResponse['platform']): string {
  if (platform === 'win32') return 'Explorer';
  if (platform === 'linux') return 'File Manager';
  return 'Finder';
}

function readPreferredFramework(): string {
  if (typeof window === 'undefined') return DEFAULT_FRAMEWORK.id;
  try {
    const stored = window.localStorage.getItem(PREFERRED_FRAMEWORK_KEY);
    if (stored && FRAMEWORKS.some((f) => f.id === stored)) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_FRAMEWORK.id;
}

function writePreferredFramework(id: string): void {
  try {
    window.localStorage.setItem(PREFERRED_FRAMEWORK_KEY, id);
  } catch {
    // ignore quota or sandboxed
  }
}

function cliDisplayName(agent: Pick<CliTarget, 'id' | 'name'>): string {
  return agent.name;
}

function BricksHandoffIcon({ size = 24 }: { size?: number }) {
  return (
    <span className="handoff-bricks-icon" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 35 45" width="18" height="22" focusable="false">
        <path
          fill="currentColor"
          d="M9.1875.34375 9.9375.8125v13.03125c2.6458466-1.7500087 5.5729006-2.625 8.78125-2.625 4.6250231 0 8.4583181 1.6145672 11.5 4.84375 3.000015 3.2291828 4.5 7.2083097 4.5 11.9375 0 4.7500237-1.5104016 8.7291506-4.53125 11.9375-3.0416819 3.2291828-6.8645603 4.84375-11.46875 4.84375-4.0208534 0-7.4583191-1.4374856-10.3125-4.3125V44H.03125V1.375L9.1875.34375Zm7.9375 19.34375c-2.2083444 0-4.0520759.7499925-5.53125 2.25-1.4791741 1.5416744-2.21875 3.5624875-2.21875 6.0625s.7395759 4.5104091 2.21875 6.03125c1.4583406 1.5208409 3.3020722 2.28125 5.53125 2.28125 2.3541784 0 4.2604094-.7916587 5.71875-2.375C24.2812572 32.3749922 25 30.3958453 25 28c0-2.3958453-.7291594-4.3854087-2.1875-5.96875-1.4583406-1.5625078-3.354155-2.34375-5.6875-2.34375Z"
        />
      </svg>
    </span>
  );
}

function mergeCliTargets(agents: AgentInfo[] | undefined): CliTarget[] {
  const byId = new Map<string, CliTarget>();
  for (const target of FALLBACK_CLI_TARGETS) {
    byId.set(target.id, target);
  }
  for (const agent of agents ?? []) {
    byId.set(agent.id, {
      id: agent.id,
      name: cliDisplayName(agent),
      bin: agent.bin,
      available: agent.available,
      version: agent.version,
    });
  }
  return [...byId.values()].sort((a, b) => {
    const ai = CLI_ORDER.indexOf(a.id);
    const bi = CLI_ORDER.indexOf(b.id);
    const ao = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bo = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (ao !== bo) return ao - bo;
    return cliDisplayName(a).localeCompare(cliDisplayName(b));
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

type T = ReturnType<typeof useT>;

interface CliHandoffLabels {
  promptIntro: string;
  target: string;
  cli: string;
  stepsLead: string;
  readFiles: string;
  keepDesign: string;
  produceCode: string;
  verify: string;
  commandHint: string;
  project: string;
  projectId: string;
}

function frameworkLabel(id: FrameworkId, t: T): string {
  switch (id) {
    case 'vue':
      return t('handoff.framework.vue');
    case 'svelte':
      return t('handoff.framework.svelte');
    case 'solid':
      return t('handoff.framework.solid');
    case 'next':
      return t('handoff.framework.next');
    case 'vanilla':
      return t('handoff.framework.vanilla');
    case 'react':
    default:
      return t('handoff.framework.react');
  }
}

function frameworkPromptLabel(id: FrameworkId, t: T): string {
  switch (id) {
    case 'vue':
      return t('handoff.frameworkPrompt.vue');
    case 'svelte':
      return t('handoff.frameworkPrompt.svelte');
    case 'solid':
      return t('handoff.frameworkPrompt.solid');
    case 'next':
      return t('handoff.frameworkPrompt.next');
    case 'vanilla':
      return t('handoff.frameworkPrompt.vanilla');
    case 'react':
    default:
      return t('handoff.frameworkPrompt.react');
  }
}

function buildCliHandoffPrompt({
  cli,
  frameworkPrompt,
  labels,
  projectDir,
  projectId,
  projectName,
}: {
  cli: CliTarget;
  frameworkPrompt: string;
  labels: CliHandoffLabels;
  projectDir: string;
  projectId: string;
  projectName?: string;
}): string {
  const name = projectName?.trim() || projectId;
  return `${labels.promptIntro}

\`\`\`
${projectDir}
\`\`\`

${labels.target}: ${frameworkPrompt}
${labels.cli}: ${cliDisplayName(cli)}${cli.bin ? ` (${cli.bin})` : ''}

${labels.stepsLead}
1. ${labels.readFiles}
2. ${labels.keepDesign}
3. ${labels.produceCode}
4. ${labels.verify}

${labels.commandHint}

\`\`\`bash
cd ${shellQuote(projectDir)}
\`\`\`

${labels.project}: ${name}
${labels.projectId}: ${projectId}
`;
}

export function HandoffButton({
  projectId,
  projectName,
  projectDir,
  agents,
  artifactId,
  artifactKind,
  onRequestRevealInFinder,
  onRequestBricksHandoff,
}: Props) {
  const translateUi = usePixflowUiTranslation();
  const t = useT();
  const analytics = useAnalytics();
  // One-liner so every hand-off interaction emits the same
  // `ui_click` / `area=handoff` shape; callers pass only what varies. The
  // active-artifact context is attached to every event so handoff slices line
  // up with the rest of the artifact_header funnel.
  const fireHandoff = (
    props: Omit<
      Parameters<typeof trackHandoffClick>[1],
      'page_name' | 'area' | 'artifact_id' | 'artifact_kind'
    >,
  ) => {
    trackHandoffClick(analytics.track, {
      page_name: 'artifact',
      area: 'handoff',
      artifact_id: artifactId,
      artifact_kind: artifactKind,
      ...props,
    });
  };
  const [editors, setEditors] = useState<HostEditor[]>([]);
  const [platform, setPlatform] = useState<HostEditorsResponse['platform']>('unknown');
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<HostEditorId | null>(null);
  const [copyBusy, setCopyBusy] = useState<string | null>(null);
  const [bricksBusy, setBricksBusy] = useState(false);
  const [copiedCliId, setCopiedCliId] = useState<string | null>(null);
  const [frameworkId, setFrameworkId] = useState(readPreferredFramework);
  const [activeTab, setActiveTab] = useState<HandoffTab>('editor');
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHostEditors()
      .then((resp) => {
        if (cancelled) return;
        setEditors(resp.editors);
        setPlatform(resp.platform);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setEditors([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const available = editors.filter((e) => e.available);
  const unavailable = editors.filter((e) => !e.available);
  const preferred = readPreferred();
  const effectivePlatform =
    platform === 'darwin' || platform === 'win32' || platform === 'linux'
      ? platform
      : detectBrowserPlatform();
  const platformFallbackId = fallbackEditorIdForPlatform(effectivePlatform);
  const preferredEditor = preferred
    ? available.find((editor) => editor.id === preferred) ?? null
    : null;
  const primary =
    preferredEditor
    ?? available.find((editor) => editor.id === platformFallbackId)
    ?? available[0]
    ?? null;
  const primaryTitle = primary
    ? t('handoff.openInTarget', { target: primary.label })
    : t('handoff.action');
  const cliTargets = useMemo(() => mergeCliTargets(agents), [agents]);
  const availableCliTargets = cliTargets.filter((cli) => cli.available);
  const unavailableCliTargets = cliTargets.filter((cli) => !cli.available);
  const selectedFramework =
    FRAMEWORKS.find((framework) => framework.id === frameworkId) ?? DEFAULT_FRAMEWORK;

  async function launch(editor: HostEditor) {
    fireHandoff({
      element: 'open_editor',
      target_id: handoffTargetIdToTracking(editor.id),
      target_available: editor.available,
      handoff_tab: 'editor',
    });
    if (!editor.available) {
      // Still try; the user might have an unprobed path (e.g. macOS
      // bundle in /Applications). The daemon will return 409 if it
      // genuinely can't find it.
    }
    setError(null);
    setBusy(editor.id);
    writePreferred(editor.id);
    try {
      await openProjectInEditor(projectId, editor.id);
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setOpen(true);
      setActiveTab('editor');
      // Fallback: if Finder is the user's pick and the daemon spawn
      // failed, try the renderer-side reveal-in-finder bridge.
      if (editor.id === 'finder' && onRequestRevealInFinder) {
        try {
          onRequestRevealInFinder();
        } catch {
          // ignore
        }
      }
    } finally {
      setBusy(null);
    }
  }

  async function copyCliPrompt(cli: CliTarget) {
    fireHandoff({
      element: 'copy_cli_prompt',
      target_id: handoffTargetIdToTracking(cli.id),
      target_available: cli.available,
      handoff_tab: 'cli',
      framework: selectedFramework.id,
    });
    if (!projectDir) {
      setError(t('handoff.projectPathUnavailable'));
      return;
    }
    setError(null);
    setCopyBusy(cli.id);
    const cliName = cliDisplayName(cli);
    const frameworkPrompt = frameworkPromptLabel(selectedFramework.id, t);
    const prompt = buildCliHandoffPrompt({
      cli,
      frameworkPrompt,
      labels: {
        promptIntro: t('handoff.promptIntro'),
        target: t('handoff.promptTarget'),
        cli: t('handoff.promptCli'),
        stepsLead: t('handoff.promptStepsLead', { cli: cliName }),
        readFiles: t('handoff.promptReadFiles'),
        keepDesign: t('handoff.promptKeepDesign'),
        produceCode: t('handoff.promptProduceCode', { framework: frameworkPrompt }),
        verify: t('handoff.promptVerify'),
        commandHint: t('handoff.promptCommandHint'),
        project: t('handoff.promptProject'),
        projectId: t('handoff.promptProjectId'),
      },
      projectDir,
      projectId,
      projectName,
    });
    try {
      const copied = await copyToClipboard(prompt);
      if (!copied) {
        setError(t('handoff.copyFailed'));
        return;
      }
      setCopiedCliId(cli.id);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedCliId(null);
        copiedTimerRef.current = null;
      }, 1800);
    } finally {
      setCopyBusy(null);
    }
  }

  async function copyProjectPath() {
    fireHandoff({ element: 'copy_path' });
    if (!projectDir) {
      setError(t('handoff.projectPathUnavailable'));
      return;
    }
    setError(null);
    setCopyBusy(PROJECT_PATH_COPY_ID);
    try {
      const copied = await copyToClipboard(projectDir);
      if (!copied) {
        setError(t('handoff.copyFailed'));
        return;
      }
      setCopiedCliId(PROJECT_PATH_COPY_ID);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedCliId(null);
        copiedTimerRef.current = null;
      }, 1800);
    } finally {
      setCopyBusy(null);
    }
  }

  async function startBricksHandoff() {
    if (!onRequestBricksHandoff || bricksBusy) return;
    fireHandoff({
      element: 'open_editor',
      target_available: true,
      handoff_tab: 'editor',
    });
    setError(null);
    setBricksBusy(true);
    try {
      await onRequestBricksHandoff();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOpen(true);
      setActiveTab('editor');
    } finally {
      setBricksBusy(false);
    }
  }

  function chooseFramework(id: FrameworkId) {
    fireHandoff({ element: 'framework', framework: id, handoff_tab: 'cli' });
    setFrameworkId(id);
    writePreferredFramework(id);
    setError(null);
    setCopiedCliId(null);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }

  if (!loaded) {
    return null;
  }

  // No available editors: render a Finder/Explorer/File-Manager single-button
  // fallback so the surface is never blank, including the true zero-editor
  // response where the daemon reports `editors: []`.
  if (available.length === 0 && !onRequestBricksHandoff) {
    const fallbackLabel = fallbackLabelForPlatform(effectivePlatform);
    const fallbackId = platformFallbackId;
    const fallbackEditor: HostEditor = {
      id: fallbackId,
      label: fallbackLabel,
      available: false,
      platforms: effectivePlatform === 'unknown' ? undefined : [effectivePlatform],
    };
    // Wrap the solo button so a daemon spawn failure can surface an
    // inline error next to it. Without this, ProjectView's
    // `<HandoffButton projectId={...} />` (no reveal callback) turns a
    // rejected `openProjectInEditor` into a silent no-op.
    return (
      <div className="handoff-wrap handoff-wrap--solo" data-testid="handoff-wrap">
        <button
          type="button"
          className="handoff-trigger handoff-trigger--solo od-tooltip"
          title={t('handoff.fallbackTitle', { target: fallbackLabel })}
          data-tooltip={t('handoff.fallbackTitle', { target: fallbackLabel })}
          data-tooltip-placement="bottom"
          disabled={busy === fallbackId}
          onClick={() => {
            fireHandoff({
              element: 'open_editor',
              target_id: handoffTargetIdToTracking(fallbackId),
              target_available: false,
              handoff_tab: 'editor',
            });
            void launch(fallbackEditor);
          }}
        >
          <EditorIcon editorId={fallbackId} size={20} />
          <span className="handoff-trigger-label">{fallbackLabel}</span>
        </button>
        {error ? (
          <div className="handoff-menu-error" role="alert" data-testid="handoff-fallback-error">
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`handoff-wrap${open ? ' open' : ''}`}
      ref={wrapRef}
      data-testid="handoff-wrap"
    >
      {/* Split control: the labeled left side launches the preferred
          editor, the right caret opens the picker. Sibling buttons
          (instead of a nested caret) so the caret has its own real
          tap target and so we don't render an invalid button-in-button. */}
      <div className="handoff-split">
        <button
          type="button"
          className="handoff-trigger od-tooltip"
          data-testid="handoff-trigger"
          title={primaryTitle}
          data-tooltip={primaryTitle}
          data-tooltip-placement="bottom"
          aria-label={primaryTitle}
          onClick={() => {
            if (primary && busy !== primary.id) {
              // Record the button intent first (the most common path through
              // this surface), carrying the preferred editor as target so it
              // is distinguishable from picking the same editor in the
              // dropdown; launch() then emits `open_editor` for the actual
              // target launch.
              fireHandoff({
                element: 'trigger',
                target_id: handoffTargetIdToTracking(primary.id),
                target_available: primary.available,
                handoff_tab: 'editor',
              });
              void launch(primary);
            } else {
              fireHandoff({ element: 'trigger' });
              setOpen((v) => !v);
            }
          }}
          disabled={busy !== null}
        >
          {primary ? (
            <>
              <EditorIcon editorId={primary.id} size={20} />
              <span className="handoff-trigger-label sr-only">
                {primaryTitle}
              </span>
            </>
          ) : (
            <>
              <EditorIcon editorId="finder" size={20} />
              <span className="handoff-trigger-label sr-only">{primaryTitle}</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="handoff-caret od-tooltip"
          aria-label={t('handoff.chooseTargetAria')}
          title={t('handoff.chooseTargetAria')}
          data-tooltip={t('handoff.chooseTargetAria')}
          data-tooltip-placement="bottom"
          data-testid="handoff-caret"
          onClick={() => {
            fireHandoff({ element: 'caret' });
            setOpen((v) => !v);
          }}
          disabled={busy !== null}
        >
          <Icon name="chevron-down" size={14} />
        </button>
      </div>
      {open ? (
        <div className="handoff-menu" role="dialog" aria-label={t('handoff.optionsAria')} data-testid="handoff-menu">
          <div className="handoff-menu-tabs" role="tablist" aria-label={t('handoff.optionsAria')}>
            <button
              type="button"
              className={`handoff-menu-tab${activeTab === 'editor' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'editor'}
              onClick={() => {
                fireHandoff({ element: 'tab', handoff_tab: 'editor' });
                setActiveTab('editor');
              }}
            >
              {t('handoff.editorSection')}
            </button>
            <button
              type="button"
              className={`handoff-menu-tab${activeTab === 'cli' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'cli'}
              onClick={() => {
                fireHandoff({ element: 'tab', handoff_tab: 'cli' });
                setActiveTab('cli');
              }}
            >
              {t('handoff.cliSection')}
            </button>
          </div>
          <div className="handoff-path-row" data-testid="handoff-project-path">
            <button
              type="button"
              className={`handoff-path-button${copiedCliId === PROJECT_PATH_COPY_ID ? ' copied' : ''}`}
              onClick={() => void copyProjectPath()}
              disabled={copyBusy === PROJECT_PATH_COPY_ID || !projectDir}
              title={projectDir ?? t('handoff.projectPathUnavailable')}
              aria-label={copiedCliId === PROJECT_PATH_COPY_ID ? t('handoff.copied') : t('designFiles.copyPath')}
            >
              <span className="handoff-path-button-main">
                <span className="handoff-path-button-icon" aria-hidden>
                  <Icon name={copiedCliId === PROJECT_PATH_COPY_ID ? 'check' : 'copy'} size={13} />
                </span>
                <span className="handoff-path-button-label">
                  {copiedCliId === PROJECT_PATH_COPY_ID ? t('handoff.copied') : t('designFiles.copyPath')}
                </span>
              </span>
            </button>
          </div>
          {activeTab === 'editor' ? (
            <section className="handoff-menu-block" role="tabpanel">
              <div className="handoff-target-group">
                <div className="handoff-target-group-title">{t('common.installed')}</div>
                <div className="handoff-target-rail handoff-editor-rail">
                  {onRequestBricksHandoff ? (
                    <button
                      type="button"
                      className="handoff-menu-item handoff-target-card handoff-bricks-card"
                      data-testid="handoff-menu-item-bricks"
                      onClick={() => void startBricksHandoff()}
                      disabled={bricksBusy}
                      title={translateUi("ui.handoffButton.handoffTheLatestHtmlToBricks")}
                    >
                      <BricksHandoffIcon size={24} />
                      <span className="handoff-target-label">Bricks</span>
                      <Icon className="handoff-target-arrow" name="chevron-right" size={12} />
                    </button>
                  ) : null}
                  {available.map((editor) => (
                    <button
                      key={editor.id}
                      type="button"
                      className="handoff-menu-item handoff-target-card"
                      data-testid={`handoff-menu-item-${editor.id}`}
                      onClick={() => void launch(editor)}
                      disabled={busy === editor.id}
                      title={t('handoff.openInTarget', { target: editor.label })}
                    >
                      <EditorIcon editorId={editor.id} size={24} />
                      <span className="handoff-target-label">{editor.label}</span>
                      <Icon className="handoff-target-arrow" name="chevron-right" size={12} />
                    </button>
                  ))}
                </div>
              </div>
              {unavailable.length > 0 ? (
                <div className="handoff-target-group">
                  <div className="handoff-target-group-title">{t('handoff.notInstalled')}</div>
                  <div className="handoff-target-rail handoff-editor-rail handoff-target-rail--unavailable">
                    {unavailable.map((editor) => (
                      <button
                        key={editor.id}
                        type="button"
                        className="handoff-menu-item handoff-target-card dim"
                        data-testid={`handoff-menu-item-${editor.id}`}
                        onClick={() => void launch(editor)}
                        disabled={busy === editor.id}
                        title={t('handoff.notDetectedTitle', { target: editor.label })}
                      >
                        <EditorIcon editorId={editor.id} size={24} />
                        <span className="handoff-target-label">{editor.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="handoff-menu-block" role="tabpanel">
              <div className="handoff-framework-row" role="group" aria-label={t('handoff.framework')}>
                <span className="handoff-framework-label">{t('handoff.framework')}</span>
                {FRAMEWORKS.map((framework) => (
                  <button
                    key={framework.id}
                    type="button"
                    className={`handoff-framework-chip${framework.id === selectedFramework.id ? ' active' : ''}`}
                    aria-pressed={framework.id === selectedFramework.id}
                    onClick={() => chooseFramework(framework.id)}
                  >
                    {frameworkLabel(framework.id, t)}
                  </button>
                ))}
              </div>
              {availableCliTargets.length > 0 ? (
                <div className="handoff-target-group">
                  <div className="handoff-target-group-title">{t('common.installed')}</div>
                  <div className="handoff-target-rail handoff-cli-rail">
                    {availableCliTargets.map((cli) => {
                      const copied = copiedCliId === cli.id;
                      return (
                        <button
                          key={cli.id}
                          type="button"
                          className={[
                            'handoff-menu-item',
                            'handoff-target-card',
                            'handoff-cli-card',
                            copied ? 'copied' : '',
                          ].filter(Boolean).join(' ')}
                          data-testid={`handoff-cli-item-${cli.id}`}
                          onClick={() => void copyCliPrompt(cli)}
                          disabled={copyBusy === cli.id}
                          title={t('handoff.copyPromptForTarget', { target: cliDisplayName(cli) })}
                        >
                          <AgentIcon id={cli.id} size={24} />
                          <span className="handoff-target-copy">
                            <span className="handoff-target-label">{cliDisplayName(cli)}</span>
                            <span className="handoff-target-meta">
                              {copied ? t('handoff.copied') : t('handoff.copyPrompt')}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="handoff-target-group">
                <div className="handoff-target-group-title">{t('handoff.notInstalled')}</div>
                <div className="handoff-target-rail handoff-cli-rail handoff-target-rail--unavailable">
                  {unavailableCliTargets.map((cli) => {
                    const copied = copiedCliId === cli.id;
                    return (
                      <button
                        key={cli.id}
                        type="button"
                        className={[
                          'handoff-menu-item',
                          'handoff-target-card',
                          'handoff-cli-card',
                          'dim',
                          copied ? 'copied' : '',
                        ].filter(Boolean).join(' ')}
                        data-testid={`handoff-cli-item-${cli.id}`}
                        onClick={() => void copyCliPrompt(cli)}
                        disabled={copyBusy === cli.id}
                        title={t('handoff.copyPromptForTarget', { target: cliDisplayName(cli) })}
                      >
                        <AgentIcon id={cli.id} size={24} />
                        <span className="handoff-target-label">{cliDisplayName(cli)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
          {error ? (
            <>
              <div className="handoff-menu-divider" />
              <div className="handoff-menu-error">{error}</div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

