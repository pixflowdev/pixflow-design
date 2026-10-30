// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { en } from '../../src/i18n/locales/en';
vi.mock('../../src/providers/daemon', () => ({ codexUsageRequest: vi.fn() }));
vi.mock('../../src/i18n', () => ({ useI18n: () => ({ locale: 'en', t: (key: keyof typeof en, vars: Record<string, string> = {}) => Object.entries(vars).reduce((text, [key, value]) => text.replace(`{${key}}`, value), en[key]) }) }));
import { codexUsageRequest } from '../../src/providers/daemon';
import { CodexUsageIndicator } from '../../src/components/CodexUsageIndicator';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const data = { status: 'available' as const, source: 'desktop' as const, checkedAt: '2026-10-30T00:00:00Z', windows: [{ bucket: 'codex', durationMinutes: 10080, remainingPercent: 19, resetsAt: 1793784989 }] };

test('ring reflects the lowest remaining window and hover shows all reported limits', async () => {
 vi.mocked(codexUsageRequest).mockResolvedValue({...data, windows:[...data.windows,{...data.windows[0]!,durationMinutes:300,remainingPercent:60}]});
 render(<CodexUsageIndicator />);
 const button=await screen.findByRole('button',{name:/19% remaining/});
 expect(button.querySelector('[stroke-dashoffset]')?.getAttribute('stroke-dashoffset')).toBe('81');
 fireEvent.mouseEnter(button);
 expect(screen.getByRole('tooltip').parentElement?.classList.contains('pixflow-design-portal-scope')).toBe(true);
 expect(screen.getByRole('tooltip').textContent).toContain('5 hours');
 expect(screen.getByRole('tooltip').textContent).toContain('7 days');
 expect(screen.getByRole('tooltip').textContent).toContain('Resets');
 fireEvent.mouseLeave(button);expect(screen.queryByRole('tooltip')).toBeNull();
});
test('click opens details, refreshes, supports recovery and Escape restores focus', async () => {
 vi.mocked(codexUsageRequest).mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(data);
 render(<CodexUsageIndicator />);
 const button=await screen.findByRole('button',{name:/19% remaining/});fireEvent.click(button);
 const dialog=screen.getByRole('dialog');
 await screen.findByText('Unavailable');expect(dialog.querySelector('progress')).toBeNull();
 expect(button.querySelector('[stroke-dashoffset]')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByText('19% remaining');
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(button);
});
test('zero remains an empty real ring, outside click dismisses details', async () => {
 vi.mocked(codexUsageRequest).mockResolvedValue({...data, windows:[{...data.windows[0]!,remainingPercent:0}]});render(<CodexUsageIndicator />);
 const button=await screen.findByRole('button',{name:/0% remaining/});expect(button.querySelector('[stroke-dashoffset]')?.getAttribute('stroke-dashoffset')).toBe('100');
 fireEvent.click(button);await screen.findByText('0% remaining');fireEvent.mouseDown(document.body);expect(screen.queryByRole('dialog')).toBeNull();
});

test('Escape is consumed by the usage menu before the host floating panel', async () => {
 vi.mocked(codexUsageRequest).mockResolvedValue(data);
 const hostClose=vi.fn();
 document.addEventListener('keydown',hostClose);
 try {
  render(<CodexUsageIndicator />);
  const button=await screen.findByRole('button',{name:/19% remaining/});fireEvent.click(button);
  await screen.findByText('19% remaining');
  fireEvent.keyDown(button,{key:'Escape'});
  expect(screen.queryByRole('dialog')).toBeNull();expect(hostClose).not.toHaveBeenCalled();
 } finally { document.removeEventListener('keydown',hostClose); }
});

test('Claude model changes clear previous allowance and ignore a late response', async () => {
 let finishOld: (value:typeof data)=>void=()=>{};
 vi.mocked(codexUsageRequest).mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;})).mockResolvedValueOnce({...data,windows:[{...data.windows[0]!,bucket:'Sonnet',remainingPercent:73}]});
 const view=render(<CodexUsageIndicator provider="claude" model="opus" />);
 view.rerender(<CodexUsageIndicator provider="claude" model="sonnet" />);
 await screen.findByRole('button',{name:/Claude account usage: 73% remaining/});
 finishOld({...data,windows:[{...data.windows[0]!,bucket:'Opus',remainingPercent:2}]});
 await waitFor(()=>expect(screen.queryByRole('button',{name:/2% remaining/})).toBeNull());
 expect(vi.mocked(codexUsageRequest).mock.calls[0]![0]?.aborted).toBe(true);
 expect(vi.mocked(codexUsageRequest).mock.calls[1]!.slice(1)).toEqual(['claude','sonnet']);
});

test('viewport-positioned usage menu escapes the contained Workspace overlay', async () => {
 vi.mocked(codexUsageRequest).mockResolvedValue(data);
 const overlay=document.createElement('div');overlay.id='pixflow-design-overlay';overlay.style.contain='layout paint';overlay.style.transform='translateY(0)';overlay.style.zIndex='100090';document.body.appendChild(overlay);
 try {
  render(<CodexUsageIndicator />, {container:overlay});
  const button=await screen.findByRole('button',{name:/19% remaining/});
  vi.spyOn(button,'getBoundingClientRect').mockReturnValue({top:700,bottom:728,left:400,right:428,width:28,height:28,x:400,y:700,toJSON:()=>({})});
  fireEvent.click(button);
  const dialog=screen.getByRole('dialog');
  expect(dialog.parentElement?.classList.contains('pixflow-design-portal-scope')).toBe(true);
  expect(dialog.parentElement?.parentElement).toBe(document.body);
  expect(Number(dialog.style.zIndex)).toBeGreaterThan(100090);
  expect(dialog.style.bottom).toBe(`${window.innerHeight-700+8}px`);
 } finally {overlay.remove();}
});

