// Compatibility module: this standalone bridge is copied directly into the
// Pixflow installers and must remain executable by Node without a build step.
import { createHash } from 'node:crypto';

const MAX_GEOMETRY = 24;
const MAX_ISSUES = 32;
const MAX_LIST = 40;
const MAX_TEXT = 320;

export function buildStageBDeltaPacket(input = {}) {
  const source = objectValue(input.source);
  const bricks = objectValue(input.bricks);
  const packet = {
    source: {
      canonicalHash: cleanString(source.canonicalHash),
      viewports: compactObjects(source.viewports, 8),
      geometry: compactObjects(source.geometry, MAX_GEOMETRY),
      documentHeight: finiteNumber(source.documentHeight),
      fonts: compactStrings(source.fonts),
      colours: compactStrings(source.colours),
      assets: compactStrings(source.assets),
      interactions: compactStrings(source.interactions),
      structuralCounts: compactObject(source.structuralCounts),
    },
    bricks: {
      resultHash: cleanString(bricks.resultHash),
      viewports: compactObjects(bricks.viewports, 8),
      geometry: compactObjects(bricks.geometry, MAX_GEOMETRY),
      documentHeight: finiteNumber(bricks.documentHeight),
      fonts: compactStrings(bricks.fonts),
      colours: compactStrings(bricks.colours),
      assets: compactStrings(bricks.assets),
      interactions: compactStrings(bricks.interactions),
      elementCount: finiteNumber(bricks.elementCount),
      globalClassCount: finiteNumber(bricks.globalClassCount),
    },
    issues: compactObjects(input.issues, MAX_ISSUES),
  };
  const canonical = stableStringify(packet);
  return {
    schema: 'pixflow.html_to_bricks.stage_b_delta.v1',
    sha256: createHash('sha256').update(canonical).digest('hex'),
    packet,
  };
}

export function stageBDeltaPacketCacheDecision(previousHash, nextHash) {
  const previous = cleanString(previousHash);
  const next = cleanString(nextHash);
  return previous && next && previous === next ? 'hit' : 'miss';
}

function compactObjects(value, limit) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map((item) => compactObject(item));
}

function compactObject(value) {
  const record = objectValue(value);
  return Object.fromEntries(Object.entries(record).slice(0, 24).map(([key, item]) => [key, compactValue(item)]));
}

function compactValue(value) {
  if (typeof value === 'string') return value.slice(0, MAX_TEXT);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 16).map(compactValue);
  if (value && typeof value === 'object') return compactObject(value);
  return null;
}

function compactStrings(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map(cleanString)
    .filter(Boolean)))
    .slice(0, MAX_LIST);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_TEXT) : '';
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
