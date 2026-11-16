// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlanningContribution } from '../../src/pixflow/planning-contract';
import { EnhancedDesignGuidance } from '../../src/pixflow/EnhancedDesignGuidance';
const runtime = vi.hoisted(() => ({ enabled: false, load: vi.fn() }));
vi.mock('../../src/pixflow/feature-runtime', () => ({
  pixflowFeatureEnabled: () => runtime.enabled,
  usePixflowFeatureAsset: runtime.load,
}));
const scope = window as Window & { PixflowPlanningFactory?: () => PlanningContribution };
afterEach(() => { cleanup(); runtime.enabled = false; delete scope.PixflowPlanningFactory; vi.clearAllMocks(); });
it('does not expose the premium preference without the planning feature', () => {
  const factory = vi.fn(); scope.PixflowPlanningFactory = factory;
  render(<EnhancedDesignGuidance />);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(factory).not.toHaveBeenCalled();
});
it('waits for the optional planning contribution instead of fabricating a local setting', () => {
  runtime.enabled = true;
  render(<EnhancedDesignGuidance />);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(runtime.load).toHaveBeenCalledWith('pixflow-planning');
});
it('forwards the saved preference and surface to the loaded contribution', () => {
  runtime.enabled = true;
  const component = vi.fn(({enabled, surface}) => <button role="switch" aria-checked={enabled} data-surface={surface}>Guidance</button>);
  scope.PixflowPlanningFactory = () => ({EnhancedDesignGuidance:component}) as unknown as PlanningContribution;
  const {rerender} = render(<EnhancedDesignGuidance enabled={false} surface="wp_admin" />);
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  expect(screen.getByRole('switch').getAttribute('data-surface')).toBe('wp_admin');
  rerender(<EnhancedDesignGuidance enabled surface="bricks_builder" />);
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('switch').getAttribute('data-surface')).toBe('bricks_builder');
});
