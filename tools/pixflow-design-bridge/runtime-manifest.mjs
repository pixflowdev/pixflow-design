import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Executable workflow resources that every Pixflow Design Bridge runtime must ship.
 *
 * Keep this list authoritative for both source installs and release-package
 * assembly. Pixflow Markdown abilities are deliberately excluded: WordPress
 * owns and supplies those to BYOK and Local CLI runs.
 */
export const BRIDGE_BUNDLED_WORKFLOW_PATHS = Object.freeze([
  'plugins/_official/examples/web-clone',
  'skills/web-clone',
]);

/** Free source installs can boot the native CLI without private workflows.
 * Release assembly requires the complete manifest, supplied by the explicitly
 * paired Pro checkout. Installed release archives already contain these files. */
export function resolveBridgeWorkflowSources(sourceRoot, { proRoot, requirePro = false } = {}) {
  const privateRoot = proRoot ? resolve(proRoot) : undefined;
  if (privateRoot) {
    const manifest = JSON.parse(readFileSync(join(privateRoot, 'pixflow-pro.json'), 'utf8'));
    if (manifest.buildContract !== 1) throw new Error('Unsupported Pro build contract for Bridge workflows.');
  }
  return BRIDGE_BUNDLED_WORKFLOW_PATHS.flatMap(relativePath => {
    const paid = relativePath.startsWith('skills/');
    const source = paid && privateRoot ? join(privateRoot, relativePath) : join(sourceRoot, relativePath);
    if (existsSync(source)) return [{ relativePath, source }];
    if (paid && !privateRoot && !requirePro) return [];
    throw new Error(`Bridge workflow ${relativePath} is missing. Supply PIXFLOW_DESIGN_PRO_ROOT or --pro-root for the complete Pro runtime.`);
  });
}
