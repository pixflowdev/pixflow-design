import type { MarketplacePluginEntry } from '@open-design/contracts';

export interface ParsedPluginSpecifier {
  name: string;
  range?: string;
}

export interface ResolvedMarketplaceVersion {
  version: string;
  source: string;
  ref?: string;
  manifestDigest?: string;
  archiveIntegrity?: string;
  deprecated?: boolean | string;
}

export function parsePluginSpecifier(input: string): ParsedPluginSpecifier {
  const trimmed = input.trim();
  const slash = trimmed.indexOf('/');
  const at = trimmed.lastIndexOf('@');
  if (slash > 0 && at > slash + 1) {
    const range = trimmed.slice(at + 1);
    return range
      ? { name: trimmed.slice(0, at), range }
      : { name: trimmed.slice(0, at) };
  }
  return { name: trimmed };
}

export function resolveMarketplaceEntryVersion(
  entry: MarketplacePluginEntry,
  requestedRange?: string,
): ResolvedMarketplaceVersion | null {
  if (entry.yanked) return null;

  const versions = entry.versions ?? [];
  const range = requestedRange?.trim();
  const defaultVersion =
    entry.distTags?.latest ??
    entry.version ??
    versions.find((version) => !version.yanked)?.version;
  const targetVersion = range && range !== 'latest'
    ? resolveRequestedVersion(versions, entry.distTags ?? {}, range)
    : defaultVersion;
  if (!targetVersion) return null;

  const versionRecord = versions.find((version) => version.version === targetVersion);
  if (versionRecord?.yanked) return null;

  const source = versionRecord?.source ?? entry.source;
  if (!source) return null;

  const resolved: ResolvedMarketplaceVersion = {
    version: targetVersion,
    source,
  };
  const ref = versionRecord?.ref ?? entry.ref;
  if (ref) resolved.ref = ref;
  const manifestDigest =
    versionRecord?.manifestDigest ??
    versionRecord?.dist?.manifestDigest ??
    entry.manifestDigest ??
    entry.dist?.manifestDigest;
  if (manifestDigest) resolved.manifestDigest = manifestDigest;
  const archiveIntegrity =
    versionRecord?.integrity ??
    versionRecord?.dist?.integrity ??
    entry.integrity ??
    entry.dist?.integrity;
  if (archiveIntegrity) resolved.archiveIntegrity = archiveIntegrity;
  const deprecated = versionRecord?.deprecated ?? entry.deprecated;
  if (deprecated !== undefined) resolved.deprecated = deprecated;
  return resolved;
}

function resolveRequestedVersion(
  versions: NonNullable<MarketplacePluginEntry['versions']>,
  distTags: Record<string, string>,
  range: string,
): string | null {
  const tagged = distTags[range];
  if (tagged) return tagged;
  if (!range.startsWith('^') && !range.startsWith('~')) {
    return range;
  }

  const base = parseSemver(range.slice(1));
  if (!base) return null;
  const candidates = versions
    .filter((version) => !version.yanked)
    .map((version) => version.version)
    .filter((version) => {
      const parsed = parseSemver(version);
      if (!parsed) return false;
      if (
        parsed.prerelease &&
        !(base.prerelease &&
          parsed.major === base.major &&
          parsed.minor === base.minor &&
          parsed.patch === base.patch)
      ) {
        return false;
      }
      if (range.startsWith('^')) {
        if (parsed.major !== base.major) return false;
        if (base.major === 0) {
          if (parsed.minor !== base.minor) return false;
          if (base.minor === 0 && parsed.patch !== base.patch) return false;
        }
        return compareSemver(parsed, base) >= 0;
      }
      return parsed.major === base.major &&
        parsed.minor === base.minor &&
        compareSemver(parsed, base) >= 0;
    })
    .sort((left, right) => compareSemver(parseSemver(right)!, parseSemver(left)!));
  return candidates[0] ?? null;
}

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

function parseSemver(value: string): SemverParts | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([^+]*))?(?:\+.*)?$/.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] || null,
  };
}

function compareSemver(left: SemverParts, right: SemverParts): number {
  const core = left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch;
  if (core !== 0) return core;
  return comparePrerelease(left.prerelease, right.prerelease);
}

function comparePrerelease(left: string | null, right: string | null): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const a = left.split('.');
  const b = right.split('.');
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index];
    const y = b[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      const difference = Number(x) - Number(y);
      if (difference !== 0) return difference < 0 ? -1 : 1;
    } else if (xNumeric) {
      return -1;
    } else if (yNumeric) {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}
