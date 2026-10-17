import { directDigest } from './direct-site-store.js';

type Message = {role:string;content:string};
export interface AcceptedDirectSteering { id:string; text:string; contentOffset:number }

export const directHistoryLineage = (history: Message[]): string => directDigest(history.slice(-2).map(({role,content})=>({role,content})));

/** Match the visible timeline using only steering acknowledged by this native turn. */
export function directTurnLineage(history: Message[], prompt: string, assistant: string, steering: AcceptedDirectSteering[]): string {
  const turn:Message[]=[{role:'user',content:prompt}];
  const seen=new Set<string>();
  let offset=0;
  for(const message of steering){
    if(seen.has(message.id))continue;
    seen.add(message.id);
    const end=Math.max(offset,Math.min(assistant.length,Number.isFinite(message.contentOffset)?message.contentOffset:offset));
    if(end>offset)turn.push({role:'assistant',content:assistant.slice(offset,end)});
    if(message.text)turn.push({role:'user',content:message.text});
    offset=end;
  }
  if(offset<assistant.length)turn.push({role:'assistant',content:assistant.slice(offset)});
  return directHistoryLineage([...history,...turn]);
}
