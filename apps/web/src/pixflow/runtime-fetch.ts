import { toPixflowRuntimeUrl } from './bridge-url';
import { getPixflowWordPressConfig, hasPixflowWordPressContext } from './wordpress-context';

type PixflowDesignWordPressConfig = {
  restBaseUrl?: string;
  restRouteBaseUrl?: string;
  restNonce?: string;
};

function pixflowWordPressConfig(): PixflowDesignWordPressConfig | undefined {
  return getPixflowWordPressConfig();
}

export function withWordPressNonce(init: RequestInit | undefined, url?: string): RequestInit {
  const config = pixflowWordPressConfig();
  const restBaseUrl = typeof config?.restBaseUrl === 'string'
    ? config.restBaseUrl.replace(/\/+$/, '')
    : '';
  const restRouteBaseUrl = typeof config?.restRouteBaseUrl === 'string'
    ? config.restRouteBaseUrl.replace(/\/+$/, '')
    : '';
  const queryTransportBaseUrl = restRouteBaseUrl || (restBaseUsesQueryTransport(restBaseUrl) ? restBaseUrl : '');
  if (
    !hasPixflowWordPressContext()
    || !config?.restNonce
    || (url && restBaseUrl && !url.startsWith(`${restBaseUrl}/`) && !isWordPressQueryRoute(url, queryTransportBaseUrl))
  ) {
    return init ?? {};
  }

  const headers = new Headers(init?.headers ?? {});
  headers.set('X-WP-Nonce', config.restNonce);
  return {
    ...init,
    credentials: init?.credentials ?? 'same-origin',
    headers,
  };
}

function isWordPressQueryRoute(url: string, restRouteBaseUrl: string): boolean {
  if (!restRouteBaseUrl) return false;
  try {
    const candidate = new URL(url, typeof window === 'undefined' ? undefined : window.location.href);
    const base = new URL(restRouteBaseUrl, candidate.href);
    const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
    const frontControllerPath = `${basePath}index.php`.replace(/\/+/gu, '/');
    return candidate.origin === base.origin
      && (candidate.pathname === base.pathname || candidate.pathname === frontControllerPath)
      && candidate.searchParams.get('rest_route')?.startsWith('/pixflow-design/v1/') === true;
  } catch {
    return false;
  }
}

function queryRouteUrl(restRouteBaseUrl: string, cleanPath: string): string {
  const [pathname, query = ''] = cleanPath.split('?', 2);
  const url = new URL(restRouteBaseUrl, typeof window === 'undefined' ? undefined : window.location.href);
  url.searchParams.set('rest_route', `/pixflow-design/v1${pathname}`);
  if (query) {
    const params = new URLSearchParams(query);
    params.forEach((value, key) => url.searchParams.append(key, value));
  }
  return url.toString();
}

function restBaseUsesQueryTransport(restBaseUrl: string): boolean {
  if (!restBaseUrl) return false;
  try {
    const url = new URL(restBaseUrl, typeof window === 'undefined' ? undefined : window.location.href);
    return url.searchParams.get('rest_route')?.startsWith('/pixflow-design/v1') === true;
  } catch {
    return false;
  }
}

export function pixflowRuntimeFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = toPixflowRuntimeUrl(path);
  return fetch(url, withWordPressNonce(init, url));
}

export function pixflowWordPressRestFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = pixflowWordPressConfig();
  const restBaseUrl = typeof config?.restBaseUrl === 'string'
    ? config.restBaseUrl.replace(/\/+$/, '')
    : '';
  const restRouteBaseUrl = typeof config?.restRouteBaseUrl === 'string'
    ? config.restRouteBaseUrl.replace(/\/+$/, '')
    : '';

  if (!hasPixflowWordPressContext() || !restBaseUrl) {
    return fetch(path, init);
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const queryTransport = restBaseUsesQueryTransport(restBaseUrl);
  const queryTransportBaseUrl = restRouteBaseUrl || (queryTransport ? restBaseUrl : '');
  const useQueryRoute = Boolean(queryTransportBaseUrl)
    && (
      queryTransport
      || cleanPath === '/wp-admin'
      || cleanPath.startsWith('/wp-admin/')
    );
  const url = useQueryRoute
    ? queryRouteUrl(queryTransportBaseUrl, cleanPath)
    : `${restBaseUrl}${cleanPath}`;
  return fetch(url, withWordPressNonce(init, url));
}
