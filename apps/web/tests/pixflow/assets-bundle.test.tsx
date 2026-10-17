// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PixflowGoogleFontsSection } from '../../src/pixflow/assets-contribution';
import { requestWordPressRest } from '../../src/pixflow/license';
vi.mock('../../src/pixflow/license', () => ({ requestWordPressRest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
it('Free lists saved assets, confirms removal and retains the item when removal fails', async () => {
  const item = {kind:'font',id:'lora',name:'Lora',builder:'wordpress'};
  vi.mocked(requestWordPressRest).mockResolvedValue({ok:true,body:{items:[item]}} as any);
  render(<PixflowGoogleFontsSection />);
  expect(await screen.findByText('Lora')).toBeTruthy();
  expect(screen.queryByText('Browse fonts')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Remove Lora (wordpress)'}));
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  expect(requestWordPressRest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Remove Lora (wordpress)'}));
  vi.mocked(requestWordPressRest).mockResolvedValue({ok:false,body:{message:'Removal failed'}} as any);
  fireEvent.click(screen.getByRole('button',{name:'Remove'}));
  expect(await screen.findByText('Removal failed')).toBeTruthy();
  expect(screen.getByText('Lora')).toBeTruthy();
  vi.mocked(requestWordPressRest).mockResolvedValue({ok:true,body:{items:[],message:'Removed.'}} as any);
  fireEvent.click(screen.getByRole('button',{name:'Remove'}));
  await waitFor(()=>expect(screen.queryByText('Lora')).toBeNull());
  expect(requestWordPressRest).toHaveBeenLastCalledWith('assets/installed/remove',{method:'POST',body:item});
});
