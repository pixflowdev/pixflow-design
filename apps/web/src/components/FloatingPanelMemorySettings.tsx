import { useT as usePixflowUiTranslation } from '../i18n';
import { Button } from '@open-design/components';
import type { Dict } from '../i18n/types';
import { useState } from 'react';

import styles from './FloatingPanelMemorySettings.module.css';

export const FLOATING_PANEL_MEMORY_COMMAND_EVENT =
  'pixflow-design:bricks-agent-memory-command';
export const FLOATING_PANEL_MEMORY_SETTINGS_STORAGE_KEY =
  'pixflow-design:bricks-agent:memory-settings:v1';

export type FloatingPanelMemoryRetention =
  | 'session_only'
  | 'restore_after_reload'
  | 'on_device';

export type FloatingPanelMemorySettingsValue = {
  version: 1;
  retention: FloatingPanelMemoryRetention;
};

export type FloatingPanelMemoryCommand =
  | 'settings_changed'
  | 'new_conversation'
  | 'clear_current_context'
  | 'clear_local_history';

export type FloatingPanelMemoryCommandDetail = {
  version: 1;
  requestId: string;
  command: FloatingPanelMemoryCommand;
  settings: FloatingPanelMemorySettingsValue;
};

const DEFAULT_SETTINGS: FloatingPanelMemorySettingsValue = {
  version: 1,
  retention: 'restore_after_reload',
};

const RETENTION_OPTIONS: ReadonlyArray<{
  value: FloatingPanelMemoryRetention;
  title: keyof Dict;
  description: keyof Dict;
}> = [
  {
    value: 'session_only',
    title: "ui.finalOnboarding.5f9b0ae108",
    description: "ui.finalOnboarding.3c0e1f05da",
  },
  {
    value: 'restore_after_reload',
    title: "ui.finalOnboarding.3efe5537cf",
    description: "ui.finalOnboarding.1ccaa4f4ad",
  },
  {
    value: 'on_device',
    title: "ui.finalOnboarding.a7f9620cca",
    description: "ui.finalOnboarding.94536fb7d6",
  },
];

function isRetention(value: unknown): value is FloatingPanelMemoryRetention {
  return value === 'session_only'
    || value === 'restore_after_reload'
    || value === 'on_device';
}

export function readFloatingPanelMemorySettings(): FloatingPanelMemorySettingsValue {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(FLOATING_PANEL_MEMORY_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as { version?: unknown; retention?: unknown };
    if (parsed.version !== 1 || !isRetention(parsed.retention)) return DEFAULT_SETTINGS;
    return { version: 1, retention: parsed.retention };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistFloatingPanelMemorySettings(
  settings: FloatingPanelMemorySettingsValue,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      FLOATING_PANEL_MEMORY_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // Locked-down browsers can reject storage. The builder still receives the
    // live setting for this page through the event below.
  }
}

function createRequestId(): string {
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
    return `bricks-memory:${window.crypto.randomUUID()}`;
  }
  return `bricks-memory:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function publishFloatingPanelMemoryCommand(
  command: FloatingPanelMemoryCommand,
  settings: FloatingPanelMemorySettingsValue,
): void {
  if (typeof window === 'undefined') return;
  const detail: FloatingPanelMemoryCommandDetail = {
    version: 1,
    requestId: createRequestId(),
    command,
    settings,
  };

  window.dispatchEvent(new CustomEvent(FLOATING_PANEL_MEMORY_COMMAND_EVENT, {
    detail,
  }));

  // The settings UI and Bricks builder can be mounted in separate same-origin
  // documents (or in a hosted frame). Always relay through the parent/top
  // windows as well as the local CustomEvent so the builder receives the
  // command regardless of which document owns the React settings root.
  const message = {
    source: 'pixflow-design',
    type: FLOATING_PANEL_MEMORY_COMMAND_EVENT,
    ...detail,
  };
  const targets = [window.parent, window.top].filter(
    (target, index, all): target is Window => Boolean(target) && all.indexOf(target) === index,
  );
  for (const target of targets) {
    try {
      target.postMessage(message, '*');
    } catch {
      // A detached or cross-origin frame can reject postMessage in locked-down
      // embeds; the local event remains the synchronous same-document path.
    }
  }
}

export function FloatingPanelMemorySettings() {
  const translateUi = usePixflowUiTranslation();
  const [settings, setSettings] = useState(readFloatingPanelMemorySettings);
  const [status, setStatus] = useState('');

  const changeRetention = (retention: FloatingPanelMemoryRetention) => {
    const next: FloatingPanelMemorySettingsValue = { version: 1, retention };
    setSettings(next);
    persistFloatingPanelMemorySettings(next);
    publishFloatingPanelMemoryCommand('settings_changed', next);
    setStatus(translateUi("ui.finalOnboarding.1cd7c231fc"));
  };

  const clearCurrentContext = () => {
    publishFloatingPanelMemoryCommand('clear_current_context', settings);
    setStatus(translateUi("ui.finalOnboarding.d5c52fc3a8"));
  };

  const newConversation = () => {
    publishFloatingPanelMemoryCommand('new_conversation', settings);
    setStatus(translateUi("ui.finalOnboarding.77d3d7f7d3"));
  };

  const clearLocalHistory = () => {
    publishFloatingPanelMemoryCommand('clear_local_history', settings);
    setStatus(translateUi("ui.finalOnboarding.125903ce05"));
  };

  return (
    <section
      className={`settings-section settings-section-card ${styles.card}`}
      aria-labelledby="floating-panel-memory-title"
    >
      <div className={styles.header}>
        <div>
          <h3 id="floating-panel-memory-title" className={styles.title}>
            {translateUi("ui.floatingPanelMemorySettings.floatingPanelContext")} </h3>
          <p className={styles.description}>
            {translateUi("ui.floatingPanelMemorySettings.controlsSavedContextForTheBricksFloating")} </p>
        </div>
        <span className={styles.badge}>{translateUi("ui.floatingPanelMemorySettings.bricksOnly")}</span>
      </div>

      <fieldset className={styles.options}>
        <legend className={styles.legend}>{translateUi("ui.floatingPanelMemorySettings.retention")}</legend>
        {RETENTION_OPTIONS.map((option) => {
          const selected = settings.retention === option.value;
          return (
            <label
              key={option.value}
              className={`${styles.option}${selected ? ` ${styles.optionSelected}` : ''}`}
            >
              <input
                className={styles.radio}
                type="radio"
                name="floating-panel-memory-retention"
                value={option.value}
                checked={selected}
                onChange={() => changeRetention(option.value)}
              />
              <span>
                <span className={styles.optionTitle}>{translateUi(option.title)}</span>
                <span className={styles.optionDescription}>{translateUi(option.description)}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className={styles.safety}>
        <p className={styles.safetyTitle}>{translateUi("ui.floatingPanelMemorySettings.fixedSafetyCaps")}</p>
        <p className={styles.safetyCopy}>
          {translateUi("ui.floatingPanelMemorySettings.upTo24RecentMessagesAnd32")} </p>
      </div>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={newConversation}>
          {translateUi("chat.newConversation")} </Button>
        <Button variant="ghost" onClick={clearCurrentContext}>
          {translateUi("ui.floatingPanelMemorySettings.clearCurrentContext")} </Button>
        <Button variant="ghost" onClick={clearLocalHistory}>
          {translateUi("ui.floatingPanelMemorySettings.clearLocalHistory")} </Button>
      </div>

      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
