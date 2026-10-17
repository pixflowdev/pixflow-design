import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..', '..', '..');

describe('Pixflow WordPress REST proxy authentication recovery', () => {
  it.skipIf(!process.env.PIXFLOW_DESIGN_PRO_ROOT)('refreshes an expired REST nonce and retries the original request once', () => {
    const source = readFileSync(
      resolve(process.env.PIXFLOW_DESIGN_PRO_ROOT!, 'wordpress-pro/assets/pixflow-design-builder.js'),
      'utf8',
    );

    expect(source).toContain('pixflow_design_refresh_rest_nonce');
    expect(source).toContain("responseBody.code === 'rest_cookie_invalid_nonce'");
    expect(source).toContain('performWordPressRestRequest(path, method, body, keepalive, true)');
  });

  it('registers an authenticated WordPress nonce refresh endpoint', () => {
    const source = readFileSync(
      resolve(root, 'wordpress/src/Http/RestController.php'),
      'utf8',
    );

    expect(source).toContain("wp_ajax_pixflow_design_refresh_rest_nonce");
    expect(source).toContain("wp_create_nonce('wp_rest')");
  });
});

describe('Pixflow WordPress conversation mode persistence', () => {
  it('preserves canonical Ask, Plan, and Design modes when WordPress creates a conversation', () => {
    const source = readFileSync(
      resolve(root, 'wordpress/src/Http/RestController.php'),
      'utf8',
    );

    expect(source).toContain(
      'protected function od_normalize_session_mode(string $session_mode): string',
    );
    expect(source).toContain("in_array($session_mode, ['ask', 'chat'], true)");
    expect(source).toContain("if ($session_mode === 'plan')");
    expect(source.match(/'sessionMode' => \$this->od_normalize_session_mode\(\$session_mode\)/g))
      .toHaveLength(2);
  });
});
