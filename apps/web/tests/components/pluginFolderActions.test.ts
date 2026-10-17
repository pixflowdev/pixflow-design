// Contract test for the prompts the plugin-folder card buttons send to the
// agent. `install` uses the shared template; `publish` targets
// author's own `plugin.repo` URL. The tests below lock the *shape* of each
// prompt (keywords + folder interpolation) without coupling to exact wording,
// so prose tweaks don't break the suite but accidental removal of a critical
// step would.

import { describe, expect, it } from 'vitest';
import { buildPluginFolderAgentActionPrompt } from '../../src/components/design-files/pluginFolderActions';

const FOLDER = 'generated-plugin';

describe('buildPluginFolderAgentActionPrompt', () => {
  describe('install', () => {
    it('mentions the folder path and the supported install CLI', () => {
      const prompt = buildPluginFolderAgentActionPrompt(FOLDER, 'install');
      expect(prompt).toContain(`Plugin folder: \`${FOLDER}\``);
      expect(prompt).toContain('od plugin install --source');
    });
  });

  describe('publish (repo-publish flow)', () => {
    const prompt = buildPluginFolderAgentActionPrompt(FOLDER, 'publish');

    it('delegates repo publishing to the deterministic plugin CLI helper', () => {
      expect(prompt).toContain(`Plugin folder: \`${FOLDER}\``);
      expect(prompt).toContain(`"$OD_NODE_BIN" "$OD_BIN" plugin publish-repo ${FOLDER}`);
      expect(prompt).toMatch(/current gh login|target is not hard-coded/i);
    });

    it('states the CLI-owned responsibilities instead of re-listing shell steps', () => {
      expect(prompt).toContain('gh api user --jq .login');
      expect(prompt).toContain('--owner');
      expect(prompt).toMatch(/last-resort fallback/i);
      expect(prompt).toMatch(/placeholder owners are rejected/i);
      expect(prompt).toMatch(/manifest repo normalization/i);
      expect(prompt).toMatch(/repo existence check/i);
      expect(prompt).toMatch(/repo create\/update/i);
      expect(prompt).toMatch(/final verification/i);
    });

    it('bans the registry-submission CLI explicitly', () => {
      // The legacy CLI is what shipped the bug — without an explicit ban
      // the agent had been routing back to it. The mention must be in a
      // negative imperative ("Do NOT call …"), not a recommendation.
      expect(prompt).toMatch(
        /Do NOT (call|route through) `?od plugin publish --to open-design`?/i,
      );
      expect(prompt).toMatch(
        /registry[- ]submission|registry-submission flow|Pixflow Design PR/i,
      );
    });

    it('hard-bans mid-turn clarification + auto-install + force-push + retry', () => {
      expect(prompt).toContain('<question-form>');
      expect(prompt).toMatch(/fire-and-forget|clarification UI that waits/i);
      expect(prompt).toMatch(/do not try to install/i);
      expect(prompt).toMatch(/do not force-push|--force/i);
      expect(prompt).toMatch(/do not retry/i);
    });

    it('interpolates the actual folder path into the CLI command', () => {
      // Sanity check that template-string interpolation didn't regress into
      // literal `${folderPath}` substrings.
      expect(prompt).toContain(`plugin publish-repo ${FOLDER}`);
      expect(prompt).not.toContain('${folderPath}');
    });

    it('ends by handing the repo URL back to chat', () => {
      expect(prompt).toMatch(/final repo URL printed by the CLI/i);
    });
  });

});
