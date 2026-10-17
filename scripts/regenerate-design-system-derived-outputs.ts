import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseDesignSystemProjectManifest } from '../design-systems/_schema/manifest.schema.ts';
import {
  renderDesignTokensJson,
  renderTailwindV4Css,
  type DerivedDesignTokenBinding,
  type DerivedDesignTokenReport,
} from '../packages/contracts/src/design-systems/derived-token-outputs.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const designSystemsRoot = path.join(repoRoot, 'design-systems');

type TokenContractReport = DerivedDesignTokenReport & {
  tokens: DerivedDesignTokenBinding[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTokenContractReport(value: unknown, sourcePath: string): TokenContractReport {
  if (!isRecord(value) || typeof value.generatedAt !== 'string' || !isRecord(value.summary) || !Array.isArray(value.tokens)) {
    throw new Error(`${sourcePath} is not a valid token-contract report`);
  }
  const tokens = value.tokens.map((token, index): DerivedDesignTokenBinding => {
    if (
      !isRecord(token)
      || typeof token.name !== 'string'
      || typeof token.layer !== 'string'
      || typeof token.value !== 'string'
      || typeof token.confidence !== 'string'
      || typeof token.reason !== 'string'
      || !Array.isArray(token.sources)
      || !token.sources.every((source) => typeof source === 'string')
      || (token.sourceName !== undefined && typeof token.sourceName !== 'string')
    ) {
      throw new Error(`${sourcePath} has an invalid token at index ${index}`);
    }
    return {
      name: token.name,
      layer: token.layer,
      value: token.value,
      confidence: token.confidence,
      reason: token.reason,
      sources: token.sources,
      ...(token.sourceName === undefined ? {} : { sourceName: token.sourceName }),
    };
  });
  return { generatedAt: value.generatedAt, summary: value.summary, tokens };
}

function tokenNamesFromRoot(tokensCss: string): Array<{ name: string }> {
  const names: Array<{ name: string }> = [];
  const seen = new Set<string>();
  for (const rootMatch of tokensCss.matchAll(/:root(?!\[)\s*\{([\s\S]*?)\}/gu)) {
    const rootBlock = rootMatch[1] ?? '';
    for (const match of rootBlock.matchAll(/^\s*(--[a-z0-9_-]+)\s*:/gimu)) {
      const name = match[1];
      if (name === undefined) continue;
      if (!seen.has(name)) {
        seen.add(name);
        names.push({ name });
      }
    }
  }
  return names;
}

async function regenerate(): Promise<void> {
  const entries = await readdir(designSystemsRoot, { withFileTypes: true });
  let designTokensWritten = 0;
  let tailwindWritten = 0;

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name === '_schema') continue;
    const brandRoot = path.join(designSystemsRoot, entry.name);
    const manifestPath = path.join(brandRoot, 'manifest.json');
    let manifestText: string;
    try {
      manifestText = await readFile(manifestPath, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseDesignSystemProjectManifest(manifestText);
    if (!parsed.ok) throw new Error(`${manifestPath}: ${parsed.errors.join('; ')}`);
    const manifest = parsed.manifest;

    let report: TokenContractReport | undefined;
    if (manifest.files.designTokens !== undefined) {
      if (manifest.sourceFiles?.report === undefined) {
        throw new Error(`${manifestPath}: files.designTokens requires sourceFiles.report`);
      }
      const reportPath = path.join(brandRoot, manifest.sourceFiles.report);
      report = parseTokenContractReport(JSON.parse(await readFile(reportPath, 'utf8')) as unknown, reportPath);
      await writeFile(
        path.join(brandRoot, manifest.files.designTokens),
        renderDesignTokensJson({ bindings: report.tokens, report }),
        'utf8',
      );
      designTokensWritten += 1;
    }

    if (manifest.files.tailwind !== undefined) {
      const tokensCss = await readFile(path.join(brandRoot, manifest.files.tokens), 'utf8');
      await writeFile(
        path.join(brandRoot, manifest.files.tailwind),
        renderTailwindV4Css(tokenNamesFromRoot(tokensCss)),
        'utf8',
      );
      tailwindWritten += 1;
    }
  }

  console.log(`Regenerated ${designTokensWritten} design-tokens.json files and ${tailwindWritten} tailwind-v4.css files.`);
}

await regenerate();
