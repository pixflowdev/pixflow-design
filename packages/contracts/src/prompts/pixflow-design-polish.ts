import type { PixflowRunDesignGuidance } from '../api/pixflow-direct-site.js';
/** Generic transport for optional server-owned guidance. No add-on implementation is bundled here. */
export function optionalRunGuidance(enabled: boolean, guidance: PixflowRunDesignGuidance | null | undefined, prompt: string): string {
  const extension = guidance?.extension;
  if (!extension) return '';
  // A registered operation can precede queued instructions on a new line.
  // Match its command boundary without interpreting the following prose.
  const request = prompt.trim();
  const command = Object.keys(extension.commands).find(value => request.startsWith(value)
    && (request.length === value.length || /\s/.test(request[value.length]!)));
  return enabled || command ? [extension.instructions, command ? extension.commands[command] : ''].filter(Boolean).join('\n') : '';
}
