import { freeWordPressPackage, testWordPressPackages } from '@/vitest/wordpress-packages';
import { expect } from 'vitest';

testWordPressPackages('ships microphone, speech settings and WebGL audio implementations only in Pro', async (pro) => {
  const core = await freeWordPressPackage();
  for (const path of ['assets/app/pixflow-audio.js', 'assets/app/pixflow-audio.css', 'src/Audio/AudioModule.php']) {
    expect(core.file('pixflow-ai/' + path)).toBeNull();
    if (pro) expect(pro.file('pixflow-design-pro/' + path)).not.toBeNull();
  }
  const free = await core.file('pixflow-ai/assets/app/pixflow-design-app.js')!.async('string');
  const paid = pro ? await pro.file('pixflow-design-pro/assets/app/pixflow-audio.js')!.async('string') : '';
  for (const implementation of ['getUserMedia', 'RTCPeerConnection', 'MediaRecorder', '/api/pixflow/dictation/transcribe', 'oai-events']) {
    expect(free).not.toContain(implementation);
    if (pro) expect(paid).toContain(implementation);
  }
  expect(free).toContain('Codex Voice');
  expect(free).toContain('voice_transcript');
  if (pro) expect(paid).toContain('features/audio/authorize');
});
