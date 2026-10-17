import type { PixflowLicenseStatus } from './license';

/** Lightweight WordPress admin notice; no workspace or React runtime needed. */
window.addEventListener('pixflow-design:license-changed', (event) => {
  const status = (event as CustomEvent<PixflowLicenseStatus | undefined>).detail;
  if (status?.license?.valid !== true || status.runtime_ready === false
    || status.pro?.eligible !== true || status.pro.installation !== 'active'
    || (status.central_entitlement?.enabled && status.central_entitlement.valid !== true)) return;
  // Reconcile server-rendered invitations after activation in another tab.
  // This is not a dismissal: no user preference or entitlement is modified.
  document.querySelectorAll('.pixflow-pro-upgrade, .pixflow-pro-upgrade-link').forEach(node => node.remove());
});

document.querySelectorAll<HTMLFormElement>('.pixflow-pro-upgrade__dismiss').forEach((form) => {
  const banner = form.closest<HTMLElement>('.pixflow-pro-upgrade');
  const button = form.querySelector<HTMLButtonElement>('button');
  const error = banner?.querySelector<HTMLElement>('.pixflow-pro-upgrade__error');
  if (!banner || !button || !error || !form.dataset.dismissUrl) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    error.hidden = true;
    try {
      const response = await fetch(form.dataset.dismissUrl!, {
        method: 'POST', body: new FormData(form), credentials: 'same-origin',
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('dismiss_failed');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await banner.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 140, easing: 'cubic-bezier(0.23,1,0.32,1)', fill: 'forwards',
        }).finished;
      }
      banner.remove();
    } catch {
      error.textContent = 'Could not dismiss the banner. Please try again.';
      error.hidden = false;
      button.disabled = false;
    }
  });
});
