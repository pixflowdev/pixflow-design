import { claudeSupportStages, type PixflowBridgeSupport } from '@open-design/contracts';
import { getPixflowWordPressConfig } from './wordpress-context';
import { pixflowOptionalBridgeApiUrl, pixflowOptionalBridgeSiteHeaders, readPublishedBridgeStatus, readCachedPixflowOptionalBridgeAgents } from './optional-bridge';
import { bridgeConnectionRoute } from './bridge-connection-route';

const version = (s: unknown) => typeof s === 'string' && /^v?\d+(?:\.\d+){1,3}$/.test(s) ? s : null;
const integer = (n: unknown, max: number) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= max ? Number(n) : null;
const time = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) ? s : null;
const source = (s: unknown) => s === 'desktop' || s === 'cli' ? s : null;

/** Project the response before sending it from the device to WordPress. */
export function safeBridgeReport(data: Partial<PixflowBridgeSupport> | null) {
  if (data?.schema !== 'pixflow.bridge-support.v1' || !data.claude) return null;
  const claude = data.claude;
  return {
    capturedAt: time(data.capturedAt), platform: ['win32','darwin','linux'].includes(data.platform ?? '') ? data.platform : 'other',
    arch: ['arm64','x64','ia32','arm'].includes(data.arch ?? '') ? data.arch : 'other',
    osRelease: version(data.osRelease), nodeVersion: version(data.nodeVersion), bridgeVersion: version(data.bridgeVersion),
    uptimeSeconds: integer(data.uptimeSeconds, 2**31), logicalCpus: integer(data.logicalCpus, 65536), memoryGiB: integer(data.memoryGiB, 2**20),
    claude: {
      desktopRuntimeDetected: claude.desktopRuntimeDetected === true, cliOnPath: claude.cliOnPath === true,
      selectedSource: source(claude.selectedSource), source: source(claude.source),
      state: ['idle','waiting','connected','cancelled','failed','timed-out','not-observed','previous-session'].includes(claude.state) ? claude.state : 'unknown',
      storage: claude.storage === 'private-file' ? 'private-file' : 'file-unavailable',
      milestones: (Array.isArray(claude.milestones) ? claude.milestones : []).slice(-32)
        .filter(event => event && time(event.at) && claudeSupportStages.includes(event.stage))
        .map(event => ({ at: event.at, stage: event.stage, exitCode: integer(event.exitCode, 2**31) })),
    },
  };
}

export async function collectBridgeSupport(includeDevice: boolean) {
  const status = readPublishedBridgeStatus();
  const connection = {
    checked: status?.checked === true, running: status?.running === true,
    route: bridgeConnectionRoute(status ?? undefined), siteMismatch: status?.siteMismatch === true,
    updateRequired: status?.updateRequired === true, observedVersion: version(status?.version),
    requiredVersion: version(getPixflowWordPressConfig()?.bridgeRequiredVersion),
  };
  const base = { schema: 'pixflow.support-export.v1', connection };
  if (!includeDevice) return { ...base, collection: 'not-requested' };
  if (connection.siteMismatch) return { ...base, collection: 'site-mismatch' };
  if (!getPixflowWordPressConfig()?.siteHash) return { ...base, collection: 'site-identity-unavailable' };
  const scanned = readCachedPixflowOptionalBridgeAgents().find(agent => agent.id === 'claude' || agent.id === 'claude-code');
  const lastClaudeScan = scanned ? { available: scanned.available === true, source: source(scanned.runtimeSource),
    version: version(scanned.version), auth: ['ok','missing','unknown'].includes(scanned.authStatus ?? '') ? scanned.authStatus : 'unknown' } : null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  try {
    const bridgeFetch = window.__PIXFLOW_DESIGN_NATIVE_FETCH__ ?? window.fetch.bind(window);
    const res = await bridgeFetch(pixflowOptionalBridgeApiUrl('pixflow/diagnostics/support'), {
      signal: controller.signal, headers: pixflowOptionalBridgeSiteHeaders({ Accept: 'application/json' }),
      cache: 'no-store', targetAddressSpace: 'loopback',
    } as RequestInit);
    if (!res.ok) return { ...base, lastClaudeScan, collection: res.status === 404 ? 'unsupported' : res.status === 409 ? 'site-mismatch' : 'request-denied-or-failed', httpStatus: res.status };
    const report = safeBridgeReport(await res.json().catch(() => null));
    return { ...base, lastClaudeScan, collection: report ? 'collected' : 'unsupported', report };
  } catch {
    return { ...base, lastClaudeScan, collection: controller.signal.aborted ? 'timeout' : 'unreachable-or-blocked' };
  } finally { clearTimeout(timer); }
}
