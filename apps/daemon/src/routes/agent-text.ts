import type { Express, RequestHandler } from 'express';
import { generateAgentText, validateTextRequest } from '../runtimes/text-generation.js';

/** Shared text primitive; premium translation queues and WordPress authorization stay in Pro. */
export function registerAgentTextRoute(app:Express, authorize:RequestHandler, root:string, env:(agent:string)=>Record<string,string>) {
  let active=false;
  const route='/api/agents/text';
  app.get(route,authorize,(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({available:true});});
  app.options(route,authorize,(_req,res)=>{res.sendStatus(204);});
  app.post(route,authorize,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    let input;try{input=validateTextRequest(req.body);}catch{res.status(400).json({error:'Invalid text-generation request.'});return;}
    if(active){res.status(409).json({error:'Another text request is finishing. Try again shortly.'});return;}
    active=true;const controller=new AbortController();
    const close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
    try{res.json(await generateAgentText(input,env(input.agentId),root,controller.signal));}
    catch{if(!res.destroyed)res.status(502).json({error:'Text generation failed. Check the agent connection and retry unfinished work.'});}
    finally{active=false;res.off('close',close);}
  });
}
