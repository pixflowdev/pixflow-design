// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { preloadTestLocale } from '../helpers/preload-locale';

import { SessionModeToggle } from '../../src/components/SessionModeToggle';
import { I18nProvider } from '../../src/i18n';
import { setChangeReviewDisabled } from '../../src/pixflow/change-review-preference';

afterEach(() => { cleanup(); setChangeReviewDisabled(false); });

describe('SessionModeToggle', () => {
  it('offers Disable change review off by default and retains the choice when reopened', () => {
    render(<SessionModeToggle preferencesOnly mode="chat" />);
    fireEvent.click(screen.getByRole('button', { name: 'Design styling' }));
    const toggle = screen.getByRole('switch', { name: 'Disable change review' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle); expect(toggle.checked).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Design styling' }));
    expect((screen.getByRole('switch', { name: 'Disable change review' }) as HTMLInputElement).checked).toBe(true);
  });
  it('shows design preferences without execution modes in the unified panel', () => {
    const onChange = vi.fn();
    render(<SessionModeToggle preferencesOnly mode="chat" onChange={onChange} menuExtra={<button>Design polish</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Design styling' }));
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Design polish' })).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('opens outside a clipped floating panel and keeps menu interactions inside', () => {
    const onChange = vi.fn();
    const view = render(<div className="pixflow-bricks-agent-shell" style={{ overflow: 'hidden' }}><SessionModeToggle mode="design" onChange={onChange} menuExtra={<button role="menuitemcheckbox">Guidance</button>} /></div>);
    const trigger = screen.getByTestId('session-mode-trigger');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(view.container.contains(menu)).toBe(false);
    expect(menu.closest('.pixflow-bricks-agent-portal-root')).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole('menuitemcheckbox'));
    expect(screen.queryByRole('menu')).not.toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Plan mode/i }));
    expect(onChange).toHaveBeenCalledWith('plan');
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('shows only the active mode until the menu is opened', () => {
    render(<SessionModeToggle mode="design" onChange={vi.fn()} />);

    expect(screen.getByTestId('session-mode-trigger').textContent).toContain('Design');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByTestId('session-mode-trigger'));

    expect(screen.getByRole('menuitemradio', { name: /Design mode/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: /Plan mode/i }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('menuitemradio', { name: /Ask mode/i }).getAttribute('aria-checked')).toBe('false');
  });

  it('switches to document-first Plan mode without resetting the conversation', () => {
    const onChange = vi.fn();
    render(<SessionModeToggle mode="design" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('session-mode-trigger'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Plan mode/i }));

    expect(onChange).toHaveBeenCalledWith('plan');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('switches mode from the menu', () => {
    const onChange = vi.fn();
    render(<SessionModeToggle mode="design" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('session-mode-trigger'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Ask mode/i }));

    expect(onChange).toHaveBeenCalledWith('chat');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows localized guidance only after opening the menu', () => {
    render(
      <I18nProvider initial="zh-CN">
        <SessionModeToggle mode="chat" onChange={vi.fn()} />
      </I18nProvider>,
    );

    const trigger = screen.getByTestId('session-mode-trigger');
    fireEvent.pointerEnter(trigger);

    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole('tooltip').textContent).toContain('Ask 模式');
    expect(screen.getByRole('tooltip').textContent).toContain('总结这份稿子，并指出还缺什么。');

    const designOption = screen.getByRole('menuitemradio', { name: /设计模式/i });
    fireEvent.pointerEnter(designOption);

    const menu = screen.getByRole('menu');
    const card = screen.getByRole('tooltip');
    expect(menu.textContent).not.toContain('适合创建或修改具体设计产物');
    expect(card.textContent).toContain('适合创建或修改具体设计产物');
    expect(card.textContent).toContain('图片、视频、HyperFrames、音频');
    expect(card.textContent).toContain('为这次 campaign 生成图片、视频和音频创意。');
  });
});


describe('workspace composer positioning', () => {
  it('portals the styling menu out of clipped chat content and clamps it above a right-edge trigger', () => {
    const view = render(<div className="workspace-shell"><div data-testid="clipped-chat" style={{ overflow:'hidden' }}><SessionModeToggle preferencesOnly mode="chat" /></div></div>);
    const trigger = screen.getByTestId('session-mode-trigger');
    trigger.getBoundingClientRect = () => ({ left:1000, right:1024, top:700, bottom:724, width:24, height:24, x:1000, y:700, toJSON:()=>({}) });
    trigger.style.setProperty('--text', '#e8e4dc');
    fireEvent.click(trigger);
    const popup = screen.getByRole('menu').parentElement!;
    expect(screen.getByTestId('clipped-chat').contains(popup)).toBe(false);
    expect(view.container.contains(popup)).toBe(true);
    expect(popup.style.position).toBe('fixed');
    expect(popup.style.top).toBe('auto');
    expect(parseFloat(popup.style.left)).toBeLessThanOrEqual(window.innerWidth - 304 - 12);
  });
});

// Downloadable locales are installed explicitly by localized rendering fixtures.
beforeAll(async () => { await preloadTestLocale('zh-CN'); });
