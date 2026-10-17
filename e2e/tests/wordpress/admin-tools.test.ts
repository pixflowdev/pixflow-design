// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const wpRoot = process.env.PIXFLOW_QA_WP_ROOT;

describe.skipIf(!wpRoot)('isolated WordPress Free and Pro administration', () => {
  test('uses native directory discovery before and after a simulated initial publication', () => {
    const helper = fileURLToPath(new URL('../../../wordpress/tests/directory-native-updates.integration.php', import.meta.url));
    const result = JSON.parse(execFileSync(process.env.PIXFLOW_QA_PHP || 'php', [helper], { encoding: 'utf8', env: process.env, windowsHide:true, timeout:30_000 }));
    expect(result).toMatchObject({ passed:true, initialNoUpdate:true, laterNativeOffer:true, requests:2, downloaded:false, published:false });
  });
  test('keeps native administration available while rechecking raw authority on every call', () => {
    const helper = fileURLToPath(new URL('../../../wordpress/tests/directory-admin-tools.integration.php', import.meta.url));
    const output = execFileSync(process.env.PIXFLOW_QA_PHP || 'php', [helper], {
      encoding: 'utf8',
      env: process.env,
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    const result = JSON.parse(output);
    expect(result.passed).toBe(true);
    expect(result.states).toEqual(['free', 'pro-unlicensed', 'pro-active', 'pro-expired', 'pro-reactivated']);
    expect(result.checks).toBeGreaterThanOrEqual(70);
    expect(result.authorization).toEqual(expect.arrayContaining(['anonymous', 'revoked-role', 'closed-session', 'expired-session', 'read-only']));
  });
});
