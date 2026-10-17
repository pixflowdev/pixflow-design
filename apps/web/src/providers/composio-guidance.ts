import { composioAvailable, requireComposioContribution } from '../pixflow/composio-contribution';
export async function fetchComposioGuidance(signal: AbortSignal): Promise<string> {
  if (!composioAvailable()) return '';
  try { return await (await requireComposioContribution()).fetchComposioGuidance(signal); }
  catch { return ''; }
}
