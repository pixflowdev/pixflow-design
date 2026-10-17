// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionRequestCard, latestQuestionRequest } from '../../src/components/QuestionRequestCard';
import { questionAnswerDisplayText, type QuestionForm } from '../../src/artifacts/question-form';
const form: QuestionForm = { id: 'brief', title: 'Quick brief', questions: [
  { id: 'tone', label: 'Which direction?', type: 'radio', options: [
    { value: 'quiet', label: 'Quiet (Recommended)', description: 'A restrained layout' },
    { value: 'bold', label: 'Bold', description: 'Strong type and contrast' },
  ] },
  { id: 'name', label: 'What name?', type: 'text', required: true },
] };
afterEach(() => { cleanup(); sessionStorage.clear(); });
function mount(custom = form, submit = vi.fn()) {
  return { submit, ...render(<QuestionRequestCard form={custom} occurrenceKey="test" onSubmit={submit} />) };
}
describe('composer question requests', () => {
  it('shows one question and descriptions without submitting the default', () => {
    const { submit } = mount();
    expect(screen.getByRole('radio', { name: 'Quiet (Recommended)' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('A restrained layout')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'What name?' })).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
  it('advances on a choice, preserves navigation and submits once', async () => {
    const { submit } = mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Bold' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'What name?' }), { target: { value: 'Studio North' } });
    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(screen.getByRole('radio', { name: 'Bold' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Studio North');
    const send = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(send); fireEvent.click(send);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[1]).toEqual({ tone: 'bold', name: 'Studio North' });
  });
  it('accepts a custom answer instead of the choices with Enter', () => {
    const { submit } = mount({ ...form, questions: [form.questions[0]!] });
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Warm editorial' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submit.mock.calls[0]?.[1]).toEqual({ tone: 'Warm editorial' });
  });
  it('supports numeric choices without stealing text or IME input', () => {
    const { submit } = mount();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: '2' });
    expect(screen.getByRole('heading', { name: 'Which direction?' })).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('question-request-card'), { key: '2', isComposing: true });
    expect(screen.getByRole('heading', { name: 'Which direction?' })).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('question-request-card'), { key: '2' });
    expect(screen.getByRole('heading', { name: 'What name?' })).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });
  it('minimises and restores a draft without answering', () => {
    const { submit, unmount } = mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Bold' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Saved draft' } });
    fireEvent.keyDown(screen.getByTestId('question-request-card'), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'What name?' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Saved draft');
    unmount(); mount();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Saved draft');
  });
  it('enforces checkbox limits without advancing on each choice', () => {
    const { submit } = mount({ ...form, questions: [{ ...form.questions[0]!, type: 'checkbox', maxSelections: 1 }] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
    expect((screen.getByRole('checkbox', { name: 'Quiet (Recommended)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(submit.mock.calls[0]?.[1]).toEqual({ tone: ['bold'] });
  });
  it('blocks required blanks and busy providers', () => {
    const { submit, rerender } = mount({ ...form, questions: [form.questions[1]!] });
    expect((screen.getByRole('button', { name: 'Skip' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<QuestionRequestCard form={form} occurrenceKey="busy" onSubmit={submit} disabled />);
    fireEvent.click(screen.getByRole('radio', { name: 'Bold' }));
    expect(submit).not.toHaveBeenCalled();
  });
  it('keeps selected options when adding a custom multi-select answer', () => {
    const { submit } = mount({ ...form, questions: [{ ...form.questions[0]!, type: 'checkbox', maxSelections: 2 }] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Playful' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(submit.mock.calls[0]?.[1]).toEqual({ tone: ['bold', 'Playful'] });
  });
  it('retains answers and permits retry after failed delivery', async () => {
    const submit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mount({ ...form, questions: [form.questions[0]!] }, submit);
    fireEvent.click(screen.getByRole('radio', { name: 'Bold' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('radio', { name: 'Bold' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Bold' }));
    await waitFor(() => expect(screen.queryByTestId('question-request-card')).toBeNull());
    expect(submit).toHaveBeenCalledTimes(2);
  });
  it('skips only the current optional question', () => {
    const { submit } = mount({ ...form, questions: [form.questions[0]!, { ...form.questions[1]!, required: false }] });
    fireEvent.click(screen.getByRole('radio', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(submit.mock.calls[0]?.[1]).toEqual({ tone: 'bold', name: '' });
  });
  it('never reopens an old request after a later user message', () => {
    const request = { id: 'assistant', role: 'assistant', content: `<question-form>${JSON.stringify(form)}</question-form>` };
    expect(latestQuestionRequest([request])?.form.id).toBe('brief');
    expect(latestQuestionRequest([request, { role: 'user', content: 'Carry on' }])).toBeNull();
  });
  it('moves the highlighted choice with arrows and confirms it with Enter', () => {
    const { submit } = mount({ ...form, questions: [form.questions[0]!] });
    fireEvent.keyDown(screen.getByTestId('question-request-card'), { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: 'Bold' }).getAttribute('aria-checked')).toBe('true');
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('question-request-card'), { key: 'Enter' });
    expect(submit.mock.calls[0]?.[1]).toEqual({ tone: 'bold' });
  });
  it('hides only the structured answer transport header in chat', () => {
    expect(questionAnswerDisplayText('[form answers — brief]\n- Direction: Quiet')).toBe('- Direction: Quiet');
    expect(questionAnswerDisplayText('Explain [form answers — brief] please')).toBe('Explain [form answers — brief] please');
  });
});
