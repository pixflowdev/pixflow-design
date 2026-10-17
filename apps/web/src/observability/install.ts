// Single entry point for the web-side observability surface.
//
// Called as a side-effect import from `apps/web/app/[[...slug]]/client-app.tsx`
// at module load. Each observer is defensive and local-only, so this call
// is safe to make unconditionally.

import { installLongTaskObserver } from './long-task';
import { installResourceErrorObserver } from './resource-error';
import { installBootTimingObserver } from './boot-timing';
import { installVisibilityObserver } from './visibility';
import { installWhiteScreenDetector } from './white-screen';

let installed = false;

export function installWebObservability(): () => void {
  if (installed) return () => undefined;
  if (typeof window === 'undefined') return () => undefined;
  installed = true;

  const teardowns: Array<() => void> = [
    installLongTaskObserver(),
    installResourceErrorObserver(),
    installBootTimingObserver(),
    installVisibilityObserver(),
    installWhiteScreenDetector(),
  ];

  return () => {
    for (const teardown of teardowns) {
      try {
        teardown();
      } catch {
        // best-effort — teardown failures must never propagate
      }
    }
    installed = false;
  };
}
