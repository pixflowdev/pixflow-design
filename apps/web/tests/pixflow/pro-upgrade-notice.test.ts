// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

beforeAll(async () => { await import('../../src/pixflow/pro-upgrade-notice-entry'); });
beforeEach(() => {
  document.body.innerHTML = '<section class="pixflow-pro-upgrade">Download Pro</section><a class="pixflow-pro-upgrade-link">Download Pro</a><a id="details">View details</a>';
});
const status = () => ({ license: { valid: true }, central_entitlement: { enabled: true, valid: true }, pro: { eligible: true, installation: 'active' }, runtime_ready: true });
function publish(detail: unknown) { window.dispatchEvent(new CustomEvent('pixflow-design:license-changed', { detail })); }

describe('admin Pro upgrade invitation reconciliation', () => {
  it('removes the old banner and plugin-row CTA after effective Pro activation without submitting dismissal', () => {
    let writes = 0;
    const recordWrite = () => { writes++; };
    document.addEventListener('submit', recordWrite);
    publish(status());
    expect(document.querySelector('.pixflow-pro-upgrade')).toBeNull();
    expect(document.querySelector('.pixflow-pro-upgrade-link')).toBeNull();
    expect(document.querySelector('#details')?.textContent).toBe('View details');
    expect(writes).toBe(0);
    document.removeEventListener('submit', recordWrite);
  });
  it.each([
    null,
    { ...status(), license: { valid: false } },
    { ...status(), central_entitlement: { enabled: true, valid: false } },
    { ...status(), pro: { eligible: true, installation: 'missing' } },
    { ...status(), pro: { eligible: false, installation: 'active' } },
    { ...status(), runtime_ready: false },
  ])('keeps the invitation for incomplete or ineffective activation: %j', value => {
    publish(value);
    expect(document.querySelector('.pixflow-pro-upgrade')).not.toBeNull();
    expect(document.querySelector('.pixflow-pro-upgrade-link')).not.toBeNull();
  });
  it('does not infer access from loaded feature factories or recreate a dismissed banner', () => {
    window.dispatchEvent(new CustomEvent('pixflow-design:feature-runtime-changed', { detail: { features: ['assets', 'planning'] } }));
    expect(document.querySelector('.pixflow-pro-upgrade')).not.toBeNull();
    document.querySelector('.pixflow-pro-upgrade')!.remove();
    publish(status());
    expect(document.querySelector('.pixflow-pro-upgrade')).toBeNull();
  });
});
