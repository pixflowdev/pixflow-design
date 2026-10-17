import { Button } from '@open-design/components';
import { WorkspaceLoading } from '../components/WorkspaceLoading';
import { useT } from '../i18n';

/** Reuse the workspace indicator while an optional module is fetched. */
export function FeatureContributionLoading({ error, retry }: { error: boolean; retry: () => void }) {
  const t = useT();
  return error ? <div role="alert"><p>{t('license.featureRefreshError')}</p><Button onClick={retry}>{t('workspaceSidebar.retry')}</Button></div> : <WorkspaceLoading />;
}
