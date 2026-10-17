import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import type { ChatSessionMode } from '@open-design/contracts';
import type { ChatAttachment, ChatCommentAttachment, SkillSummary } from '../types';
import { useT } from '../i18n';
import { createProject } from '../state/projects';
import { PixflowBrandMark } from './PixflowBrandMark';
import { SharedChatComposer, type SharedChatComposerHandle, type SharedChatSendMeta } from './shared-chat';
import type { HomeHeroHandle } from './HomeHero';
import styles from './WorkspaceHomeComposer.module.css';

export interface WorkspaceHomeTurn {
  prompt: string;
  attachments: ChatAttachment[];
  comments: ChatCommentAttachment[];
  meta?: SharedChatSendMeta;
  existingProjectId?: string;
  startVoice?: boolean;
}

interface Props {
  active: boolean;
  prompt: string;
  onPromptChange?: (value: string) => void;
  sessionMode: ChatSessionMode;
  onSessionModeChange: (mode: ChatSessionMode) => void;
  skills: SkillSummary[];
  onSubmit: (turn: WorkspaceHomeTurn) => Promise<boolean>;
  executionSwitcher?: ReactNode;
  mcpProvider?: string | null;
  codexVoiceEnabled?: boolean;
  onOpenSettings?: (section?: 'execution' | 'dictation') => void;
  onOpenMcp?: () => void;
  onOpenConnectors?: () => void;
  busy?: boolean;
  error?: string | null;
  contextControls?: ReactNode;
}

/** Home uses the same composer as the floating panel; only creation is adapted. */
export const WorkspaceHomeComposer = forwardRef<HomeHeroHandle, Props>(function WorkspaceHomeComposer({
  active, prompt, onPromptChange, sessionMode, onSessionModeChange, skills, onSubmit, executionSwitcher,
  mcpProvider, codexVoiceEnabled = false, onOpenSettings, onOpenMcp, onOpenConnectors, busy, error, contextControls,
}, ref) {
  const t = useT();
  const composer = useRef<SharedChatComposerHandle | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const draftProjectRef = useRef<string | null>(null);
  const ensurePending = useRef<Promise<string | null> | null>(null);
  const [sending, setSending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const previousSeed = useRef(prompt);
  const initialSeed = useRef(prompt || undefined);
  const localEchoes = useRef(new Set<string>());
  useEffect(() => {
    if (prompt === previousSeed.current) return;
    previousSeed.current = prompt;
    if (localEchoes.current.has(prompt)) return;
    composer.current?.setDraft(prompt);
  }, [prompt]);
  useImperativeHandle(ref, () => ({
    focus: () => composer.current?.focus(),
    focusEnd: () => composer.current?.focus(),
    pulseSend: () => composer.current?.focus(),
  }), []);

  async function ensureProject(): Promise<string | null> {
    if (draftProjectRef.current) return draftProjectRef.current;
    if (ensurePending.current) return ensurePending.current;
    ensurePending.current = createProject({ name: t('common.untitled'), skillId: null, designSystemId: null,
      conversationMode: sessionMode, metadata: { kind: 'other' },
    }).then(result => {
      const id = result?.project.id ?? null;
      draftProjectRef.current = id;
      setDraftProjectId(id);
      return id;
    }).finally(() => { ensurePending.current = null; });
    return ensurePending.current;
  }

  return (
    <section className={styles.hero} data-testid="workspace-home-composer">
      <div className={styles.welcome}>
      <div className={styles.brand}><PixflowBrandMark /> <span>Pixflow Design</span></div>
      <h1 className={styles.title}>{t('homeHero.title')}</h1>
      </div>
      <div className={styles.dock}>
      <div className={styles.composer}>
        <SharedChatComposer
          appearance="floating"
          ref={composer}
          projectId={draftProjectId}
          projectFiles={[]}
          streaming={false}
          sendDisabled={!active || busy || sending}
          initialDraft={initialSeed.current}
          onDraftChange={value => {
            // Parent prompt updates from typing must not reseed the rich editor.
            localEchoes.current.add(value);
            if (localEchoes.current.size > 32) localEchoes.current.delete(localEchoes.current.values().next().value!);
            if (value !== prompt) onPromptChange?.(value);
          }}
          draftStorageKey="pixflow:workspace-home:draft"
          onEnsureProject={ensureProject}
          skills={skills}
          sessionMode={sessionMode}
          onSessionModeChange={onSessionModeChange}
          mcpProvider={mcpProvider}
          codexVoiceEnabled={codexVoiceEnabled}
          onPrepareCodexVoice={async meta => {
            setSending(true);
            setCreateError(null);
            try {
              const accepted = await onSubmit({ prompt: t('voiceConversation'), attachments: [], comments: [], meta, startVoice: true });
              if (!accepted) setCreateError(t('workspace.startFailed'));
            } catch (failure) {
              setCreateError(failure instanceof Error ? failure.message : t('workspace.startFailed'));
            } finally { setSending(false); }
          }}
          footerAccessory={executionSwitcher}
          designSystemPicker={contextControls}
          onOpenSettings={onOpenSettings}
          onOpenMcpSettings={onOpenMcp}
          onOpenConnectors={onOpenConnectors}
          compactPlusMenu
          onStop={() => undefined}
          onSend={async (text, attachments, comments, meta) => {
            setSending(true);
            setCreateError(null);
            try {
              const accepted = await onSubmit({ prompt: text, attachments, comments, meta,
                ...(draftProjectRef.current ? { existingProjectId: draftProjectRef.current } : {}),
              });
              if (!accepted) { setCreateError(t('workspace.startFailed')); return 'restore-draft'; }
              draftProjectRef.current = null;
              setDraftProjectId(null);
            } catch (failure) {
              setCreateError(failure instanceof Error ? failure.message : t('workspace.startFailed'));
              return 'restore-draft';
            } finally { setSending(false); }
          }}
        />
      </div>
      {(error || createError) && <p role="alert" className={styles.error}>{error || createError}</p>}
      </div>
    </section>
  );
});
