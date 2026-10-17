import { describe, expect, it } from 'vitest';
import { bridgeUpdateRequiredForProps } from '../../src/pixflow/bridge-update-gate';

describe('Pixflow Bridge update state', () => {
  it('blocks CLI surfaces when the host reports an update requirement', () => {
    expect(bridgeUpdateRequiredForProps(
      { active: true, mode: 'daemon' },
      { updateRequired: true, state: 'update', version: '1.1.4' },
    ).required).toBe(true);
  });

  it('does not block API/BYOK surfaces while the Bridge is outdated', () => {
    expect(bridgeUpdateRequiredForProps(
      { active: true, mode: 'api' },
      { updateRequired: true, state: 'update', version: '1.1.4' },
    ).required).toBe(false);
  });

  it('compares an installed version with the required version', () => {
    expect(bridgeUpdateRequiredForProps(
      { active: true, mode: 'daemon', requiredVersion: '1.1.5', installedVersion: '1.1.4' },
      { state: 'connected', running: true, version: '1.1.4' },
    ).required).toBe(true);
    expect(bridgeUpdateRequiredForProps(
      { active: true, mode: 'daemon', requiredVersion: '1.1.5', installedVersion: '1.1.5' },
      { state: 'connected', running: true, version: '1.1.5' },
    ).required).toBe(false);
  });

  it('does not treat a missing Bridge as an update requirement', () => {
    expect(bridgeUpdateRequiredForProps(
      { active: true, mode: 'daemon', requiredVersion: '1.1.5' },
      { state: 'missing', running: false },
    ).required).toBe(false);
  });
});
