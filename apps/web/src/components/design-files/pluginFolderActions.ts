export type PluginFolderAgentAction = 'install' | 'publish';

const INSTALL_TITLE = 'Install this generated plugin into My plugins.';
const INSTALL_NOTE =
  'Prefer the supported `od plugin install --source` flow after confirming the manifest.';

export function buildPluginFolderAgentActionPrompt(
  relativePath: string,
  action: PluginFolderAgentAction,
): string {
  const folderPath = normalizePluginFolderPath(relativePath);
  if (action === 'publish') return buildPublishPrompt(folderPath);
  return [
    INSTALL_TITLE,
    '',
    `Plugin folder: \`${folderPath}\``,
    `Manifest: \`${folderPath}/open-design.json\``,
    '',
    'Please do this through the `od` CLI from the current project workspace, not through hidden UI APIs.',
    INSTALL_NOTE,
    'Read the manifest first to confirm the plugin name/version, run validation or doctor commands when relevant, then run the exact CLI command needed for this action.',
    'Report the commands you ran, the resulting URL/path if any, and any CLI, auth, or `gh` errors so I can ask follow-up questions in chat.',
  ].join('\n');
}

// Publish to the author's own repository.
function buildPublishPrompt(folderPath: string): string {
  return [
    'Publish this generated plugin to a public GitHub repository owned by the author.',
    'The goal is to end this turn with a single repo URL the user can open in their browser to verify the published plugin code.',
    '',
    `Plugin folder: \`${folderPath}\``,
    `Manifest: \`${folderPath}/open-design.json\``,
    '',
    'This is the **repository publish** action, NOT the registry-submission action — do NOT route through `od plugin publish --to open-design`. Catalogue submission is retired.',
    '',
    'Run this deterministic Pixflow Design CLI workflow from the current project workspace:',
    '',
    `\`"$OD_NODE_BIN" "$OD_BIN" plugin publish-repo ${folderPath}\``,
    '',
    'The CLI owns the GitHub auth gate and owner resolution: `--owner` if supplied, otherwise a trusted non-placeholder `plugin.repo` owner or local `gh auth status`, with `gh api user --jq .login` only as a last-resort fallback. It then handles manifest repo normalization, repo existence check, git commit/tag, repo create/update, push, and final verification. It publishes to the author\'s own repo; the target is not hard-coded and placeholder owners are rejected.',
    'Report the exact command, any structured CLI error, and the final repo URL printed by the CLI. Stop on failure; do not recreate the git/gh workflow manually.',
    '',
    '**Hard constraints.** Treat these as inviolable:',
    '- Do NOT call `od plugin publish --to open-design` (or any `--to <catalog>` variant). That is the registry-submission flow, not the repository-publish flow.',
    '- Do NOT emit a `<question-form>` or any clarification UI that waits for the user. Fire-and-forget.',
    '- Do NOT try to install `gh`, `git`, or any other binary. Detect-and-instruct only.',
    '- Do NOT force-push (`--force` / `--force-with-lease`) and do NOT overwrite an existing tag. Fail and report instead.',
    '- Do NOT retry a failed step. Report the error and stop.',
  ].join('\n');
}

function normalizePluginFolderPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}
