import { describe, expect, it } from 'vitest';
import { findFirstQuestionForm } from '../../src/artifacts/question-form';
import type { Dict } from '../../src/i18n/types';
import { mediaModelQuestionText } from '../../src/media/wordpress-media-question';

describe('localized WordPress media questions', () => {
  it.each(['image', 'video', 'audio'] as const)('round-trips %s labels through the real question parser', (surface) => {
    const translate = (key: keyof Dict) => `Élément "${key}" & l’utilisateur <choix>`;
    const choice = { providerId: 'openai', model: 'gpt-image-2', label: 'OpenAI / gpt-image-2', value: 'openai:gpt-image-2', description: 'Existing provider description' };
    const source = mediaModelQuestionText(surface, [choice], translate);
    const parsed = findFirstQuestionForm(source)?.form;
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe(translate(`ui.finalMediaPicker.${surface}Title`));
    expect(parsed?.description).toBe(translate('ui.finalMediaPicker.providerDescription'));
    expect(parsed?.submitLabel).toBe(translate(`ui.finalMediaPicker.${surface}Submit`));
    expect(parsed?.id).toBe('media-model');
    expect(parsed?.questions[0]).toEqual({
      id: 'model', label: translate('ui.finalMediaPicker.model'), type: 'radio', required: true,
      options: [{ label: choice.label, value: choice.value, description: choice.description }],
    });
  });
});
