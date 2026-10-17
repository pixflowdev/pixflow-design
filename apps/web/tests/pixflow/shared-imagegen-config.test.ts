import { describe, expect, it } from 'vitest';
import { createPixflowSharedAppConfigNotification } from '../../src/pixflow/shared-app-config-notification';

describe('floating panel imagegen preference synchronization', () => {
  it.each([true, false])('preserves the explicit Bricks styling choice %s across panels', (enabled) => {
    expect(createPixflowSharedAppConfigNotification({ bricksUseSiteStyles: enabled }, 'bricks_builder')?.patch)
      .toEqual({ bricksUseSiteStyles: enabled });
  });
  it.each([true, false])('preserves the explicit %s preference in both panel notifications', (enabled) => {
    for (const surface of ['wp_admin', 'bricks_builder'] as const) {
      expect(createPixflowSharedAppConfigNotification({
        codexImagegenOverride: enabled,
        agentCliEnv: { codex: { OPENAI_API_KEY: 'private' } },
      }, surface)?.patch).toEqual({ codexImagegenOverride: enabled });
    }
  });
  it('rejects non-boolean preferences', () => {
    expect(createPixflowSharedAppConfigNotification({ codexImagegenOverride: 'true' }, 'wp_admin')?.patch).toEqual({});
  });
});
