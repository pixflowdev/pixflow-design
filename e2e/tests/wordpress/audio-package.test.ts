import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, it } from 'vitest';

it('ships microphone, speech settings and WebGL audio implementations only in Pro', async () => {
  const root = new URL('../../../', import.meta.url);
  const core = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-ai.zip', root)));
  const pro = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-design-pro.zip', root)));
  for (const path of ['assets/app/pixflow-audio.js', 'assets/app/pixflow-audio.css', 'src/Audio/AudioModule.php']) {
    expect(core.file('pixflow-ai/' + path)).toBeNull();
    expect(pro.file('pixflow-design-pro/' + path)).not.toBeNull();
  }
  const free = await core.file('pixflow-ai/assets/app/pixflow-design-app.js')!.async('string');
  const paid = await pro.file('pixflow-design-pro/assets/app/pixflow-audio.js')!.async('string');
  for (const implementation of ['getUserMedia', 'RTCPeerConnection', 'MediaRecorder', '/api/pixflow/dictation/transcribe', 'oai-events']) {
    expect(free).not.toContain(implementation);
    expect(paid).toContain(implementation);
  }
  expect(free).toContain('Codex Voice');
  expect(free).toContain('voice_transcript');
  expect(paid).toContain('features/audio/authorize');
});
