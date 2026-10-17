// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CodexVoiceControl as OptionalVoice, DictationControl as OptionalDictation, VoiceOrb } from '../../src/pixflow/audio-contribution';
vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('Free has no audio actions while historical voice identity still renders', () => {
  render(<><OptionalVoice disabled={false} onStart={vi.fn()} /><OptionalDictation onTranscript={vi.fn()} onOpenSettings={vi.fn()} /><VoiceOrb phase="idle" /></>);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
