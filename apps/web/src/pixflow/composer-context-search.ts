import { designSystemBuilder } from './design-system-builder';
import { planningAvailable } from './planning-availability';
import type { WorkspaceContextItem } from '@open-design/contracts';
import { getPixflowRestConfig } from './wordpress-context';
import { requestWordPressRest } from './license';
import type { PixflowBricksDesignSystem } from '@open-design/contracts';

export type SiteContextCategory = 'pages' | 'media' | 'systems';
/** Uses the current WordPress user's normal REST permissions, including draft visibility. */
export async function searchComposerSiteContext(category: SiteContextCategory, query: string, signal: AbortSignal): Promise<WorkspaceContextItem[]> {
  if (category === 'systems') {
    if (!planningAvailable()) return [];
    const builder = designSystemBuilder();
    if (!builder) return [];
    const response = await requestWordPressRest<{ designSystems: PixflowBricksDesignSystem[] }>(`od/design-systems/${builder.toLowerCase()}`);
    if (signal.aborted) return [];
    if (!response.ok) throw new Error('Could not load design systems. Please retry.');
    return (response.body?.designSystems || []).filter(item => `${item.title} ${item.summary}`.toLowerCase().includes(query.toLowerCase())).map(item => ({
      id: `pixflow-design-system:${item.id}`, kind: 'design-system', label: item.title,
      title: item.summary || `${item.profile.headingFont} · ${item.profile.bodyFont}`,
      accentColor: item.profile.colors.main.accent,
      content: JSON.stringify({ source: 'pixflow-design-system', id: item.id, revision: item.revision, profile: item.profile,
        skill: 'pixflow/design-systems/SKILL.md', scope: 'Design reference for this request. Apply site-wide only when requested.' }),
    }));
  }
  const { restBaseUrl, restNonce } = getPixflowRestConfig();
  if (!restBaseUrl || !restNonce) throw new Error('Sign in to WordPress to browse site content.');
  const base = new URL(restBaseUrl, window.location.href);
  const get = async (type: string): Promise<WorkspaceContextItem[]> => {
    const url = new URL(base);
    const route = `/wp/v2/${type}`;
    if (url.searchParams.has('rest_route')) url.searchParams.set('rest_route', route);
    else url.pathname = url.pathname.replace(/\/pixflow-design\/v1\/?$/, route);
    url.searchParams.set('context', 'edit');
    url.searchParams.set('per_page', '30');
    url.searchParams.set('search', query);
    url.searchParams.set('_fields', 'id,title,status,link,slug,source_url,mime_type,alt_text');
    if (type !== 'media') url.searchParams.set('status', 'publish,draft,private,pending,future');
    const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-WP-Nonce': restNonce }, signal });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Your WordPress session cannot read this content. Please sign in again.' : 'Could not load site content. Try again.');
    const rows = await response.json() as Array<{id:number;title?:{raw?:string;rendered?:string};status?:string;link?:string;slug?:string;source_url?:string;mime_type?:string;alt_text?:string}>;
    return rows.map(row => {
      const title = row.title?.raw || new DOMParser().parseFromString(row.title?.rendered || '', 'text/html').body.textContent || `${type} #${row.id}`;
      return { id: `wordpress:${type}:${row.id}`, kind: type === 'media' ? 'file' : 'browser', label: title,
        url: row.source_url || row.link, title: type === 'media' ? row.mime_type || 'Media' : `${type === 'pages' ? 'Page' : 'Post'} · ${row.status} · /${row.slug || ''}`,
        content: JSON.stringify({source:'wordpress',type,id:row.id,title,status:row.status,url:row.source_url || row.link,alt:row.alt_text}) };
    });
  };
  return category === 'media' ? get('media') : (await Promise.all([get('pages'), get('posts')])).flat();
}
