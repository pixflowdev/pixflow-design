// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BridgeExtensionBanner } from '../../src/components/BridgeExtensionBanner';
afterEach(() => { cleanup(); vi.useRealTimers(); delete (window as any).__PIXFLOW_NATIVE_PROTOTYPE__; delete (window as any).pixflowDesignBridgeStatus; });
it('offers the published extension without changing a direct connection', () => {
  (window as any).pixflowDesignBridgeStatus = { connectionRoute: 'direct' };
  render(<BridgeExtensionBanner />);
  const link = screen.getByRole('link');
  expect(link.getAttribute('href')).toBe('https://chromewebstore.google.com/detail/pixflow-design-bridge/hbnbiboohlelmngadeolikeejamjlbkh');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.getByText(/Optional/)).toBeTruthy();
  expect((window as any).pixflowDesignBridgeStatus.connectionRoute).toBe('direct');
});
it('hides when the extension is present even without a connected Bridge', () => {
  (window as any).__PIXFLOW_NATIVE_PROTOTYPE__ = true;
  render(<BridgeExtensionBanner />);
  expect(screen.queryByRole('link')).toBeNull();
});
it('detects installation while settings remain open', () => {
  vi.useFakeTimers(); render(<BridgeExtensionBanner />);
  expect(screen.queryByRole('link')).not.toBeNull();
  act(() => { (window as any).__PIXFLOW_NATIVE_PROTOTYPE__ = true; vi.advanceTimersByTime(1500); });
  expect(screen.queryByRole('link')).toBeNull();
});
