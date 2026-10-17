import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export type BricksHandoffArtifacts = {
  files: string[];
  json: Record<string, unknown>;
  text: Record<string, string>;
};

const JSON_ARTIFACTS: Array<[string, string]> = [
  ['sourceManifest', 'stage-a/source-manifest.json'],
  ['baselineResult', 'bricks-baseline.json'],
  ['baselinePayload', 'bricks-baseline-payload.json'],
  ['baselineGlobalClasses', 'bricks-baseline-global-classes.json'],
  ['qa', 'stage-b-qa.json'],
  ['deltaPacket', 'stage-b-delta-packet.json'],
  ['routeContract', 'stage-b-route-contract.json'],
  ['routeContextReport', 'route-context-report.json'],
  ['themeStyleContract', 'stage-b-theme-style-contract.json'],
  ['themeStyleHealth', 'stage-b-theme-style-health.json'],
  ['themeStylePayload', 'stage-b-theme-style-payload.json'],
  ['sourceMap', 'stage-b-source-map.json'],
  ['styleMap', 'stage-b-style-map.json'],
  ['sectionMap', 'stage-b-section-map.json'],
  ['conversionPlan', 'stage-b-conversion-plan.json'],
  ['mediaIntent', 'stage-b-media-intent.json'],
  ['headerPlan', 'stage-b-header-plan.json'],
  ['footerPlan', 'stage-b-footer-plan.json'],
  ['classPlan', 'stage-b-class-plan.json'],
  ['structureIr', 'stage-b-structure-ir.json'],
  ['structureReport', 'stage-b-structure-report.json'],
  ['styleOwnershipReport', 'stage-b-style-ownership-report.json'],
  ['classLifecycleReport', 'stage-b-class-lifecycle-report.json'],
  ['tokenGraphReport', 'stage-b-token-graph-report.json'],
  ['bricksSchemaCatalog', 'stage-b-bricks-schema-catalog.json'],
  ['bricksFocusedSchemas', 'stage-b-bricks-focused-schemas.json'],
  ['bricksSchemaValidation', 'stage-b-bricks-schema-validation.json'],
  ['bricksRuntimeKnowledge', 'stage-b-bricks-runtime-knowledge.json'],
  ['colorUsage', 'color-system-usage.json'],
];

const TEXT_ARTIFACTS: Array<[string, string]> = [
  ['conversionReport', 'conversion-report.md'],
  ['baselineReport', 'stage-b-baseline-report.md'],
  ['agentReport', 'stage-b-agent-report.md'],
  ['fidelityPlan', 'stage-b-fidelity-plan.md'],
];

// Pixflow-owned: collects converter evidence files for apply gating and
// multi-user project sync. The CLI can keep its historical internal filenames;
// the daemon exposes them as Bricks handoff artifacts.
export async function readBricksHandoffArtifacts(workspaceDir: string): Promise<BricksHandoffArtifacts> {
  const artifacts: BricksHandoffArtifacts = {
    files: [],
    json: {},
    text: {},
  };

  for (const [key, fileName] of JSON_ARTIFACTS) {
    const filePath = path.join(workspaceDir, fileName);
    if (!existsSync(filePath)) continue;
    const value = await readOptionalJson(filePath);
    if (value === undefined) continue;
    artifacts.json[key] = value;
    artifacts.files.push(fileName);
  }

  for (const [key, fileName] of TEXT_ARTIFACTS) {
    const filePath = path.join(workspaceDir, fileName);
    if (!existsSync(filePath)) continue;
    const value = await fs.readFile(filePath, 'utf8');
    artifacts.text[key] = value;
    artifacts.files.push(fileName);
  }

  return artifacts;
}

async function readOptionalJson(filePath: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}
