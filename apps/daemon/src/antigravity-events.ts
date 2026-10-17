function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** Antigravity's documented headless NDJSON protocol, independent of its prose output. */
export function createAntigravityEvents(emit: (event: Record<string, unknown>) => void) {
  const started = new Set<string>();
  const completed = new Set<string>();
  let hasText = false;
  return (raw: unknown): boolean => {
    if (!raw || typeof raw !== 'object') return false;
    const obj = object(raw);
    if (obj.event === 'init') { emit({type:'status',label:'running'}); return true; }
    if (obj.event === 'step_update' && obj.step_update && typeof obj.step_update === 'object') {
      const step = object(obj.step_update);
      if (step.step_type === 'agent_response' && typeof step.text_delta === 'string') {
        hasText ||= step.text_delta.length > 0;
        emit({type:'text_delta',delta:step.text_delta});
      }
      if (step.step_type === 'tool' && Number.isInteger(step.step_index)) {
        const id = `${step.conversation_id ?? 'agy'}:${step.step_index}`;
        const info = object(step.tool_info);
        if (!started.has(id)) {
          started.add(id);
          emit({type:'tool_use',id,name:info.name ?? step.tool_name ?? 'Tool',input:info.parameters ?? {}});
        }
        if (['DONE', 'ERROR', 'CANCELLED', 'CANCELED'].includes(String(step.state)) && !completed.has(id)) {
          completed.add(id);
          emit({type:'tool_result',toolUseId:id,content:typeof info.output === 'string' ? info.output : JSON.stringify(info.output ?? info.error ?? ''),isError:!!info.error || step.state !== 'DONE'});
        }
      }
      return true;
    }
    if (obj.event === 'result' && obj.result && typeof obj.result === 'object') {
      const result = object(obj.result);
      if (result.status !== 'SUCCESS') emit({type:'error',message:typeof result.error === 'string' ? result.error : `Antigravity: ${result.status ?? 'failed'}`});
      else if (!hasText && typeof result.response === 'string') emit({type:'text_delta',delta:result.response});
      if (result.usage) emit({type:'usage',usage:result.usage});
      return true;
    }
    return false;
  };
}
