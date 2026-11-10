import type { Express, RequestHandler } from 'express';
import { generateAgentText, validateTextRequest } from '../runtimes/text-generation.js';
import type { AgentTextRequest } from '@open-design/contracts';

/** Shared text primitive; premium translation queues and WordPress authorization stay in Pro. */
export function registerAgentTextRoute(app:Express, authorize:RequestHandler, root:string, env:(agent:string)=>Record<string,string>) {
  const maxWorkers=5;
  let active=0;
  const activeByProvider={codex:0,claude:0,'grok-build':0};
  const limitedUntil={codex:0,claude:0,'grok-build':0};
  function capacity(agent:AgentTextRequest['agentId']){
    if(limitedUntil[agent]>Date.now())return 1;
    const configured=process.env['PIXFLOW_'+agent.toUpperCase().replaceAll('-','_')+'_TEXT_CONCURRENCY'];
    return configured===undefined?maxWorkers:(/^[1-5]$/.test(configured)?Number(configured):1);
  }
  const route='/api/agents/text';
  app.get(route,authorize,(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({available:true,codexReasoning:true,codexReasoningLevels:['low','medium','high','xhigh','max'],grokReasoning:true,parallelText:{codex:capacity('codex'),claude:capacity('claude'),'grok-build':capacity('grok-build')}});});
  app.options(route,authorize,(_req,res)=>{res.sendStatus(204);});
  app.post(route,authorize,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    let input;try{input=validateTextRequest(req.body);}catch{res.status(400).json({error:'Invalid text-generation request.'});return;}
    const limit=req.body?.parallel===true?capacity(input.agentId):1;
    if(active>=maxWorkers || activeByProvider[input.agentId]>=limit){res.status(409).json({error:'Another text request is finishing. Try again shortly.'});return;}
    active++;activeByProvider[input.agentId]++;const controller=new AbortController();
    const close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
    try{res.json(await generateAgentText(input,env(input.agentId),root,controller.signal));}
    catch(error){if(error instanceof Error && error.message==='Provider concurrency limited.'){limitedUntil[input.agentId]=Date.now()+300000;if(!res.destroyed)res.status(429).json({error:'Provider capacity reached. Continue with one review.'});return;}if(!res.destroyed){
      const timedOut=error instanceof Error && error.message==='Text generation timed out. Retry the unfinished work.';
      res.status(timedOut?504:502).json({error:timedOut?'The agent timed out while preparing its review.':'Text generation failed. Check the agent connection and retry unfinished work.'});
    }}
    finally{active--;activeByProvider[input.agentId]--;res.off('close',close);}
  });
}
