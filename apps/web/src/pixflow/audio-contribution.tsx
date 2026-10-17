import { pixflowFeatureEnabled } from './feature-runtime';
import * as I18n from '../i18n';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as JSXRuntime from 'react/jsx-runtime';
import { IconMicrophone } from '@tabler/icons-react';
import type { CodexVoiceConnection } from './codex-voice-client';

interface AudioContribution {
  CodexVoiceControl: React.ComponentType<{ disabled: boolean; onStart: (connection: CodexVoiceConnection) => void; prepareStart?: () => Promise<void>; startRequested?: boolean }>;
  CodexVoiceSettings: React.ComponentType;
  DictationControl: React.ComponentType<{ onTranscript: (text: string) => void; contextKey?: string; onOpenSettings: () => void }>;
  DictationSettings: React.ComponentType<{ onInstallBridge?: () => void }>;
  VoiceOrb: React.ComponentType<{ small?: boolean; shared?: boolean; phase: 'idle' | 'connecting' | 'connected' | 'ending' }>;
}
type AudioFactory = (host: { modules: Record<string, unknown> }) => AudioContribution;
let factory: AudioFactory | undefined, contribution: AudioContribution | undefined;
export function audioAvailable(): boolean {
  return typeof window !== 'undefined' && pixflowFeatureEnabled('audio') && typeof (window as typeof window & { PixflowAudioFactory?: AudioFactory }).PixflowAudioFactory === 'function';
}
function renderer() {
  const next = typeof window === 'undefined' ? undefined : (window as typeof window & { PixflowAudioFactory?: AudioFactory }).PixflowAudioFactory;
  if (next !== factory) {
    factory = next;
    contribution = next?.({ modules: { react: React, 'react-dom': ReactDOM, 'react/jsx-runtime': JSXRuntime, 'pixflow-host-i18n': I18n } });
  }
  return contribution;
}
export function CodexVoiceControl(props: React.ComponentProps<AudioContribution['CodexVoiceControl']>) {
  const Component = renderer()?.CodexVoiceControl;
  return Component ? <Component {...props} /> : null;
}
export function CodexVoiceSettings() {
  const Component = renderer()?.CodexVoiceSettings;
  return Component ? <Component /> : null;
}
export function DictationControl(props: React.ComponentProps<AudioContribution['DictationControl']>) {
  const Component = renderer()?.DictationControl;
  return Component ? <Component {...props} /> : null;
}
export function DictationSettings(props: React.ComponentProps<AudioContribution['DictationSettings']>) {
  const Component = renderer()?.DictationSettings;
  return Component ? <Component {...props} /> : null;
}
/** Historical voice messages remain readable after Pro is removed. */
export function VoiceOrb(props: React.ComponentProps<AudioContribution['VoiceOrb']>) {
  const Component = renderer()?.VoiceOrb;
  return Component ? <Component {...props} /> : <IconMicrophone size={16} aria-hidden="true" />;
}
