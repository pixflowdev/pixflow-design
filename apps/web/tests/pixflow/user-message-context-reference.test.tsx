/* @vitest-environment jsdom */
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UserMessageReferences } from '../../src/components/chat/UserMessageReferences';
import { formatContextAttachment } from '../../src/components/composer/context-attachment';
afterEach(cleanup);
it('shows multiple Sitemap references as badges while retaining the saved agent payload', () => {
  const first = formatContextAttachment({label:'Sitemap page: Guides',content:JSON.stringify({nodeId:'guides',description:'Private structured context'})});
  const second = formatContextAttachment({label:'Sitemap page: Resources',content:'resources'});
  const content = `${first} ${second} Compare these pages.`;
  const {container} = render(<UserMessageReferences content={content}/>);
  expect(screen.getByText('Sitemap page: Guides').closest('[data-slot="badge"]')).not.toBeNull();
  expect(screen.getByText('Sitemap page: Resources').closest('[data-slot="badge"]')).not.toBeNull();
  expect(container.textContent).toContain('Compare these pages.');
  expect(container.textContent).not.toContain('Private structured context');
  expect(container.textContent).not.toContain('[Pixflow context attachment]');
  expect(content).toContain('Private structured context');
});
