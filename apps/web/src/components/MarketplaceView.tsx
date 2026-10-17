// Compatibility export consumed by the optional Pro workspace.
// Historical entry points expose personal installed plugins only.
import { PluginsView } from './PluginsView';

export function MarketplaceView() {
  return <PluginsView />;
}
