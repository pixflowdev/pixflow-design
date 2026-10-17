import { createHash } from 'node:crypto';
import JSZip from 'jszip';

// Compatibility build scripts execute directly under Node before TypeScript
// output exists. Keep the protected identifiers as irreversible token hashes.
const protectedTokenHashes = new Set([
  '8e49285de34ec22a11c0a9c8f99dc06cee9b869bbd30c3ffe6c0f4eeb2e8b8b4',
  '19a2caf031c5a3c3bfc9b4a9f0e5ab98da9e4dc422adf1d41e42b4cda9ee9ae8',
]);
const tokenPattern = /[A-Za-z][A-Za-z0-9_-]{2,80}/g;

function containsProtectedToken(value) {
  for (const match of String(value).matchAll(tokenPattern)) {
    const hash = createHash('sha256').update(match[0].toLowerCase()).digest('hex');
    if (protectedTokenHashes.has(hash)) return true;
  }
  return false;
}

export async function assertZipProductIsolation(zip, label = 'distributable archive') {
  for (const entry of Object.values(zip.files)) {
    if (containsProtectedToken(entry.name)) {
      throw new Error(`${label} contains a protected external product identifier in an archive path.`);
    }
    if (entry.dir) continue;
    const bytes = await entry.async('nodebuffer');
    if (containsProtectedToken(bytes.toString('utf8'))) {
      throw new Error(`${label} contains a protected external product identifier in ${entry.name}.`);
    }
  }
}

export async function assertZipBufferProductIsolation(buffer, label = 'distributable archive') {
  const zip = await JSZip.loadAsync(buffer);
  await assertZipProductIsolation(zip, label);
}
