import type { PixflowVisualCaptureRequest, PixflowVisualCaptureResponse, PixflowVisualTypographyStyle } from '@open-design/contracts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Standalone so the run-local Node helper and od CLI use the same capture client. */
async function capturePage(fs: typeof import('node:fs/promises'), path: typeof import('node:path'), endpoint: string, input: PixflowVisualCaptureRequest, outputDir: string) {
  const response = await fetch(endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const result = await response.json() as PixflowVisualCaptureResponse;
  if (!Array.isArray(result.captures)) throw new Error(`Screenshot service failed (${response.status}).`);
  await fs.mkdir(path.resolve(outputDir), { recursive: true });
  const directory = await fs.mkdtemp(path.join(path.resolve(outputDir), 'capture-'));
  const captures = [];
  for (const [index, capture] of result.captures.entries()) {
    const filename = path.join(directory, `${index + 1}.png`);
    await fs.writeFile(filename, Buffer.from(capture.base64, 'base64'));
    const { base64: _bytes, referenceCapture: _reference, ...evidence } = capture;
    const evidencePath = path.join(directory, `${index + 1}.json`);
    await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    const typography = capture.layout?.typography;
    const styles = new Map<string, PixflowVisualTypographyStyle>();
    for (const sample of typography?.documentSamples ?? typography?.samples ?? []) {
      const values = { fontSize: sample.fontSize, fontFamily: sample.fontFamily, lineHeight: sample.lineHeight,
        ...(sample.fontWeight !== undefined ? { fontWeight: sample.fontWeight } : {}),
        ...(sample.color !== undefined ? { color: sample.color } : {}),
        ...(sample.contrast !== undefined ? { contrast: sample.contrast } : {}),
        ...(sample.backgroundLayers !== undefined ? { backgroundLayers: sample.backgroundLayers } : {}),
        ...(sample.compositingEffects !== undefined ? { compositingEffects: sample.compositingEffects } : {}) };
      const key = JSON.stringify(values);
      let group = styles.get(key);
      if (!group) { group = { ...values, count: 0, examples: [] }; styles.set(key, group); }
      group.count += 1;
      if (group.examples.length < 3) group.examples.push({ selector: sample.selector, text: sample.text,
        ...(sample.bounds ? { bounds: sample.bounds } : {}),
        ...(sample.parentBounds ? { parentBounds: sample.parentBounds } : {}) });
    }
    captures.push({ viewport: capture.viewport, width: capture.width, height: capture.height,
      scrollPosition: capture.scrollPosition, sha256: capture.sha256, path: filename, evidencePath,
      headings: capture.layout?.headings, headingsTruncated: capture.layout?.headingsTruncated,
      images: capture.layout?.images,
      typography: typography ? { rootFontSize: typography.rootFontSize,
        documentTextCount: typography.documentTextCount, documentTruncated: typography.documentTruncated,
        sampledTextCount: typography.documentSamples?.length ?? typography.samples.length,
        styles: Array.from(styles.values()) } : undefined });
  }
  return { ...result, captures };
}

export function captureAgentPage(endpoint: string, input: PixflowVisualCaptureRequest, outputDir: string) {
  return capturePage(fs, path, endpoint, input, outputDir);
}

// The serialized implementation has no module-scope dependencies.
export const AGENT_VISUAL_CAPTURE_SOURCE = `import * as fs from 'node:fs/promises';\nimport * as path from 'node:path';\nconst capturePage = ${capturePage.toString()};\nexport const captureAgentPage = (endpoint, input, outputDir) => capturePage(fs, path, endpoint, input, outputDir);\n`;
