import { TranslatedText } from '../i18n/TranslatedText';
import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ApplyResult,
  type InstalledPluginRecord,
  type PluginSourceKind,
} from '@open-design/contracts';
import { useAnalytics } from '../analytics/provider';
import {
  trackPageView,
  trackPluginImportModalClick,
  trackPluginImportModalSurfaceView,
  trackPluginImportResult,
  trackPluginsInstalledTabClick,
  trackPluginsTemplatesDropdownClick,
  trackPluginsTopClick,
} from '../analytics/events';
import {
  applyPlugin,
  installPluginSource,
  listPlugins,
  type PluginInstallOutcome,
  type PluginShareAction,
  type PluginShareProjectOutcome,
  uploadPluginFolder,
  uploadPluginZip,
} from '../state/projects';
import { Icon } from './Icon';
import { PluginDetailsModal } from './PluginDetailsModal';
import { PluginsHomeSection } from './PluginsHomeSection';
import { TrustBadge } from './TrustBadge';
import { useI18n } from '../i18n';
import type { PluginUseAction } from './plugins-home/useActions';
import { AnimatePresence } from 'motion/react';

const USER_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

const PLUGIN_SHARE_DETAILS: Record<'publish-github', {
  eyebrow: string;
  fallbackTitle: string;
  fallbackDescription: string;
  confirmLabel: string;
  steps: string[];
}> = {
  'publish-github': {
    eyebrow: 'GitHub repository',
    fallbackTitle: 'Publish Plugin to GitHub',
    fallbackDescription:
      'Creates a public GitHub repository for this local Pixflow Design plugin.',
    confirmLabel: 'Start publishing',
    steps: [
      'Create a new Pixflow Design project for the publish workflow.',
      'Copy this plugin into that project as isolated source context.',
      'Publish the copied plugin through the local daemon.',
    ],
  },
};

interface PluginsViewProps {
  onCreatePlugin?: (goal?: string) => void;
  onUsePlugin?: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  onCreatePluginShareProject?: (
    pluginId: string,
    action: PluginShareAction,
    locale?: string,
  ) => Promise<PluginShareProjectOutcome>;
}

export function PluginsView({
  onCreatePlugin,
  onUsePlugin,
  onCreatePluginShareProject,
}: PluginsViewProps) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const pluginsPageViewFiredRef = useRef(false);
  useEffect(() => {
    if (pluginsPageViewFiredRef.current) return;
    pluginsPageViewFiredRef.current = true;
    trackPageView(analytics.track, { page_name: 'plugins' });
  }, [analytics.track]);
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [pendingShareAction, setPendingShareAction] = useState<{
    pluginId: string;
    action: PluginShareAction;
  } | null>(null);
  const [activePlugin, setActivePlugin] = useState<{
    record: InstalledPluginRecord;
    result: ApplyResult;
  } | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const [shareConfirm, setShareConfirm] = useState<{
    sourceRecord: InstalledPluginRecord;
    action: PluginShareAction;
  } | null>(null);
  const [notice, setNotice] = useState<PluginInstallOutcome | { ok: boolean; message: string } | null>(null);

  async function refresh() {
    setLoading(true);
    setPlugins(await listPlugins());
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    window.addEventListener('open-design:plugins-changed', refresh);
    return () => window.removeEventListener('open-design:plugins-changed', refresh);
  }, []);

  const userPlugins = useMemo(
    () => plugins.filter((plugin) => USER_SOURCE_KINDS.has(plugin.sourceKind)),
    [plugins],
  );

  async function finishImport(
    work: () => Promise<PluginInstallOutcome>,
  ) {
    setNotice(null);
    const outcome = await work();
    setNotice(outcome);
    if (outcome.ok) {
      setImportOpen(false);
      await refresh();
    }
    return outcome;
  }

  async function handleUsePlugin(
    record: InstalledPluginRecord,
    action: PluginUseAction = 'use',
  ) {
    if (onUsePlugin) {
      setDetailsRecord(null);
      onUsePlugin(record, action);
      return;
    }
    setPendingApplyId(record.id);
    setNotice(null);
    const result = await applyPlugin(record.id, { locale });
    setPendingApplyId(null);
    if (!result) {
      setNotice({
        ok: false,
        message: `Failed to apply ${record.title}. Make sure the daemon is reachable.`,
      });
      return;
    }
    setActivePlugin({ record, result });
    setDetailsRecord(null);
    setNotice({
      ok: true,
      message: `${record.title} is ready. Use it from Home with @ search.`,
    });
  }

  async function handleCreatePluginShareTask(
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) {
    if (!onCreatePluginShareProject) {
      setNotice({
        ok: false,
        message: 'Plugin sharing is not available in this shell.',
      });
      setShareConfirm(null);
      return;
    }
    setPendingShareAction({ pluginId: record.id, action });
    setNotice(null);
    const outcome = await onCreatePluginShareProject(record.id, action, locale);
    setPendingShareAction(null);
    setShareConfirm(null);
    if (!outcome.ok) {
      setNotice({
        ok: false,
        message: outcome.message,
      });
    }
  }

  function requestPluginShareTask(
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) {
    if (action !== 'publish-github') return;
    setShareConfirm({ sourceRecord: record, action });
  }


  return (
    <section className="plugins-view" aria-labelledby="plugins-title">
      <header className="plugins-view__hero">
        <div>
          <p className="plugins-view__kicker">{t('entry.navPlugins')}</p>
          <h1 id="plugins-title" className="entry-section__title">
            {t('entry.navPlugins')}
          </h1>
          <p className="plugins-view__lede">
            {t('pluginsView.installedSubtitle')}
          </p>
        </div>
        <div className="plugins-view__hero-actions">
          <button
            type="button"
            className="plugins-view__primary"
            onClick={() => {
              trackPluginsTopClick(analytics.track, {
                page_name: 'plugins',
                area: 'plugins',
                element: 'create_plugin',
              });
              onCreatePlugin?.();
            }}
            data-testid="plugins-create-button"
          >
            <Icon name="edit" size={13} />
            <span>{t('homeHero.chip.createPlugin')}</span>
          </button>
          <button
            type="button"
            className="plugins-view__secondary"
            onClick={() => {
              trackPluginsTopClick(analytics.track, {
                page_name: 'plugins',
                area: 'plugins',
                element: 'import_plugin',
              });
              setImportOpen(true);
            }}
            aria-haspopup="dialog"
            data-testid="plugins-import-button"
          >
            <Icon name="plus" size={13} />
            <span>{t('pluginsView.importPlugin')}</span>
          </button>
          <div className="plugins-view__badge" aria-hidden="true">
            <Icon name="grid" size={15} />
            <span>{t('pluginsView.agentContext')}</span>
          </div>
        </div>
      </header>

      {notice ? <Notice outcome={notice} /> : null}

      <div className="plugins-view__gallery">
        {loading ? <div className="plugins-view__empty">{t('pluginsView.loading')}</div> : null}

        {!loading ? (
          <PluginsHomeSection
            plugins={userPlugins}
            loading={false}
            activePluginId={activePlugin?.record.id ?? null}
            pendingApplyId={pendingApplyId}
            pendingShareAction={pendingShareAction}
            onUse={(record, action) => {
              trackPluginsInstalledTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'installed_tab',
                element: action === 'use-with-query' ? 'templates_use_dropdown' : 'templates_use',
                template_id: record.id,
                template_type: record.sourceKind,
              });
              if (action === 'use-with-query') {
                trackPluginsTemplatesDropdownClick(analytics.track, {
                  page_name: 'plugins',
                  area: 'templates_dropdown',
                  element: 'use_with_query',
                  template_id: record.id,
                  template_type: record.sourceKind,
                });
              } else {
                trackPluginsTemplatesDropdownClick(analytics.track, {
                  page_name: 'plugins',
                  area: 'templates_dropdown',
                  element: 'use',
                  template_id: record.id,
                  template_type: record.sourceKind,
                });
              }
              void handleUsePlugin(record, action);
            }}
            onOpenDetails={(record) => {
              trackPluginsInstalledTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'installed_tab',
                element: 'templates_details',
                template_id: record.id,
                template_type: record.sourceKind,
              });
              setDetailsRecord(record);
            }}
            onPluginShareAction={(record, action) => {
              trackPluginsInstalledTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'installed_tab',
                element: action === 'publish-github' ? 'templates_publish' : 'templates_contribute',
                template_id: record.id,
                template_type: record.sourceKind,
              });
              requestPluginShareTask(record, action);
            }}
            preferDefaultFacet={false}
            title={t('pluginsView.installedTitle')}
            subtitle={t('pluginsView.installedSubtitle')}
            emptyMessage={t('pluginsView.installedEmpty')}
          />
        ) : null}


      </div>

      <AnimatePresence>
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            onClose={() => setDetailsRecord(null)}
            onUse={(record) => void handleUsePlugin(record, 'use')}
            isApplying={pendingApplyId === detailsRecord.id}
          />
        ) : null}
      </AnimatePresence>
      {shareConfirm ? (
        <PluginShareConfirmModal
          sourceRecord={shareConfirm.sourceRecord}
          action={shareConfirm.action}
          pending={
            pendingShareAction?.pluginId === shareConfirm.sourceRecord.id &&
            pendingShareAction.action === shareConfirm.action
          }
          onClose={() => {
            if (!pendingShareAction) setShareConfirm(null);
          }}
          onConfirm={() =>
            void handleCreatePluginShareTask(
              shareConfirm.sourceRecord,
              shareConfirm.action,
            )
          }
        />
      ) : null}
      {importOpen ? (
        <PluginImportModal
          onClose={() => setImportOpen(false)}
          onInstallSource={(source) => finishImport(() => installPluginSource(source))}
          onUploadZip={(file) => finishImport(() => uploadPluginZip(file))}
          onUploadFolder={(files) => finishImport(() => uploadPluginFolder(files))}
        />
      ) : null}
    </section>
  );
}

function PluginShareConfirmModal({
  sourceRecord,
  action,
  pending,
  onClose,
  onConfirm,
}: {
  sourceRecord: InstalledPluginRecord;
  action: PluginShareAction;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const details = PLUGIN_SHARE_DETAILS['publish-github'];
  const actionTitle = details.fallbackTitle;
  const actionDescription = details.fallbackDescription;
  const stagedPath = `plugin-source/${pluginShareSlug(sourceRecord.id)}`;

  return (
    <div
      className="plugin-details-modal-backdrop plugin-share-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={translateUi("ui.pluginsView.for2", { value1: actionTitle, value2: sourceRecord.title })}
      onClick={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
      data-testid="plugin-share-confirm-modal"
    >
      <div className="plugin-details-modal plugin-share-confirm__panel">
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2 className="plugin-details-modal__title">{actionTitle}</h2>
            </div>
            <div className="plugin-details-modal__meta">
              <span>{details.eyebrow}</span>
              <span>{translateUi('ui.pluginsView.for', { title: sourceRecord.title })}</span>
            </div>
          </div>
          <button
            type="button"
            className="plugin-details-modal__close"
            onClick={onClose}
            disabled={pending}
            aria-label={translateUi("ui.pluginsView.closeShareConfirmation")}
            title={translateUi("dictationClose")}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="plugin-details-modal__body">
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                {translateUi("ui.pluginsView.whatThisStarts")} </h3>
            </div>
            <p className="plugin-details-modal__description">
              {actionDescription}
            </p>
            <ol className="plugin-share-confirm__steps">
              {details.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                {translateUi("ui.pluginsView.sourcePlugin")} </h3>
            </div>
            <dl className="plugin-share-confirm__facts">
              <div>
                <dt>{translateUi("chat.designToolbox.kind.plugin")}</dt>
                <dd>{sourceRecord.title}</dd>
              </div>
              <div>
                <dt>{translateUi("ui.pluginsView.id")}</dt>
                <dd>
                  <code>{sourceRecord.id}</code>
                </dd>
              </div>
              <div>
                <dt>{translateUi("ui.pluginsView.copiedTo")}</dt>
                <dd>
                  <code>{stagedPath}</code>
                </dd>
              </div>
              <div>
                <dt>{translateUi("ui.pluginMetaSections.trust")}</dt>
                <dd>
                  <TrustBadge trust={sourceRecord.trust} />
                </dd>
              </div>
            </dl>
          </section>


        </div>

        <footer className="plugin-details-modal__foot">
          <button
            type="button"
            className="plugin-details-modal__secondary"
            onClick={onClose}
            disabled={pending}
          >
            {translateUi("dictationCancel")} </button>
          <button
            type="button"
            className="plugin-details-modal__primary"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending ? 'true' : undefined}
            data-testid="plugin-share-confirm-start"
          >
            {pending ? translateUi("pluginCard.starting") : details.confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function pluginShareSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/(^[-._]+|[-._]+$)/g, '') || 'open-design-plugin'
  );
}

function Notice({
  outcome,
}: {
  outcome: PluginInstallOutcome | { ok: boolean; message: string };
}) {
  const translateUi = usePixflowUiTranslation();
  const warnings = 'warnings' in outcome ? outcome.warnings : [];
  const log = 'log' in outcome ? outcome.log : [];
  return (
    <div className={`plugins-view__notice${outcome.ok ? ' is-success' : ' is-error'}`} role="status">
      <div>{outcome.message}</div>
      {warnings.length > 0 ? (
        <div className="plugins-view__notice-sub">
          {warnings.length}  {translateUi("ui.pluginsView.warning")}{warnings.length === 1 ? '' : 's'}
        </div>
      ) : null}
      {log.length > 0 ? (
        <details className="plugins-view__notice-log">
          <summary>{translateUi("ui.pluginsView.installLog")}</summary>
          <ul>
            {log.map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}


type ImportKind = 'github' | 'zip' | 'folder';

function PluginImportModal({
  onClose,
  onInstallSource,
  onUploadZip,
  onUploadFolder,
}: {
  onClose: () => void;
  onInstallSource: (source: string) => Promise<PluginInstallOutcome>;
  onUploadZip: (file: File) => Promise<PluginInstallOutcome>;
  onUploadFolder: (files: File[]) => Promise<PluginInstallOutcome>;
}) {
  const translateUi = usePixflowUiTranslation();
  const analytics = useAnalytics();
  const importModalViewFiredRef = useRef(false);
  useEffect(() => {
    if (importModalViewFiredRef.current) return;
    importModalViewFiredRef.current = true;
    trackPluginImportModalSurfaceView(analytics.track, {
      page_name: 'plugins',
      area: 'import_modal',
    });
  }, [analytics.track]);
  const [kind, setKind] = useState<ImportKind>('github');
  const [source, setSource] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);

  function selectKind(next: ImportKind) {
    trackPluginImportModalClick(analytics.track, {
      page_name: 'plugins',
      area: 'import_modal',
      element: 'source_tab',
      import_source: next,
    });
    setKind(next);
  }

  async function runImport() {
    trackPluginImportModalClick(analytics.track, {
      page_name: 'plugins',
      area: 'import_modal',
      element: 'import',
      import_source: kind,
    });
    setWorking(true);
    try {
      let outcome: PluginInstallOutcome | null = null;
      if (kind === 'github') {
        const trimmed = source.trim();
        if (trimmed) outcome = await onInstallSource(trimmed);
      } else if (kind === 'zip' && zipFile) {
        outcome = await onUploadZip(zipFile);
      } else if (kind === 'folder' && folderFiles.length > 0) {
        outcome = await onUploadFolder(folderFiles);
      }
      if (outcome) {
        trackPluginImportResult(analytics.track, {
          page_name: 'plugins',
          area: 'import_modal',
          import_source: kind,
          result: outcome.ok ? 'success' : 'failed',
          ...(outcome.ok ? {} : { error_code: outcome.message ?? 'unknown' }),
        });
      }
    } finally {
      setWorking(false);
    }
  }

  const canSubmit =
    (kind === 'github' && source.trim().length > 0) ||
    (kind === 'zip' && zipFile !== null) ||
    (kind === 'folder' && folderFiles.length > 0);

  return (
    <div className="plugins-import-modal__backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="plugins-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugins-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="plugins-import-modal__head">
          <div>
            <p className="plugins-view__kicker">{translateUi("ui.pluginsView.userPlugins")}</p>
            <h2 id="plugins-import-title">{translateUi("ui.pluginsView.importAPlugin")}</h2>
          </div>
          <button
            type="button"
            className="plugins-import-modal__close"
            onClick={onClose}
            aria-label={translateUi("ui.pluginsView.closeImportDialog")}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <nav className="plugins-import-modal__tabs" aria-label={translateUi("ui.pluginsView.importSource")}>
          <ImportChoice
            active={kind === 'github'}
            icon="github"
            title={translateUi("ui.pluginsView.fromGithub")}
            body="Install github:owner/repo paths."
            onClick={() => selectKind('github')}
          />
          <ImportChoice
            active={kind === 'zip'}
            icon="upload"
            title={translateUi("ui.pluginsView.uploadZip")}
            body="Upload a plugin archive."
            onClick={() => selectKind('zip')}
          />
          <ImportChoice
            active={kind === 'folder'}
            icon="folder"
            title={translateUi("ui.pluginsView.uploadFolder")}
            body="Upload a plugin directory."
            onClick={() => selectKind('folder')}
          />
        </nav>

        <div className="plugins-import-modal__body">
          {kind === 'github' ? (
            <div className="plugins-view__install-card">
              <label htmlFor="plugin-source">{translateUi("ui.pluginsView.githubArchiveOrMarketplaceSource")}</label>
              <div className="plugins-view__source-row">
                <input
                  id="plugin-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder={translateUi("ui.pluginsView.githubOwnerRepoMainPluginsMyPlugin")}
                  disabled={working}
                />
                <button
                  type="button"
                  className="plugins-view__primary"
                  onClick={runImport}
                  disabled={working || !canSubmit}
                >
                  {working ? translateUi("newproj.importingClaudeZip") : translateUi("pluginsHome.facet.import")}
                </button>
              </div>
              <div className="plugins-view__source-help">
                <TranslatedText id="ui.pluginsView.supports" values={{ github: <code>github:owner/repo[@ref][/subpath]</code>, tar: <code>.tar.gz</code>, tgz: <code>.tgz</code> }} /> </div>
            </div>
          ) : null}

          {kind === 'zip' ? (
            <FileImportPanel
              title={translateUi("ui.pluginsView.uploadZip")}
              body="Choose a .zip archive containing open-design.json, SKILL.md, or .claude-plugin/plugin.json."
              accept=".zip,application/zip"
              working={working}
              fileLabel={zipFile?.name ?? 'No zip selected'}
              onChange={(files) => setZipFile(files[0] ?? null)}
              onImport={runImport}
              canSubmit={canSubmit}
            />
          ) : null}

          {kind === 'folder' ? (
            <FileImportPanel
              title={translateUi("ui.pluginsView.uploadFolder")}
              body="Choose a plugin folder. Relative paths are preserved and installed into your user plugin registry."
              working={working}
              fileLabel={
                folderFiles.length > 0
                  ? `${folderFiles.length} file${folderFiles.length === 1 ? '' : 's'} selected`
                  : 'No folder selected'
              }
              folder
              onChange={setFolderFiles}
              onImport={runImport}
              canSubmit={canSubmit}
            />
          ) : null}

        </div>

        <footer className="plugins-import-modal__foot">
          <p>
            {translateUi("ui.pluginsView.importedPluginsAreUserPluginsAndAre")} </p>
          <button
            type="button"
            className="plugins-view__secondary"
            onClick={() => {
              trackPluginImportModalClick(analytics.track, {
                page_name: 'plugins',
                area: 'import_modal',
                element: 'cancel',
              });
              onClose();
            }}
          >
            {translateUi("dictationCancel")} </button>
        </footer>
      </section>
    </div>
  );
}

function ImportChoice({
  active,
  icon,
  title,
  body,
  onClick,
}: {
  active: boolean;
  icon: 'github' | 'upload' | 'folder';
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`plugins-import-modal__choice${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span className="plugins-import-modal__choice-icon" aria-hidden>
        <Icon name={icon} size={16} />
      </span>
      <span className="plugins-import-modal__choice-copy">
        <span>{title}</span>
        <span>{body}</span>
      </span>
    </button>
  );
}

function FileImportPanel({
  title,
  body,
  accept,
  working,
  fileLabel,
  folder,
  canSubmit,
  onChange,
  onImport,
}: {
  title: string;
  body: string;
  accept?: string;
  working: boolean;
  fileLabel: string;
  folder?: boolean;
  canSubmit: boolean;
  onChange: (files: File[]) => void;
  onImport: () => void;
}) {
  const translateUi = usePixflowUiTranslation();
  return (
    <section className="plugins-view__install-card">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <label className="plugins-import-modal__file">
        <input
          type="file"
          data-testid={folder ? 'plugins-folder-input' : 'plugins-zip-input'}
          {...(accept ? { accept } : {})}
          {...(folder ? { webkitdirectory: '', directory: '' } : {})}
          multiple={folder}
          disabled={working}
          onChange={(event) => onChange(Array.from(event.currentTarget.files ?? []))}
        />
        <span>{fileLabel}</span>
      </label>
      <button
        type="button"
        className="plugins-view__primary"
        onClick={onImport}
        disabled={working || !canSubmit}
      >
        {working ? translateUi("newproj.importingClaudeZip") : translateUi("pluginsHome.facet.import")}
      </button>
    </section>
  );
}
