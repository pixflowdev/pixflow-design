// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TranslatedText } from '../../src/i18n/TranslatedText';

vi.mock('../../src/i18n', () => ({ useT: () => () => '{second} puis {first} — <script>not executable</script>' }));
afterEach(cleanup);

it('allows translated sentences to reorder interactive content without parsing HTML', () => {
  const { container } = render(<TranslatedText id="settings.title" values={{ first: <a href="/help">Help</a>, second: <strong>Start</strong> }} />);
  expect(container.textContent).toBe('Start puis Help — <script>not executable</script>');
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe('/help');
  expect(container.firstElementChild?.tagName).toBe('STRONG');
});
