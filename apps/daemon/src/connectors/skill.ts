import fs from 'node:fs';
import path from 'node:path';
import { readPublicComposioConfig } from './composio-config.js';

export const COMPOSIO_SKILL_REVISION = '2fb6eac358e34ddee4b893ef8818c155c4be5435';
let skillRoot = path.resolve('skills');
let cachedBody: string | undefined;

export function configureComposioSkillRoot(root: string): void {
  skillRoot = root;
  cachedBody = undefined;
}

/** Use the Bridge's current credential state, never a browser-supplied activation flag. */
export function composioSkillAvailable(): boolean {
  try { return readPublicComposioConfig().configured; } catch { return false; }
}

export function composioSkillPrompt(remoteReferences = false): string {
  if (!composioSkillAvailable()) return '';
  return renderComposioSkill(remoteReferences, false);
}

/** Caller must verify activation through the authenticated WordPress session. */
export function composioSiteSkillPrompt(): string {
  return renderComposioSkill(false, true);
}

function renderComposioSkill(remoteReferences: boolean, wordpress: boolean): string {
  try {
    cachedBody ??= fs.readFileSync(path.join(skillRoot, 'composio', 'SKILL.md'), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    const body = cachedBody.replace(/\]\(references\/([a-z-]+\.md)\)/g, (_match, file: string) => {
      const reference = remoteReferences
        ? `https://raw.githubusercontent.com/ComposioHQ/composio/${COMPOSIO_SKILL_REVISION}/skills/composio/references/${file}`
        : path.join(skillRoot, 'composio', 'references', file).replaceAll('\\', '/');
      return `](${reference})`;
    });
    return [
      wordpress ? '## Composio guidance (enabled on the WordPress site)' : '## Composio guidance (enabled on the connected Pixflow Bridge)',
      'Pixflow already uses Composio Platform. ' + (wordpress ? 'WordPress owns the project key, account selections and permissions; the Bridge does not manage Composio. ' : 'Its project key is saved privately in the Bridge. ') + 'This is not first-time setup: do not install a second CLI, provision projects, request or read credentials, change identity, or add an MCP server to bypass the existing connection.',
      'Use only connector tools actually exposed to this run and their live schemas. A configured project key does not mean any app is connected or that this run has connector execution access. If no connector tool is available, explain that limitation; do not claim to have read account data or call Composio directly with stored credentials. Connect apps through Pixflow Settings → Connectors when the user requests it. Sending messages, modifying remote data or granting access requires the user’s authorization.',
      `Official upstream skill, revision ${COMPOSIO_SKILL_REVISION}. Load the linked references only when relevant.`,
      body,
    ].join('\n\n');
  } catch { return ''; }
}
