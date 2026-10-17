import type { AgentEvent } from '../types';

export type CodexVoiceStatus = 'connecting' | 'connected' | 'speaking' | 'muted' | 'ending';

type VoiceTranscript = Extract<AgentEvent, { kind: 'voice_transcript' }>;

export function voiceStatusUpdates(connection: CodexVoiceConnection, onUpdate: (content: string, events: AgentEvent[]) => void) {
  let content = '';
  let events: AgentEvent[] = [];
  let status: CodexVoiceStatus = 'connecting';
  const publish = () => onUpdate(content, [...events.filter(event => !(event.kind === 'status' && event.code === 'voice_connection')), { kind: 'status', code: 'voice_connection', label: status }]);
  const unsubscribe = connection.subscribeStatus?.(next => { status = next; publish(); });
  if (!unsubscribe) publish();
  return {
    update(nextContent: string, nextEvents: AgentEvent[]) { content = nextContent; events = nextEvents; publish(); },
    dispose() { unsubscribe?.(); },
  };
}

/** Callbacks stay in the UI; only the offer crosses the Bridge boundary. */
export interface CodexVoiceConnection {
  sdp: string;
  name?: string;
  signal: AbortSignal;
  answer: (sdp: string) => Promise<void>;
  finish: (error?: string) => void;
  onEndReady: (end: () => Promise<void>) => void;
  subscribeStatus?: (listener: (status: CodexVoiceStatus) => void) => () => void;
  subscribeTranscript?: (listener: (event: VoiceTranscript) => void) => () => void;
}
