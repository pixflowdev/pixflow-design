import {expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readVoiceSample} from '../../src/pixflow/voice-preview.js';
it('reads only supported WAV samples and rejects paths and malformed audio',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixflow-voice-preview-'));
  try {
    const wav=Buffer.from('RIFF0000WAVEtest');
    const tree={files:{webview:{files:{assets:{files:{'cove.en.123-abc.wav':{size:wav.length,offset:'0'}}}}}}};
    const header=Buffer.from(JSON.stringify(tree));const prefix=Buffer.alloc(16);prefix.writeUInt32LE(header.length+8,4);prefix.writeUInt32LE(header.length,12);
    const archive=path.join(directory,'app.asar');await fs.writeFile(archive,Buffer.concat([prefix,header,wav]));
    expect(await readVoiceSample(archive,'cove')).toEqual(wav);
    expect(await readVoiceSample(archive,'../cove')).toBeNull();
    expect(await readVoiceSample(archive,'sol')).toBeNull();
    await fs.writeFile(archive,Buffer.concat([prefix,header,Buffer.alloc(wav.length)]));
    expect(await readVoiceSample(archive,'cove')).toBeNull();
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
