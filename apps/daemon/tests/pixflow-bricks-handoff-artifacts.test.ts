import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readBricksHandoffArtifacts } from '../src/pixflow/bricks-handoff/artifacts.js';

describe('Pixflow Bricks handoff artifacts', () => {
  it('collects Stage B QA and agent report artifacts', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-artifacts-'));
    await fs.writeFile(
      path.join(workspace, 'stage-b-qa.json'),
      `${JSON.stringify({ status: 'passed', score: 100 }, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'stage-b-agent-report.md'),
      '# Stage B Agent Report\n\nQA passed.\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'stage-b-structure-ir.json'),
      `${JSON.stringify({ schema: 'pixflow.html_to_bricks.structure_ir.v1', scopes: [] }, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'stage-b-structure-report.json'),
      `${JSON.stringify({ schema: 'pixflow.html_to_bricks.structure_report.v1', ok: true }, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'stage-b-style-ownership-report.json'),
      `${JSON.stringify({ schema: 'pixflow.html_to_bricks.style_ownership.v1', ok: true }, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'stage-b-class-lifecycle-report.json'),
      `${JSON.stringify({ schema: 'pixflow.html_to_bricks.class_lifecycle.v1', ok: true }, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'stage-b-token-graph-report.json'),
      `${JSON.stringify({ schema: 'pixflow.html_to_bricks.token_graph.v1', ok: true }, null, 2)}\n`,
      'utf8',
    );

    const artifacts = await readBricksHandoffArtifacts(workspace);

    expect(artifacts.files).toContain('stage-b-qa.json');
    expect(artifacts.files).toContain('stage-b-agent-report.md');
    expect(artifacts.json.qa).toEqual({ status: 'passed', score: 100 });
    expect(artifacts.text.agentReport).toContain('Stage B Agent Report');
    expect(artifacts.files).toEqual(expect.arrayContaining([
      'stage-b-structure-ir.json',
      'stage-b-structure-report.json',
      'stage-b-style-ownership-report.json',
      'stage-b-class-lifecycle-report.json',
      'stage-b-token-graph-report.json',
    ]));
    expect(artifacts.json.structureReport).toMatchObject({ ok: true });
    expect(artifacts.json.styleOwnershipReport).toMatchObject({ ok: true });
    expect(artifacts.json.classLifecycleReport).toMatchObject({ ok: true });
    expect(artifacts.json.tokenGraphReport).toMatchObject({ ok: true });
  });
});
