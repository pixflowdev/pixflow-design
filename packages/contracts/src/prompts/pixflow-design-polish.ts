import type { PixflowRunDesignGuidance } from '../api/pixflow-direct-site.js';
/** Generic transport for optional server-owned guidance. No add-on implementation is bundled here. */
export function optionalRunGuidance(enabled: boolean, guidance: PixflowRunDesignGuidance | null | undefined, prompt: string): string {
  const extension = guidance?.extension;
  if (!extension) return '';
  const command = Object.keys(extension.commands).find(value => prompt.trim() === value || prompt.trim().startsWith(value + ' '));
  return enabled || command ? [extension.instructions, command ? extension.commands[command] : ''].filter(Boolean).join('\n') : '';
}
