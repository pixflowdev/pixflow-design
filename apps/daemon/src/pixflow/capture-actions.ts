import type { PixflowVisualCaptureViewport } from '@open-design/contracts';

type CaptureActionPage = {
  locator(selector: string): {
    click(options: { timeout: number }): Promise<unknown>;
    hover(options: { timeout: number }): Promise<unknown>;
    fill(value: string, options: { timeout: number }): Promise<unknown>;
    selectOption(value: string, options: { timeout: number }): Promise<unknown>;
    setChecked(checked: boolean, options: { timeout: number }): Promise<unknown>;
    waitFor(options: { state: 'visible' | 'hidden' | 'attached' | 'detached'; timeout: number }): Promise<unknown>;
  };
};

/** Apply only the requested interactions; an ambiguous or failed action stays an error. */
export async function applyPixflowCaptureActions(page: CaptureActionPage, actions?: PixflowVisualCaptureViewport['actions']) {
  for (const [index, action] of (actions ?? []).entries()) {
    try {
      if (!action || !['click', 'hover', 'fill', 'select', 'check', 'waitFor'].includes(action.type) || typeof action.selector !== 'string' || !action.selector.trim()) {
        throw new Error('Expected a supported capture action with a nonempty selector.');
      }
      const target = page.locator(action.selector);
      if (action.type === 'click') await target.click({ timeout: 5000 });
      else if (action.type === 'hover') await target.hover({ timeout: 5000 });
      else if (action.type === 'fill' || action.type === 'select') {
        if (typeof action.value !== 'string') throw new Error('Expected a string value.');
        if (action.type === 'fill') await target.fill(action.value, { timeout: 5000 });
        else await target.selectOption(action.value, { timeout: 5000 });
      } else if (action.type === 'check') {
        if (typeof action.checked !== 'boolean') throw new Error('Expected a boolean checked value.');
        await target.setChecked(action.checked, { timeout: 5000 });
      } else if (action.type === 'waitFor') {
        const state = action.state ?? 'visible';
        if (!['visible', 'hidden', 'attached', 'detached'].includes(state)) throw new Error('Unknown wait state.');
        await target.waitFor({ state, timeout: 10000 });
      }
    } catch (error) {
      throw new Error(`Capture action ${index + 1} (${action?.type} ${action?.selector}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
