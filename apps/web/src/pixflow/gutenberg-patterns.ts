import type { PixflowGutenbergEntity } from '@open-design/contracts';

type PatternBlock = { name: string; attributes?: Record<string, unknown>; innerBlocks?: PatternBlock[] };
type PatternRecord = { status?: string; wp_pattern_sync_status?: string; meta?: { wp_pattern_sync_status?: string }; content?: { raw?: string } };

/** A synced reference must resolve to published, readable, acyclic shared content.
 * Unsynced patterns are copied as native blocks; never silently convert their mode. */
export async function validateGutenbergPatterns(
  blocks: PatternBlock[], entity: PixflowGutenbergEntity,
  fetchRecord?: (options: { path: string }) => Promise<PatternRecord>,
  parse?: (content: string) => PatternBlock[],
): Promise<void> {
  const checked = new Set<number>();
  const visit = async (items: PatternBlock[], ancestors: Set<number>, depth = 0): Promise<void> => {
    if (depth > 30) throw new Error('The pattern nesting is too deep to validate safely.');
    for (const block of items) {
      if (block.name === 'core/block') {
        const id = block.attributes?.ref;
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new Error('Choose a valid synced pattern reference.');
        if (ancestors.has(id)) throw new Error('This pattern reference creates a cycle. No blocks were changed.');
        if (!checked.has(id)) {
          if (!fetchRecord || !parse) throw new Error('Pattern discovery is unavailable. Reload the editor.');
          if (checked.size >= 100) throw new Error('Too many shared patterns to validate safely.');
          const record = await fetchRecord({ path: `/wp/v2/blocks/${id}?context=edit&_fields=id,status,meta,wp_pattern_sync_status,content` });
          if (record?.status !== 'publish') throw new Error('Choose a published pattern before referencing it.');
          if ((record.wp_pattern_sync_status ?? record.meta?.wp_pattern_sync_status) === 'unsynced') throw new Error('This pattern is an independent copy. Insert its native blocks instead of a synced reference.');
          if (typeof record.content?.raw !== 'string') throw new Error('The pattern content could not be read. No blocks were changed.');
          checked.add(id);
          await visit(parse(record.content.raw), new Set([...ancestors, id]), depth + 1);
        }
      }
      await visit(block.innerBlocks ?? [], ancestors, depth + 1);
    }
  };
  await visit(blocks, new Set(entity.type === 'wp_block' ? [Number(entity.id)] : []));
}

export function liveGutenbergPatterns(blocks: PatternBlock[], entity: PixflowGutenbergEntity) {
  const wp = typeof window === 'undefined' ? undefined : (window as any).wp;
  return validateGutenbergPatterns(blocks, entity, wp?.apiFetch, wp?.blocks?.parse);
}
