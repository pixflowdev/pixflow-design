import type { Dict } from '../i18n/types';
import type { WordPressMediaSurface, WordPressMediaModelChoice } from './wordpress-media-selection';

export function mediaModelQuestionText(
  surface: WordPressMediaSurface,
  choices: WordPressMediaModelChoice[],
  translate: (key: keyof Dict) => string,
): string {
  const title = translate(surface === 'image' ? 'ui.finalMediaPicker.imageTitle' : surface === 'video' ? 'ui.finalMediaPicker.videoTitle' : 'ui.finalMediaPicker.audioTitle');
  const submitLabel = translate(surface === 'image' ? 'ui.finalMediaPicker.imageSubmit' : surface === 'video' ? 'ui.finalMediaPicker.videoSubmit' : 'ui.finalMediaPicker.audioSubmit');
  return [
    '<question-form id="media-model">',
    JSON.stringify({
      title,
      description: translate('ui.finalMediaPicker.providerDescription'),
      submitLabel,
      questions: [{
        id: 'model',
        label: translate('ui.finalMediaPicker.model'),
        type: 'radio',
        required: true,
        options: choices.map((choice) => ({
          label: choice.label,
          value: choice.value,
          ...(choice.description ? { description: choice.description } : {}),
        })),
      }],
    }),
    '</question-form>',
  ].join('\n');
}
