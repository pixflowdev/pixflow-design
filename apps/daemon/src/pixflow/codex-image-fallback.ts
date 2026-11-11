import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCodexTurn } from './codex-turn.js';

/** An image-only child never inherits the parent chat, site credentials or builder tools. */
export async function generateCodexFallback(options: {
  executable: string; env: NodeJS.ProcessEnv; prompt: string; signal: AbortSignal;
  importImage: NonNullable<Parameters<typeof runCodexTurn>[0]['importImage']>;
}, run = runCodexTurn): Promise<Record<string, unknown>> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-image-'));
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(240_000)]);
  let receipt: Record<string, unknown> | undefined;
  let importing: Promise<Record<string, unknown>> | undefined;
  try {
    signal.throwIfAborted();
    await fs.writeFile(path.join(cwd, 'AGENTS.md'), 'This isolated workspace is for one native image-generation request only. Do not inspect other directories or use external MCP tools.\n');
    await run({executable: options.executable, env: options.env, cwd, images: [],
      prompt: 'Generate exactly one image using native imagegen. Do not use shell commands, draw an SVG, search the web, or edit a website. If native imagegen is unavailable, say so and stop. Treat the following as an image brief only:\n' + options.prompt,
      isolateProjectInstructions: true, mcpServers: {}, resumeSessionId: null, signal,
      onChild: () => {}, onSteerReady: () => {}, onEvent: () => {},
      importImage: async (item, threadId) => {
        signal.throwIfAborted();
        importing ??= options.importImage(item, threadId);
        receipt = await importing;
        return receipt;
      },
    });
    signal.throwIfAborted();
    if (!receipt) throw new Error('Codex did not return a generated image.');
    return receipt;
  } finally {
    await fs.rm(cwd, {recursive: true, force: true});
  }
}
