import fs from 'node:fs/promises';
import path from 'node:path';

const SITE_KEY_PATTERN = /^[a-zA-Z0-9._-]{8,128}$/;

export function sanitizeSiteKey(value) {
  const siteKey = String(value || '').trim().toLowerCase();
  if (!siteKey) return '';
  if (!SITE_KEY_PATTERN.test(siteKey)) {
    throw new Error('Invalid Pixflow Design site key.');
  }
  return siteKey;
}

export function resolveSiteContext({
  dataDir,
  flags = {},
  existing = {},
  env = process.env,
} = {}) {
  const explicitFlagSiteKey = flags['site-key'] || '';
  const requestedSiteKey = explicitFlagSiteKey || env.PIXFLOW_DESIGN_SITE_KEY || '';
  const configuredKey = requestedSiteKey
    || existing?.site?.key
    || existing?.activeSite?.key
    || '';
  const siteKey = sanitizeSiteKey(configuredKey);
  if (!siteKey) return null;

  const existingSiteKey = sanitizeSiteKey(existing?.site?.key || existing?.activeSite?.key || '');
  const canReuseExistingSitePath = !explicitFlagSiteKey && (!requestedSiteKey || existingSiteKey === siteKey);
  const siteDataDir = path.resolve(String(
    flags['site-data-dir']
      || (!explicitFlagSiteKey ? env.PIXFLOW_DESIGN_SITE_DATA_DIR : '')
      || (canReuseExistingSitePath ? existing?.site?.dataDir : '')
      || (canReuseExistingSitePath ? existing?.activeSite?.dataDir : '')
      || path.join(path.resolve(String(dataDir)), 'sites', siteKey)
  ));

  return {
    key: siteKey,
    dataDir: siteDataDir,
    odDataDir: path.join(siteDataDir, 'od'),
    syncRoot: path.join(siteDataDir, 'sync'),
    logsDir: path.join(siteDataDir, 'logs'),
    origin: stringValue(flags['site-origin'] || env.PIXFLOW_DESIGN_SITE_ORIGIN || existing?.site?.origin || existing?.activeSite?.origin),
    url: stringValue(flags['site-url'] || env.PIXFLOW_DESIGN_SITE_URL || existing?.site?.url || existing?.activeSite?.url),
    label: stringValue(flags['site-label'] || env.PIXFLOW_DESIGN_SITE_LABEL || existing?.site?.label || existing?.activeSite?.label),
  };
}

export async function writeSiteContext(siteContext) {
  if (!siteContext?.key) return;

  await fs.mkdir(siteContext.dataDir, { recursive: true });
  await fs.writeFile(path.join(siteContext.dataDir, 'site.json'), `${JSON.stringify({
    type: 'pixflow_design_bridge_site',
    version: 1,
    key: siteContext.key,
    dataDir: siteContext.dataDir,
    odDataDir: siteContext.odDataDir,
    syncRoot: siteContext.syncRoot,
    logsDir: siteContext.logsDir,
    origin: siteContext.origin,
    url: siteContext.url,
    label: siteContext.label,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}
