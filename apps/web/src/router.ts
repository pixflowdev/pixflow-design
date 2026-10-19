// Tiny URL router. We avoid pulling in react-router for two reasons:
// the surface area we need is small (three routes, plain pushState), and
// we want a single source of truth for "what file is open" — encoding
// that in the URL is the simplest way to make it deep-linkable.

import { useSyncExternalStore } from 'react';
import { decodeWorkspaceRouteHash, encodeWorkspaceRouteHash } from './pixflow/workspace-route-hash';
import { hasPixflowWordPressContext } from './pixflow/wordpress-context';

// Entry-shell sub-views. The home/project landing renders one of three
// columns and each sub-view now owns a top-level path so the browser
// back/forward buttons work, deep links are shareable, and per-tab
// state isn't trapped behind a `useState` boundary.
export type EntryHomeView =
  | 'home'
  | 'onboarding'
  | 'projects'
  | 'media'
  | 'sitemap'
  | 'plugins'
  | 'design-systems';

export type Route =
  | { kind: 'home'; view: EntryHomeView }
  | { kind: 'design-system-create' }
  | { kind: 'design-system-detail'; designSystemId: string }
  | {
      kind: 'project';
      projectId: string;
      /**
       * Deep-link to a specific conversation inside the project. When
       * present, the project view picks this conversation as the active
       * one instead of defaulting to `list[0]`. Falls back to the
       * default picker when the routed conversation no longer exists.
       * Added for issue #1505 (Routines history → specific conversation).
       */
      conversationId?: string | null;
      fileName: string | null;
    }
  | { kind: 'marketplace' }
  | { kind: 'marketplace-detail'; pluginId: string };

export function parseRoute(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  // Retired discovery links must not mount the inherited marketplace in WordPress.
  // Saved project/resource references remain available through their own routes.
  if (hasPixflowWordPressContext() && ['plugins', 'marketplace'].includes(parts[0] ?? '')) {
    return { kind: 'home', view: 'home' };
  }
  if (parts.length === 0) return { kind: 'home', view: 'home' };
  if (parts[0] === 'onboarding') {
    return { kind: 'home', view: 'onboarding' };
  }
  if (parts[0] === 'projects') {
    if (parts[1]) {
      const projectId = decodeURIComponent(parts[1]);
      // /projects/:id/conversations/:cid[/files/...]
      if (parts[2] === 'conversations' && parts[3]) {
        const conversationId = decodeURIComponent(parts[3]);
        if (parts[4] === 'files' && parts[5]) {
          return {
            kind: 'project',
            projectId,
            conversationId,
            fileName: decodeURIComponent(parts.slice(5).join('/')),
          };
        }
        return { kind: 'project', projectId, conversationId, fileName: null };
      }
      // /projects/:id/files/...
      if (parts[2] === 'files' && parts[3]) {
        return {
          kind: 'project',
          projectId,
          conversationId: null,
          fileName: decodeURIComponent(parts.slice(3).join('/')),
        };
      }
      return { kind: 'project', projectId, conversationId: null, fileName: null };
    }
    return { kind: 'home', view: 'projects' };
  }
  if (parts[0] === 'design-systems') {
    if (parts[1] === 'create') {
      return { kind: 'design-system-create' };
    }
    if (parts[1]) {
      return { kind: 'design-system-detail', designSystemId: decodeURIComponent(parts[1]) };
    }
    return { kind: 'home', view: 'design-systems' };
  }
  if (parts[0] === 'media') {
    return { kind: 'home', view: 'media' };
  }
  if (parts[0] === 'sitemap') {
    return { kind: 'home', view: 'sitemap' };
  }
  if (parts[0] === 'plugins' && !parts[1]) {
    return { kind: 'home', view: 'plugins' };
  }
  return { kind: 'home', view: 'home' };
}

export function buildPath(route: Route): string {
  if (route.kind === 'home') {
    if (route.view === 'onboarding') return '/onboarding';
    if (route.view === 'projects') return '/projects';
    if (route.view === 'media') return '/media';
    if (route.view === 'sitemap') return '/sitemap';
    if (route.view === 'plugins') return '/plugins';
    if (route.view === 'design-systems') return '/design-systems';
    return '/';
  }
  if (route.kind === 'marketplace') return '/marketplace';
  if (route.kind === 'marketplace-detail') return `/marketplace/${encodeURIComponent(route.pluginId)}`;
  if (route.kind === 'design-system-create') return '/design-systems/create';
  if (route.kind === 'design-system-detail') {
    return `/design-systems/${encodeURIComponent(route.designSystemId)}`;
  }
  const id = encodeURIComponent(route.projectId);
  const file = route.fileName
    ? route.fileName.split('/').map((s) => encodeURIComponent(s)).join('/')
    : null;
  if (route.conversationId) {
    const cid = encodeURIComponent(route.conversationId);
    return file
      ? `/projects/${id}/conversations/${cid}/files/${file}`
      : `/projects/${id}/conversations/${cid}`;
  }
  return file ? `/projects/${id}/files/${file}` : `/projects/${id}`;
}

const EMBEDDED_ROUTE_CHANGE_EVENT = 'pixflow-design:embedded-route-change';
let embeddedRoutePath: string | null = null;

function isWordPressRouteRuntime(): boolean {
  try {
    return hasPixflowWordPressContext();
  } catch {
    return false;
  }
}

function isBricksBuilderRouteRuntime(): boolean {
  if (!isWordPressRouteRuntime()) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('bricks') === 'run' || params.get('pixflowBricksAgent') === '1';
}

function readWordPressHashRoute(): string | null {
  if (!isWordPressRouteRuntime()) return null;
  return decodeWorkspaceRouteHash(window.location.hash);
}

function readActiveRoutePath(): string {
  if (isBricksBuilderRouteRuntime() && embeddedRoutePath !== null) {
    return embeddedRoutePath;
  }
  return readWordPressHashRoute() ?? window.location.pathname;
}

function buildBrowserTarget(path: string): string {
  if (!isWordPressRouteRuntime()) return path;

  const next = new URL(window.location.href);
  if (path === '/') {
    next.hash = '';
  } else {
    next.hash = encodeWorkspaceRouteHash(path);
  }

  return `${next.pathname}${next.search}${next.hash}`;
}

// Centralized navigation. Components call this instead of mutating
// `window.location` directly so we can fan the change out to any
// `useRoute()` subscriber via a custom event.
//
// The `popstate` dispatch is deferred to a microtask so that callers
// can safely invoke `navigate()` from inside a `useState` updater or
// during a render commit phase without triggering React's
// "Cannot update a component while rendering a different component"
// warning. The `history` API call itself stays synchronous so the URL
// bar updates immediately; only the `useRoute()` subscriber updates
// are deferred past the current render.
export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  const targetPath = buildPath(route);
  const currentPath = readActiveRoutePath();
  if (targetPath === currentPath) return;

  // Bricks owns the top-level builder URL and reacts to hash/history changes
  // by remounting the entire builder. Keep Pixflow workspace navigation in
  // memory in this embedded runtime so switching tabs never reloads the canvas.
  if (isBricksBuilderRouteRuntime()) {
    embeddedRoutePath = targetPath;
    queueMicrotask(() => {
      window.dispatchEvent(new Event(EMBEDDED_ROUTE_CHANGE_EVENT));
    });
    return;
  }

  const target = buildBrowserTarget(targetPath);
  if (opts.replace) {
    window.history.replaceState(null, '', target);
  } else {
    window.history.pushState(null, '', target);
  }
  queueMicrotask(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

let cachedPathname: string | null = null;
let cachedRoute: Route | null = null;

function getRouteSnapshot(): Route {
  const pathname = readActiveRoutePath();
  if (cachedPathname !== pathname || cachedRoute === null) {
    cachedPathname = pathname;
    cachedRoute = parseRoute(pathname);
  }
  return cachedRoute;
}

function subscribeToRouteChanges(onStoreChange: () => void): () => void {
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener('hashchange', onStoreChange);
  window.addEventListener(EMBEDDED_ROUTE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener('hashchange', onStoreChange);
    window.removeEventListener(EMBEDDED_ROUTE_CHANGE_EVENT, onStoreChange);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeToRouteChanges, getRouteSnapshot, getRouteSnapshot);
}
