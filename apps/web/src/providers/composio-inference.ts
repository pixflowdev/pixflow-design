import type { ComposioInferenceRequest, ComposioInferenceResponse } from '@open-design/contracts';
import { requireComposioContribution } from '../pixflow/composio-contribution';
export async function composioInferenceJson<T>(action: string, body?: unknown, signal?: AbortSignal, method?: string): Promise<T> {
  return (await requireComposioContribution()).composioInferenceJson<T>(action, body, signal, method);
}
export const composioInferenceTurn = (input: ComposioInferenceRequest, signal: AbortSignal) => composioInferenceJson<ComposioInferenceResponse>('turn', input, signal);
