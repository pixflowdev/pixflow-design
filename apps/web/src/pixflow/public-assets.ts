export function pixflowPublicAssetUrl(path: string): string {
  if (typeof window === 'undefined') return path;

  const normalizedPath = path.replace(/^\/+/, '');
  const shell = (window as unknown as {
    pixflowDesignShell?: { appAssetBaseUrl?: string };
    __PIXFLOW_DESIGN_WORDPRESS__?: { appAssetBaseUrl?: string };
    pixflowDesignWpAdmin?: { appAssetBaseUrl?: string };
  });
  const base = shell.pixflowDesignShell?.appAssetBaseUrl
    || shell.__PIXFLOW_DESIGN_WORDPRESS__?.appAssetBaseUrl
    // Native Etch/Elementor panels can render before the workspace establishes
    // its global config. Their server bootstrap already supplies the asset base.
    || shell.pixflowDesignWpAdmin?.appAssetBaseUrl
    || inferPixflowAppAssetBaseUrl();

  return base ? `${base.replace(/\/?$/, '/')}${normalizedPath}` : `/${normalizedPath}`;
}

function inferPixflowAppAssetBaseUrl(): string {
  const currentScript = document.currentScript instanceof HTMLScriptElement
    ? document.currentScript.src
    : '';
  const scripts = [
    currentScript,
    ...Array.from(document.scripts).map((script) => script.src),
  ];
  const appScript = scripts.find((src) => /\/assets\/app\/pixflow-design-app\.js(?:\?|$)/.test(src));
  if (!appScript) return '';
  try {
    const url = new URL(appScript, window.location.href);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/pixflow-design-app\.js$/, '/');
    return url.toString();
  } catch {
    return '';
  }
}
