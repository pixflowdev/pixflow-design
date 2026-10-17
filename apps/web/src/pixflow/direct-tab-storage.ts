import { getPixflowWordPressConfig } from './wordpress-context';

/** A browser tab can visit multiple WordPress installations on the same origin. */
export function directTabStorageKey(name: string): string {
  const config = getPixflowWordPressConfig();
  // The run transcript is page-scoped; the live mailbox belongs to the tab,
  // including native navigation to another page in that same tab.
  const pageScoped = name === 'pixflow:direct-bricks-run';
  const postId = Number(config?.postId);
  return `${name}:${config?.restRouteBaseUrl || config?.restBaseUrl || window.location.origin}${config?.userId ? `:user:${config.userId}` : ''}${pageScoped && postId > 0 ? `:post:${postId}` : ''}`;
}
