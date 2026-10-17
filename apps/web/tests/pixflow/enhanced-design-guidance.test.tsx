// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EnhancedDesignGuidance } from '../../src/pixflow/EnhancedDesignGuidance';
const api = vi.hoisted(() => ({read:vi.fn(),write:vi.fn()}));
vi.mock('../../src/pixflow/optional-bridge',()=>({fetchPixflowOptionalBridgeConfig:api.read,persistPixflowOptionalBridgeConfig:api.write}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('keeps the saved preference when saving fails and displays an error',async()=>{
 api.read.mockResolvedValue({enhancedDesignGuidance:false});api.write.mockRejectedValue(new Error('offline'));
 render(<EnhancedDesignGuidance/>);
 const toggle=screen.getByRole('switch');
 await waitFor(()=>expect(api.read).toHaveBeenCalled());
 fireEvent.click(toggle);
 await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());
 expect(toggle.getAttribute('aria-checked')).toBe('false');
});
it('hydrates from the shared service and saves the independent preference',async()=>{
 api.read.mockResolvedValue({enhancedDesignGuidance:true});api.write.mockResolvedValue({enhancedDesignGuidance:false});
 render(<EnhancedDesignGuidance/>);const toggle=screen.getByRole('switch');
 await waitFor(()=>expect(toggle.getAttribute('aria-checked')).toBe('true'));
 fireEvent.click(toggle);
 await waitFor(()=>expect(toggle.getAttribute('aria-checked')).toBe('false'));
 expect(api.write).toHaveBeenCalledWith({enhancedDesignGuidance:false});
});

it('does not overwrite a saved choice with an older hydration response',async()=>{
 let resolveRead!:(value:unknown)=>void;
 api.read.mockReturnValue(new Promise(resolve=>{resolveRead=resolve;}));
 api.write.mockResolvedValue({enhancedDesignGuidance:true});
 render(<EnhancedDesignGuidance enabled={false}/>);const toggle=screen.getByRole('switch');
 fireEvent.click(toggle);
 await waitFor(()=>expect(toggle.getAttribute('aria-checked')).toBe('true'));
 resolveRead({enhancedDesignGuidance:false});
 await waitFor(()=>expect(api.write).toHaveBeenCalled());
 expect(toggle.getAttribute('aria-checked')).toBe('true');
});

it('defaults on when no preference is saved',async()=>{
 api.read.mockResolvedValue({});
 render(<EnhancedDesignGuidance/>);
 await waitFor(()=>expect(api.read).toHaveBeenCalled());
 expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
});
