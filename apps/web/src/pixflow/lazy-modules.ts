import { pixflowPublicAssetUrl } from './public-assets';

type Manifest = { schema: 1; modules: Record<string, string> };
const manifests = new Map<string, Promise<Manifest>>();

/** Stable module identities let an installed Pro use an independently updated Free package. */
export async function loadPixflowLazyModule(key: string): Promise<Record<string, any>> {
  const url = pixflowPublicAssetUrl('lazy/manifest.json');
  let request = manifests.get(url);
  if (!request) {
    request = fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(async response => {
      if (!response.ok) throw new Error('Unable to load Pixflow language and syntax resources.');
      const manifest = await response.json() as Manifest;
      if (manifest?.schema !== 1 || !manifest.modules || typeof manifest.modules !== 'object'
        || Array.isArray(manifest.modules)) throw new Error('Invalid Pixflow resource manifest.');
      return manifest;
    }).catch(error => { manifests.delete(url); throw error; });
    manifests.set(url, request);
  }
  const manifest = await request;
  const path = Object.hasOwn(manifest.modules, key) ? manifest.modules[key] : undefined;
  if (typeof path !== 'string' || !/^module-\d+-[A-Z0-9]+\.js$/.test(path)) throw new Error('Unknown Pixflow resource.');
  try {
    return await import(/* webpackIgnore: true */ pixflowPublicAssetUrl(`lazy/${path}`));
  } catch (error) {
    // An update can replace chunks while this tab remains open. Retry resolves
    // the current manifest; never reload an editor or discard its unsaved work.
    manifests.delete(url);
    throw error;
  }
}
