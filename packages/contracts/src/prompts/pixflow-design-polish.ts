import type { PixflowRunDesignGuidance } from '../api/pixflow-direct-site.js';
/** Generic transport for optional server-owned guidance. No add-on implementation is bundled here. */
export function optionalRunGuidance(enabled: boolean, guidance: PixflowRunDesignGuidance | null | undefined, prompt: string): string {
  const extension = guidance?.extension;
  if (!extension) return '';
  // The composer can place several registered slash commands inside a prompt.
  // Require whitespace boundaries so URLs and longer command names do not match.
  const operations = Object.entries(extension.commands).flatMap(([command, instructions]) => {
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const index = prompt.search(new RegExp('(?:^|\\s)' + escaped + '(?=\\s|$)', 'i'));
    return index < 0 ? [] : [{ index, instructions }];
  });
  operations.sort((a, b) => a.index - b.index);
  if (!enabled && operations.length === 0) return '';
  return [extension.instructions, ...operations.map(({ instructions }) => instructions)].filter(Boolean).join('\n');
}
