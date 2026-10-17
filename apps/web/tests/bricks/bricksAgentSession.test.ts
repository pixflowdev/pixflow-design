import { describe, expect, it } from 'vitest';

import type { ProjectFile } from '../../src/types';
import {
  buildPixflowBricksAgentSessionPayload,
  buildPixflowBricksHandoffFiles,
  normalizeBuildInBricksCompatibilityPayload,
  selectBuildInBricksSourceAssetFiles,
} from '../../src/pixflow/bricks-agent-session';

function projectFile(
  path: string,
  kind: ProjectFile['kind'] = 'text',
  mime = 'text/plain',
): ProjectFile {
  const name = path.split('/').pop() || path;
  return {
    name,
    path,
    kind,
    mime,
    size: 100,
    mtime: 1,
  };
}

describe('buildPixflowBricksHandoffFiles', () => {
  it('keeps the Stage A composition DNA inside a crowded handoff', () => {
    const source = projectFile('stage-a/source/index.html', 'html', 'text/html');
    const compositionDna = projectFile('stage-a/composition-dna.md', 'text', 'text/markdown');
    const projectFiles = [
      ...Array.from({ length: 45 }, (_, index) => (
        projectFile(`plugin-assets/reference-${index}.md`, 'text', 'text/markdown')
      )),
      compositionDna,
      source,
    ];

    const handoff = buildPixflowBricksHandoffFiles(projectFiles, source);

    expect(handoff).toHaveLength(47);
    expect(handoff[0]?.path).toBe(source.path);
    expect(handoff[1]?.path).toBe(compositionDna.path);
    expect(handoff.some((file) => file.path === compositionDna.path)).toBe(true);
  });

  it('keeps Stage A source assets inside a crowded handoff', () => {
    const source = projectFile('stage-a/compiled/index.html', 'html', 'text/html');
    const photo = projectFile('stage-a/source/assets/team.jpg', 'binary', 'image/jpeg');
    const projectFiles = [
      ...Array.from({ length: 45 }, (_, index) => (
        projectFile(`plugin-assets/note-${index}.md`, 'text', 'text/markdown')
      )),
      photo,
      source,
    ];

    const handoff = buildPixflowBricksHandoffFiles(projectFiles, source);

    expect(handoff.some((file) => file.path === photo.path && file.role === 'asset')).toBe(true);
  });

  it('keeps canonical Build source assets inside a crowded compiled-source handoff', () => {
    const source = projectFile('build-source/compiled/index.html', 'html', 'text/html');
    const illustration = projectFile('build-source/source/assets/restaurant.svg', 'text', 'image/svg+xml');
    const projectFiles = [
      ...Array.from({ length: 80 }, (_, index) => (
        projectFile(`reports/report-${index}.md`, 'text', 'text/markdown')
      )),
      illustration,
      source,
    ];

    expect(selectBuildInBricksSourceAssetFiles(projectFiles)).toEqual([illustration]);
    const handoff = buildPixflowBricksHandoffFiles(projectFiles, source);

    expect(handoff.some((file) => file.path === illustration.path && file.role === 'asset')).toBe(true);
  });

  it('prioritizes every linked source-bundle asset before unrelated project files', () => {
    const source = projectFile('site/index.html', 'html', 'text/html');
    const styles = projectFile('site/styles.css', 'text', 'text/css');
    const script = projectFile('site/app.js', 'text', 'text/javascript');
    const font = projectFile('site/assets/brand.woff2', 'binary', 'font/woff2');
    const photo = projectFile('site/assets/hero.webp', 'binary', 'image/webp');
    const projectFiles = [
      ...Array.from({ length: 80 }, (_, index) => (
        projectFile(`reports/report-${index}.md`, 'text', 'text/markdown')
      )),
      styles,
      script,
      font,
      photo,
      source,
    ];

    const handoff = buildPixflowBricksHandoffFiles(projectFiles, source);

    expect(handoff).toHaveLength(64);
    expect(handoff.slice(0, 5).map((file) => file.path)).toEqual([
      source.path,
      styles.path,
      script.path,
      font.path,
      photo.path,
    ]);
    expect(handoff.filter((file) => file.role === 'asset').map((file) => file.path)).toEqual([
      font.path,
      photo.path,
    ]);
  });

  it('never reattaches generated handoff output from an earlier run', () => {
    const source = projectFile('index.html', 'html', 'text/html');
    const styles = projectFile('styles.css', 'text', 'text/css');
    const priorRun = projectFile(
      'pixflow/handoffs/bricks/runs/prior-run-summary.json',
      'text',
      'application/json',
    );

    const handoff = buildPixflowBricksHandoffFiles([source, styles, priorRun], source);

    expect(handoff.map((file) => file.path)).toEqual([source.path, styles.path]);
  });

  it('serializes the frozen scoped placement into the handoff session', () => {
    const source = projectFile('stage-a/source/index.html', 'html', 'text/html');
    const scopedPlacement = {
      version: 1 as const,
      mode: 'before' as const,
      targetId: 'consultation-root',
      targetLabel: 'Consultation',
      requestedTarget: 'consultation',
      source: 'semantic-section-role',
      postId: 539,
      pageFingerprint: 'page-v1',
      inventoryFingerprint: 'inventory-v1',
      warning: null,
    };

    const payload = buildPixflowBricksAgentSessionPayload({
      projectId: 'project-1',
      activeProjectFileName: source.path || source.name,
      projectFiles: [source],
      workspaceItem: null,
      workspaceItems: [],
      activeDraft: 'Add the section before consultation.',
      mode: 'design',
      targetPage: { id: 539, title: 'Placement proof', elementCount: 12, topSections: 3 },
      generationScope: 'section',
      scopedPlacement,
    });

    expect(payload.scopedPlacement).toEqual(scopedPlacement);
    expect(payload.targetContext).toEqual(expect.objectContaining({
      elementCount: 12,
      topSections: 3,
    }));
  });

  it('normalizes ordinary Build writes to semantic lifecycle fields only', () => {
    const source = projectFile('build-source/source/index.html', 'html', 'text/html');
    const payload = buildPixflowBricksAgentSessionPayload({
      projectId: 'project-build',
      activeProjectFileName: source.path || source.name,
      projectFiles: [source],
      workspaceItem: null,
      workspaceItems: [],
      activeDraft: 'Build an editorial services page.',
      mode: 'design',
      pipelineId: 'build-in-bricks',
      sourceContract: 'build-in-bricks-html-first',
      buildSource: {
        format: 'split_html_css_js',
        sourcePath: 'build-source/source/index.html',
        compiledPath: null,
        htmlPath: 'build-source/source/index.html',
        cssPath: 'build-source/source/styles.css',
        jsPath: 'build-source/source/script.js',
        sourceFidelityClone: false,
      },
      sourceEntryContractRevision: 'build-in-bricks-source-generation.v1',
      stageAContextRevision: 'route-1-native',
      stageASkillVersion: '1.0.0',
      stageAPageFingerprint: 'page-1',
      stageALifecycle: {
        stage_a_started: 10,
        prompt_build_start: 20,
        stage_a_finished: 30,
      },
    });

    expect(payload).toMatchObject({
      pipelineId: 'build-in-bricks',
      sourceContract: 'build-in-bricks-html-first',
      sourceEntryContractRevision: 'build-in-bricks-source-generation.v1',
      buildSource: expect.objectContaining({ sourcePath: 'build-source/source/index.html' }),
    });
    expect(payload).not.toHaveProperty('stageASource');
    expect(payload).not.toHaveProperty('stageAEntryContractRevision');
    expect(payload).not.toHaveProperty('stageAContextRevision');
    expect(payload).not.toHaveProperty('stageASkillVersion');
    expect(payload).not.toHaveProperty('stageAPageFingerprint');
    expect(payload).not.toHaveProperty('stageALifecycle');
    expect(payload).not.toHaveProperty('stageAEvidence');
  });

  it('does not promote historical Stage-A fields into an explicit new Build write', () => {
    const source = projectFile('build-source/source/index.html', 'html', 'text/html');
    const payload = buildPixflowBricksAgentSessionPayload({
      projectId: 'project-build-legacy-input',
      activeProjectFileName: source.path || source.name,
      projectFiles: [source],
      workspaceItem: null,
      workspaceItems: [],
      activeDraft: 'Build an editorial services page.',
      mode: 'design',
      pipelineId: 'build-in-bricks',
      sourceContract: 'build-in-bricks-html-first',
      stageASource: {
        format: 'single_html',
        sourcePath: 'stage-a/source/index.html',
        compiledPath: null,
        htmlPath: 'stage-a/source/index.html',
        cssPath: null,
        jsPath: null,
      },
      stageAContextRevision: 'legacy-route',
      stageALifecycle: { stage_a_started: 1 },
    });

    expect(payload).not.toHaveProperty('stageASource');
    expect(payload).not.toHaveProperty('buildSource');
    expect(payload).not.toHaveProperty('buildContextRevision');
    expect(payload).not.toHaveProperty('buildLifecycle');
  });

  it('normalizes a historical Build payload once before canonical runtime use', () => {
    const source = projectFile('stage-a/source/index.html', 'html', 'text/html');
    const base = buildPixflowBricksAgentSessionPayload({
      projectId: 'project-build-history',
      activeProjectFileName: source.path || source.name,
      projectFiles: [source],
      workspaceItem: null,
      workspaceItems: [],
      activeDraft: 'Continue the historical Build.',
      mode: 'design',
    });
    const normalized = normalizeBuildInBricksCompatibilityPayload({
      ...base,
      sourceContract: 'build-in-bricks-html-first',
      stageASource: {
        format: 'split_html_css_js',
        sourcePath: 'stage-a/source/index.html',
        compiledPath: null,
        htmlPath: 'stage-a/source/index.html',
        cssPath: 'stage-a/source/styles.css',
        jsPath: null,
      },
      stageAContextRevision: 'legacy-route',
      stageASkillVersion: '0.9.0',
      stageALifecycle: { stage_a_started: 10, stage_a_finished: 20 },
    });

    expect(normalized).toMatchObject({
      pipelineId: 'build-in-bricks',
      themeStylePolicy: 'inherit_effective',
      buildSource: expect.objectContaining({ sourcePath: 'stage-a/source/index.html' }),
      buildContextRevision: 'legacy-route',
      buildSkillVersion: '0.9.0',
      buildLifecycle: { source_generation_started: 10, source_generation_finished: 20 },
    });
    expect(normalized).not.toHaveProperty('stageASource');
    expect(normalized).not.toHaveProperty('stageAContextRevision');
    expect(normalized).not.toHaveProperty('stageALifecycle');
  });
});
