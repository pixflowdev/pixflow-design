import type { PixflowDirectCanvasDepartureRequest, PixflowEditorTarget } from '@open-design/contracts';
import { pixflowWordPressRestFetch } from './runtime-fetch';

/** Hand off only this tab's same-page editor connection; pending edits are never replayed. */
export async function notifyFloatingCanvasDeparture(metadata: unknown, postId: number, resolveDestination?: () => Promise<PixflowEditorTarget | undefined>): Promise<void> {
  const target = (metadata as {editorTarget?: {builder?: string;canvasId?: string;postId?:number}} | undefined)?.editorTarget;
  if (target?.builder !== 'bricks' || target.postId !== postId || !(postId > 0)
    || !/^[a-f0-9]{32}$/.test(target.canvasId || '') || !navigator.locks) return;
  // Duplicate Tab can copy sessionStorage. The still-open originating canvas
  // holds this lock, so a copied receipt cannot suspend another live tab.
  await navigator.locks.request(`pixflow-canvas:${target.canvasId}`, {ifAvailable:true}, async lock => {
    if (!lock) return;
    const body: PixflowDirectCanvasDepartureRequest = {action:'depart',builder:'bricks',canvasId:target.canvasId!,postId};
    const destination = await resolveDestination?.();
    if (destination?.builder === 'gutenberg' && destination.postId === postId) body.destination = destination;
    const response=await pixflowWordPressRestFetch('/wp-admin/direct/canvas', {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Could not confirm the editor transition. Reopen this panel to reconnect; no pending edit has been repeated.');
  });
}
