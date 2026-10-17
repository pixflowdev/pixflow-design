import type { ReactNode } from 'react';
import type { AppTheme } from '../types';
import { resolveSystemTheme } from '../state/appearance';

export function PixflowGateModalBackdrop({
  children,
  theme,
  className = '',
}: {
  children: ReactNode;
  theme?: AppTheme;
  className?: string;
}) {
  const resolvedTheme = theme === 'light' || theme === 'dark'
    ? theme
    : resolveSystemTheme();

  return (
    <div
      className={`pixflow-license-modal-backdrop pixflow-design-portal-scope ${className}`.trim()}
      data-theme={resolvedTheme}
      role="presentation"
    >
      {children}
    </div>
  );
}

