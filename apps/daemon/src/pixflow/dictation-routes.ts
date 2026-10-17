import { audioSession, authorizeAudio, watchAudioAccess } from './audio-authorization.js';
import { revokeDirectSession } from './direct-site-session.js';
import type { PixflowDirectSiteSession } from '@open-design/contracts';
import express, {type Express, type RequestHandler} from 'express';
import { DictationModule } from './dictation.js';
import { registerPixflowRuntimeWork } from './runtime-idle.js';

export function registerDictationRoutes(app: Express, dataDir: string, permission: RequestHandler): void {
  const module=new DictationModule(dataDir);
  let active=0;
  registerPixflowRuntimeWork(app,()=>active>0||module.isBusy());
  for(const action of ['status','enable','disable','download','cancel-download','select','delete','transcribe'] as const) {
    const route='/api/pixflow/dictation/'+action;
    app.options(route,permission,(_req,res)=>{res.status(204).end();});
    app.post(route,permission,express.raw({type:'audio/wav',limit:'4mb'}),async(req,res)=>{
      res.set('Cache-Control','no-store');
      let session: PixflowDirectSiteSession | undefined;
      let authorized = false;
      try {
        session = audioSession(req);
        await authorizeAudio(session, ['disable', 'cancel-download', 'delete'].includes(action));
        authorized = true;
        if(action==='transcribe') {
          if(!Buffer.isBuffer(req.body)){res.status(400).json({message:'Send a PCM WAV recording.'});return;}
          const controller=new AbortController();
          const stopAccess = watchAudioAccess(session, () => controller.abort());
          const cancel=()=>{if(!res.writableEnded)controller.abort();};
          res.on('close',cancel); active++;
          try {res.json({text:await module.transcribe(req.body,controller.signal,typeof req.query.language==='string'?req.query.language:'auto')});}
          finally {stopAccess();active--;res.off('close',cancel);}
        } else res.json(action==='status'?await module.status():await module.change(action,req.body?.model));
      } catch(error) {if(!res.destroyed)res.status(authorized ? 400 : 403).json({message:error instanceof Error?error.message:'Dictation unavailable.'});}
      finally { if (authorized && session) await revokeDirectSession(session); }
    });
  }
}
