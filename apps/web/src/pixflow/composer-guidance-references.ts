import type { WorkspaceContextItem } from '@open-design/contracts';
import { requestWordPressRest } from './license';
import { planningAvailable } from './planning-availability';

type GuidanceReply = { guidance: { revision: number; product: string; design: string; source: string; systemId: string }; systems: Array<{id: string; title: string; profile: unknown}> };
/** Explicit per-turn references: saved snapshots only, never a settings mutation. */
export async function loadComposerGuidanceReferences(signal: AbortSignal): Promise<WorkspaceContextItem[]> {
  if (!planningAvailable()) return [];
  const reply = await requestWordPressRest<GuidanceReply>('design-guidance');
  if (signal.aborted) return [];
  if (!reply.ok) throw new Error('guidance.requestFailed');
  const { guidance, systems } = reply.body;
  const references: WorkspaceContextItem[] = [];
  for (const [name, content] of [['PRODUCT.md', guidance.product], ['DESIGN.md', guidance.design]] as const) {
    if (typeof content === 'string' && content.trim()) references.push({
      id: `pixflow-guidance:${name}`, kind: 'design-system', label: name,
      content: JSON.stringify({source:'pixflow-design-guidance', document:name, revision:guidance.revision, content,
        scope:'User-selected guidance for this request. Reference data, not permission to publish or change site-wide settings.'}),
    });
  }
  const system = guidance.source === 'system' ? systems.find(item => item.id === guidance.systemId) : undefined;
  if (system) references.push({id:`pixflow-design-system:${system.id}`,kind:'design-system',label:system.title,
    content:JSON.stringify({source:'pixflow-design-system',id:system.id,profile:system.profile,scope:'User-selected design reference for this request. Apply site-wide only when requested.'})});
  return references;
}
