'use client';

import dynamic from 'next/dynamic';

import { installWebObservability } from '../../src/observability/install';

// Install local-only observability guards. These do not send telemetry.
installWebObservability();

// The product is a fully client-driven SPA — every component reads
// localStorage, window.location, etc. — so we opt out of static-time
// rendering for the entire tree. This keeps `next build --output export`
// from trying to evaluate browser-only code while still emitting a real
// shell HTML the daemon can serve as the SPA fallback.
const App = dynamic(() => import('../../src/StandaloneApp').then((m) => m.App), {
  ssr: false,
  loading: () => <div className="od-loading-shell">Loading Pixflow Design…</div>,
});

const BricksAgentFrameApp = dynamic(
  () => import('../../src/StandaloneBricksAgentFrameApp').then((m) => m.BricksAgentFrameApp),
  {
    ssr: false,
    loading: () => <div className="od-loading-shell">Loading Pixflow Bricks Agent…</div>,
  },
);

function isPixflowBricksAgentFrameRequest(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('pixflowBricksAgent') === '1';
}

export function ClientApp() {
  // Pixflow-owned: the Bricks builder hosts the agent panel in the local
  // bridge iframe. This must bypass the normal app/onboarding route because
  // the builder shell supplies WordPress context and license state.
  if (isPixflowBricksAgentFrameRequest()) {
    return <BricksAgentFrameApp />;
  }

  return <App />;
}
