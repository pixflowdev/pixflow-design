import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) result.push(...(await files(join(root, entry.name))).map(path => `${entry.name}/${path}`));
    else result.push(entry.name);
  }
  return result;
}

/** Check source ownership, never installed or personal runtime directories. */
export async function checkBundledGuidance(root = resolve(import.meta.dirname, '..')): Promise<boolean> {
  const policy = JSON.parse(await readFile(join(root, 'wordpress/resources/skill-editions.json'), 'utf8')) as {
    skills: { folder: string; edition: string; status: string }[];
  };
  const allowed = new Set(policy.skills.filter(skill => skill.edition === 'free' && skill.status === 'bundled').map(skill => skill.folder));
  const failures: string[] = [];
  for (const path of await files(join(root, 'skills'))) {
    if (!path.includes('/') && /^(?:AGENTS|README)\.md$/.test(path)) continue;
    if (!allowed.has(path.split('/')[0]!)) failures.push(`Unowned bundled skill: ${path}`);
  }
  for (const skill of allowed) {
    const text = await readFile(join(root, 'skills', skill, 'SKILL.md'), 'utf8').catch(() => '');
    if (!text.trim()) failures.push(`Missing essential Free skill: ${skill}`);
  }
  const router = await readFile(join(root, 'guidance/scenarios/od-default/SKILL.md'), 'utf8').catch(() => '');
  if (!router.includes('name: od-default')) failures.push('Missing compatible default router');
  for (const retired of ['plugins', 'craft', 'design-templates']) {
    if ((await files(join(root, retired))).length) failures.push(`Retired catalogue restored: ${retired}`);
  }
  for (const path of await files(join(root, 'design-systems'))) {
    if (!path.startsWith('_schema/')) failures.push(`Retired design catalogue restored: ${path}`);
  }
  if (failures.length) console.error(failures.join('\n'));
  else console.log('Essential Free guidance is complete; retired catalogues are absent.');
  return failures.length === 0;
}
