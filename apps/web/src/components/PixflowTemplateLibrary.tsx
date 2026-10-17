import { useT as usePixflowUiTranslation } from '../i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import {
  fetchPixflowTemplateDetail,
  fetchPixflowTemplates,
  insertPixflowTemplate,
  type PixflowTemplateDetail,
  type PixflowTemplateSummary,
} from '../pixflow/templates';

type Props = {
  open: boolean;
  onClose: () => void;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type InsertState = 'idle' | 'loading' | 'done' | 'error';

function tagText(template: PixflowTemplateSummary): string {
  return template.sectionType || template.templateRole || template.pageTypes[0] || 'Template';
}

export function PixflowTemplateLibrary({ open, onClose }: Props) {
  const translateUi = usePixflowUiTranslation();
  const [templates, setTemplates] = useState<PixflowTemplateSummary[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<PixflowTemplateDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [insertState, setInsertState] = useState<InsertState>('idle');
  const [message, setMessage] = useState('');
  const [renameClass, setRenameClass] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);

  const reload = useCallback(async () => {
    setLoadState('loading');
    setMessage('');
    const response = await fetchPixflowTemplates();
    if (response.ok) {
      const nextTemplates = response.templates ?? [];
      setTemplates(nextTemplates);
      setSelectedId((current) => current ?? nextTemplates[0]?.id ?? null);
      setLoadState('ready');
      return;
    }
    setMessage(response.message || translateUi("ui.pixflowTemplateLibrary.feedback67"));
    setLoadState('error');
  }, [translateUi]);

  useEffect(() => {
    if (!open || loadState !== 'idle') return;
    void reload();
  }, [loadState, open, reload]);

  useEffect(() => {
    if (!open || !selectedId) {
      setSelected(null);
      return;
    }

    let cancelled = false;
    setDetailState('loading');
    setInsertState('idle');
    setMessage('');
    void fetchPixflowTemplateDetail(selectedId).then((response) => {
      if (cancelled) return;
      if (response.ok && response.template) {
        setSelected(response.template);
        setDetailState('ready');
      } else {
        setSelected(null);
        setMessage(response.message || translateUi("ui.pixflowTemplateLibrary.feedback68"));
        setDetailState('error');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, selectedId]);

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((template) => {
      const haystack = [
        template.title,
        template.selectionBlurb,
        template.sectionType,
        template.templateRole,
        ...template.tags,
        ...template.pageTypes,
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, templates]);

  const handleInsert = useCallback(async () => {
    if (!selectedId || insertState === 'loading') return;
    setInsertState('loading');
    setMessage('');
    const response = await insertPixflowTemplate({
      templateId: selectedId,
      renameClass,
      replaceExisting,
    });
    if (response.ok) {
      setInsertState('done');
      setMessage(translateUi("ui.pixflowTemplateLibrary.templateInsertedReloadingTheBuilderView"));
      // Pixflow-owned: first library pass uses a deterministic builder refresh
      // instead of the old fragile live Bricks Vue mutation layer.
      window.parent.postMessage({
        source: 'pixflow-design',
        type: 'pixflow-design:template-inserted',
      }, '*');
      return;
    }
    setInsertState('error');
    setMessage(response.message || translateUi("ui.pixflowTemplateLibrary.feedback69"));
  }, [translateUi, insertState, renameClass, replaceExisting, selectedId]);

  if (!open) return null;

  return (
    <div className="pixflow-template-library-backdrop" role="presentation">
      <section
        className="pixflow-template-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pixflow-template-library-title"
      >
        <header className="pixflow-template-library__head">
          <div>
            <p className="pixflow-template-library__eyebrow">{translateUi("ui.pixflowTemplateLibrary.pixflow")}</p>
            <h2 id="pixflow-template-library-title">{translateUi("ui.pixflowTemplateLibrary.templateLibrary")}</h2>
          </div>
          <button className="pixflow-template-library__icon-button" type="button" onClick={onClose} aria-label={translateUi("dictationClose")}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="pixflow-template-library__toolbar">
          <label className="pixflow-template-library__search">
            <Icon name="search" size={14} />
            <input
              autoComplete="off"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              data-lpignore="true"
              name="pixflow-template-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translateUi("ui.pixflowTemplateLibrary.searchTemplates")}
              type="search"
            />
          </label>
          <button className="pixflow-template-library__secondary" type="button" onClick={() => void reload()}>
            <Icon name="refresh" size={14} />
            {translateUi("designFiles.refresh")} </button>
        </div>

        <div className="pixflow-template-library__body">
          <aside className="pixflow-template-library__grid" aria-label={translateUi("entry.tabTemplates")}>
            {loadState === 'loading' ? (
              <div className="pixflow-template-library__empty">{translateUi("ui.pixflowTemplateLibrary.loadingTemplates")}</div>
            ) : null}
            {loadState === 'error' ? (
              <div className="pixflow-template-library__empty">{message}</div>
            ) : null}
            {loadState !== 'loading' && filteredTemplates.length === 0 ? (
              <div className="pixflow-template-library__empty">{translateUi("ui.pixflowTemplateLibrary.noTemplatesFound")}</div>
            ) : null}
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                className={`pixflow-template-card${selectedId === template.id ? ' is-active' : ''}`}
                type="button"
                onClick={() => setSelectedId(template.id)}
              >
                <div className="pixflow-template-card__preview">
                  {template.thumbnailUrl ? <img src={template.thumbnailUrl} alt="" /> : <Icon name="image" size={22} />}
                </div>
                <div className="pixflow-template-card__content">
                  <span>{tagText(template)}</span>
                  <strong>{template.title || translateUi("ui.pixflowTemplateLibrary.template", { value1: template.id })}</strong>
                </div>
              </button>
            ))}
          </aside>

          <main className="pixflow-template-library__detail">
            {detailState === 'loading' ? (
              <div className="pixflow-template-library__empty">{translateUi("ui.pixflowTemplateLibrary.loadingTemplate")}</div>
            ) : null}
            {selected && detailState === 'ready' ? (
              <>
                <div className="pixflow-template-library__preview">
                  {selected.thumbnailUrl ? <img src={selected.thumbnailUrl} alt="" /> : <Icon name="image" size={34} />}
                </div>
                <div className="pixflow-template-library__detail-copy">
                  <span>{tagText(selected)}</span>
                  <h3>{selected.title}</h3>
                  <p>{selected.selectionBlurb || translateUi("ui.pixflowTemplateLibrary.pixflowTemplateReadyForThisPage")}</p>
                </div>
                <div className="pixflow-template-library__options">
                  <label>
                    {translateUi("ui.pixflowTemplateLibrary.renameMainClass")} <input
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      data-lpignore="true"
                      name="pixflow-template-class-rename"
                      value={renameClass}
                      onChange={(event) => setRenameClass(event.target.value)}
                      placeholder={translateUi("ui.pixflowTemplateLibrary.optionalClassName")}
                    />
                  </label>
                  <label className="pixflow-template-library__checkbox">
                    <input
                      checked={replaceExisting}
                      onChange={(event) => setReplaceExisting(event.target.checked)}
                      type="checkbox"
                    />
                    {translateUi("ui.pixflowTemplateLibrary.replaceExistingPageContent")} </label>
                </div>
                <footer className="pixflow-template-library__footer">
                  <span className={`pixflow-template-library__message is-${insertState}`}>{message}</span>
                  <button
                    className="pixflow-template-library__primary"
                    type="button"
                    onClick={() => void handleInsert()}
                    disabled={insertState === 'loading'}
                  >
                    <Icon name={insertState === 'loading' ? 'spinner' : 'import'} size={14} />
                    {insertState === 'loading' ? translateUi("ui.pixflowTemplateLibrary.inserting") : translateUi("ui.pixflowTemplateLibrary.insert")}
                  </button>
                </footer>
              </>
            ) : null}
          </main>
        </div>
      </section>
    </div>
  );
}
