
import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@open-design/components';
import { IconChevronUp, IconCornerDownLeft } from '@tabler/icons-react';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { DictationControl } from './DictationControl';
import { findFirstQuestionForm, formatFormAnswers, formOptionValueForLabel, type FormQuestion, type QuestionForm } from '../artifacts/question-form';
import styles from './QuestionRequestCard.module.css';

type Answers = Record<string, string | string[]>;
interface Props {
  form: QuestionForm;
  occurrenceKey: string;
  disabled?: boolean;
  reopenToken?: object | null;
  onOpenDictationSettings?: () => void;
  onSubmit: (text: string, answers: Answers) => void | boolean | Promise<void | boolean>;
}

/** Only the latest assistant turn can own an unanswered request. A later user
 * message supersedes it even when that message is not a structured answer. */
export function latestQuestionRequest(messages: readonly { id?: string; role?: string; content?: string }[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role === 'user') return null;
    if (message.role !== 'assistant') continue;
    const found = findFirstQuestionForm(message.content || '');
    if (found) return { form: found.form, messageId: message.id || `question-${index}` };
  }
  return null;
}

function optionsFor(question: FormQuestion) {
  return question.type === 'direction-cards'
    ? (question.cards || []).map(card => ({ value: card.id, label: card.label, description: card.mood, card }))
    : (question.options || []).map(option => ({ ...option, card: undefined }));
}

function initialAnswers(form: QuestionForm): Answers {
  return Object.fromEntries(form.questions.map(question => {
    const value = question.defaultValue ?? (question.type === 'checkbox' ? [] : optionsFor(question)[0]?.value ?? '');
    return [question.id, Array.isArray(value)
      ? value.map(entry => formOptionValueForLabel(question, entry))
      : formOptionValueForLabel(question, value)];
  }));
}

function readDraft(key: string): { answers: Answers; index: number } | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) || 'null');
    return draft && typeof draft.answers === 'object' && draft.answers !== null
      && Object.values(draft.answers).every(value => typeof value === 'string' || (Array.isArray(value) && value.every(entry => typeof entry === 'string')))
      && Number.isInteger(draft.index) ? draft : null;
  } catch { return null; }
}

/** Provider-independent request card. Choosing a single option advances; no
 * default, timer, focus change or dismissal ever submits an answer by itself. */
export function QuestionRequestCard(props: Props) {
  return <RequestCard key={props.occurrenceKey} {...props} />;
}

function RequestCard({ form, occurrenceKey, disabled = false, reopenToken, onOpenDictationSettings, onSubmit }: Props) {
  const translateUi = usePixflowUiTranslation();
  const t = useT();
  const storageKey = `pixflow:question:${occurrenceKey}`;
  const [draft] = useState(() => readDraft(storageKey));
  const [answers, setAnswers] = useState<Answers>(() => ({ ...initialAnswers(form), ...draft?.answers }));
  const [index, setIndex] = useState(() => Math.max(0, Math.min(draft?.index ?? 0, form.questions.length - 1)));
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const submitting = useRef(false);
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const question = form.questions[index];
  const options = question ? optionsFor(question) : [];
  const multiple = question?.type === 'checkbox';
  const value = question ? answers[question.id] ?? (multiple ? [] : options[0]?.value ?? '') : '';
  const custom = Array.isArray(value)
    ? value.filter(entry => !options.some(option => option.value === entry)).join(', ')
    : !options.some(option => option.value === value) ? value : '';
  const last = index === form.questions.length - 1;
  const locked = disabled || busy || sent;
  const customAtLimit = multiple && !custom && question?.maxSelections !== undefined && Array.isArray(value) && value.length >= question.maxSelections;

  useEffect(() => { if (reopenToken) setCollapsed(false); }, [reopenToken]);
  useEffect(() => {
    const active = document.activeElement;
    if (!disabled && (!active || active === document.body || (active.matches('[contenteditable="true"]') && !active.textContent?.trim()))) root.current?.focus({ preventScroll: true });
  }, [disabled]);
  useEffect(() => {
    setAnswers(current => ({ ...initialAnswers(form), ...current }));
  }, [form]);

  useEffect(() => {
    if (sent) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ answers, index })); } catch { /* Storage is optional. */ }
  }, [answers, index, sent, storageKey]);

  function update(value: string | string[]) {
    if (!question || locked) return answers;
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    setError(false);
    return next;
  }

  function updateCustom(text: string) {
    if (!multiple) return update(text);
    const selected = Array.isArray(value) ? value.filter(entry => options.some(option => option.value === entry)) : [];
    if (text.trim() && question?.maxSelections !== undefined && selected.length >= question.maxSelections) return answers;
    return update(text.trim() ? [...selected, text] : selected);
  }

  async function advance(next = answers) {
    if (!question || locked || submitting.current) return;
    const answer = next[question.id];
    if (question.required && (Array.isArray(answer) ? !answer.length : !answer?.trim())) return;
    if (!last) { setIndex(index + 1); root.current?.focus(); return; }
    const missing = form.questions.findIndex(q => q.required && (Array.isArray(next[q.id]) ? !next[q.id]?.length : !String(next[q.id] || '').trim()));
    if (missing >= 0) { setIndex(missing); return; }
    submitting.current = true;
    setBusy(true);
    setError(false);
    try {
      const accepted = await onSubmit(formatFormAnswers(form, next), next);
      if (accepted === false) throw new Error(translateUi("ui.questionRequestCard.feedback80"));
      setSent(true);
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
    } catch { setError(true); } finally { submitting.current = false; setBusy(false); }
  }

  function choose(option: string) {
    if (locked || !question) return;
    if (multiple) {
      const selected = Array.isArray(value) ? value : [];
      if (!selected.includes(option) && question.maxSelections !== undefined && selected.length >= question.maxSelections) return;
      update(selected.includes(option) ? selected.filter(entry => entry !== option) : [...selected, option]);
    } else { void advance(update(option)); }
  }

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing || event.defaultPrevented || locked || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); setCollapsed(true); return; }
    if ((event.target as HTMLElement).closest('textarea, input')) return;
    if (event.key >= '1' && event.key <= '9' && options[Number(event.key) - 1]) {
      event.preventDefault(); choose(options[Number(event.key) - 1]!.value);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); setIndex(Math.max(0, Math.min(index + (event.key === 'ArrowRight' ? 1 : -1), form.questions.length - 1)));
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const selected = options.findIndex(option => option.value === value);
      const next = selected + (event.key === 'ArrowDown' ? 1 : -1);
      if (next >= options.length) input.current?.focus();
      else if (!multiple && options[Math.max(0, next)]) { update(options[Math.max(0, next)]!.value); root.current?.focus(); }
    } else if (event.key === 'Enter' && !(event.target as HTMLElement).closest('button')) {
      event.preventDefault(); void advance();
    }
  }

  if (!question || sent) return null;
  if (collapsed) return <div className={styles.dock}><Button className={styles.reopen} variant="ghost" onClick={() => setCollapsed(false)}><Icon name="help-circle" size={16} /><span>{question.label}</span><IconChevronUp size={14} /></Button></div>;
  const hasAnswer = multiple ? Array.isArray(value) && value.length > 0 : options.length ? custom.trim().length > 0 : String(value).trim().length > 0;
  return <section ref={root} tabIndex={0} className={styles.card} aria-labelledby={titleId} aria-busy={busy} data-testid="question-request-card" onKeyDown={handleKey}>
    <header className={styles.header}>
      <h3 id={titleId}>{question.label}</h3>
      <div className={styles.navigation}>
        {form.questions.length > 1 && <>
          <Button variant="ghost" size="icon" aria-label={t('request.previous')} disabled={index === 0 || busy} onClick={() => setIndex(index - 1)}><Icon name="chevron-left" size={15} /></Button>
          <span aria-live="polite">{index + 1} / {form.questions.length}</span>
          <Button variant="ghost" size="icon" aria-label={t('request.next')} disabled={last || busy} onClick={() => setIndex(index + 1)}><Icon name="chevron-right" size={15} /></Button>
        </>}
        <Button variant="ghost" size="icon" aria-label={t('request.minimize')} onClick={() => setCollapsed(true)}><Icon name="chevron-down" size={15} /></Button>
      </div>
    </header>
    {question.help && <p className={styles.help}>{question.help}</p>}
    <div className={styles.body}>
      {options.length > 0 && <div role={multiple ? 'group' : 'radiogroup'} aria-labelledby={titleId} className={styles.options}>
        {options.map((option, position) => {
          const selected = multiple ? Array.isArray(value) && value.includes(option.value) : value === option.value;
          const maxed = multiple && !selected && question.maxSelections !== undefined && Array.isArray(value) && value.length >= question.maxSelections;
          const recommended = option.label.endsWith(' (Recommended)');
          return <Button key={option.value} variant="ghost" className={styles.option} role={multiple ? 'checkbox' : 'radio'} aria-checked={selected} aria-label={option.label} disabled={locked || maxed} onClick={() => choose(option.value)}>
            <span className={multiple ? styles.checkbox : styles.number} aria-hidden="true">{multiple ? selected && <Icon name="check" size={12} /> : position + 1}</span>
            <span className={styles.copy}><span className={styles.optionTitle}>{recommended ? option.label.slice(0, -14) : option.label}{recommended && <span className={styles.recommended}>{t('request.recommended')}</span>}</span>
              {option.description && <span className={styles.description}>{option.description}</span>}
              {option.card && <span className={styles.swatches} aria-hidden="true">{option.card.palette.map((color, i) => <span key={i} style={{ backgroundColor: color }} />)}</span>}
            </span>
            {!multiple && <IconCornerDownLeft className={styles.enter} size={15} />}
          </Button>;
        })}
      </div>}
      <div className={styles.footer}>
        {(!options.length || question.allowCustom !== false) && <textarea ref={input} className={styles.input} rows={1} aria-label={options.length ? t('request.other') : question.label} aria-required={!options.length && question.required} placeholder={question.customPlaceholder || question.placeholder || (options.length ? t('request.other') : t('request.type'))} disabled={locked || customAtLimit} value={options.length ? custom : String(value)} onFocus={() => { if (!multiple && options.length && !custom) update(''); }} onChange={event => updateCustom(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void advance(); }
        }} />}
        {!locked && !customAtLimit && question.allowCustom !== false && onOpenDictationSettings && <DictationControl
          contextKey={occurrenceKey + ':' + question.id}
          onOpenSettings={onOpenDictationSettings}
          onTranscript={text => { updateCustom(custom.trim() ? `${custom.trim()} ${text}` : text); input.current?.focus(); }}
        />}
        <Button className={hasAnswer ? styles.submit : styles.skip} disabled={locked || (!hasAnswer && !!question.required)} onClick={() => { void advance(hasAnswer ? answers : update(multiple ? [] : '')); }}>
          {busy ? <Icon name="spinner" className="icon-spin" size={15} /> : hasAnswer ? last ? t('request.submit') : t('request.nextShort') : t('request.skip')}
        </Button>
      </div>
      {error && <p role="alert" className={styles.help}>{t('request.error')}</p>}
    </div>
  </section>;
}
