import { describe, expect, it, vi } from 'vitest';

import { selectHtmlArtifactDeliverySource } from '../../src/artifacts/delivery';
import type { ProjectFile } from '../../src/types';

const completeHtml = '<!doctype html><html><head><title>Demo</title></head><body><main><h1>Persisted source</h1></main></body></html>';

function htmlFile(name: string, overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name,
    path: name,
    kind: 'html',
    mime: 'text/html',
    size: completeHtml.length,
    mtime: 100,
    ...overrides,
  };
}

describe('selectHtmlArtifactDeliverySource', () => {
  it('prefers the one valid HTML project file written during the run over a prose artifact wrapper', async () => {
    const file = htmlFile('stage-a/source/index.html');
    const readProjectFileText = vi.fn(async () => completeHtml);

    const result = await selectHtmlArtifactDeliverySource({
      artifact: {
        identifier: 'probajarealty-clone',
        title: 'Probajarealty clone',
        html: 'The complete page was saved to the project files above.',
      },
      candidateFileName: 'probajarealty-clone.html',
      currentRunFiles: [file],
      readProjectFileText,
    });

    expect(result).toMatchObject({
      kind: 'reuse_file',
      file,
      html: completeHtml,
      selectionReason: 'single_current_run_html',
    });
    expect(readProjectFileText).toHaveBeenCalledWith(file);
  });

  it('uses a manifest identifier match before an unrelated current-run HTML file', async () => {
    const matching = htmlFile('generated/final.html', {
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Final',
        entry: 'generated/final.html',
        renderer: 'html',
        exports: [],
        metadata: { identifier: 'probajarealty-clone' },
      },
    });
    const unrelated = htmlFile('notes.html');

    const result = await selectHtmlArtifactDeliverySource({
      artifact: {
        identifier: 'probajarealty-clone',
        html: 'Saved the finished document in the project.',
      },
      candidateFileName: 'probajarealty-clone.html',
      currentRunFiles: [unrelated, matching],
      readProjectFileText: async (file) => file === matching ? completeHtml : completeHtml.replace('Persisted', 'Notes'),
    });

    expect(result).toMatchObject({
      kind: 'reuse_file',
      file: matching,
      selectionReason: 'matching_project_file',
    });
  });

  it('persists a valid model-emitted document when no current-run file is valid', async () => {
    const result = await selectHtmlArtifactDeliverySource({
      artifact: { identifier: 'demo', html: completeHtml },
      candidateFileName: 'demo.html',
      currentRunFiles: [],
      readProjectFileText: async () => null,
    });

    expect(result).toEqual({
      kind: 'persist_artifact',
      html: completeHtml,
      selectionReason: 'valid_artifact',
    });
  });

  it('reuses an equivalent active project document when the runtime file diff is empty', async () => {
    const file = htmlFile('demo.html');
    const readProjectFileText = vi.fn(async () => `${completeHtml}\n`);

    const result = await selectHtmlArtifactDeliverySource({
      artifact: { identifier: 'demo', html: completeHtml },
      candidateFileName: 'demo-2.html',
      projectFiles: [file],
      currentRunFiles: [],
      readProjectFileText,
    });

    expect(result).toMatchObject({
      kind: 'reuse_file',
      file,
      html: completeHtml,
      selectionReason: 'matching_project_content',
    });
    expect(readProjectFileText).toHaveBeenCalledWith(file);
  });

  it('recovers one complete fenced HTML document from an invalid artifact body', async () => {
    const artifactHtml = ['Here is the completed page.', '```html', completeHtml, '```'].join('\n');
    const result = await selectHtmlArtifactDeliverySource({
      artifact: { identifier: 'demo', html: artifactHtml },
      candidateFileName: 'demo.html',
      currentRunFiles: [],
      readProjectFileText: async () => null,
    });

    expect(result).toEqual({
      kind: 'persist_artifact',
      html: completeHtml,
      selectionReason: 'recovered_fenced_document',
    });
  });

  it('recovers a complete document emitted immediately before a prose artifact wrapper', async () => {
    const artifactHtml = 'The complete document above is the delivered artifact.';
    const sourceText = [
      completeHtml,
      '<artifact identifier="demo" type="text/html">',
      artifactHtml,
      '</artifact>',
    ].join('\n');
    const result = await selectHtmlArtifactDeliverySource({
      artifact: { identifier: 'demo', html: artifactHtml },
      candidateFileName: 'demo.html',
      currentRunFiles: [],
      sourceText,
      readProjectFileText: async () => null,
    });

    expect(result).toEqual({
      kind: 'persist_artifact',
      html: completeHtml,
      selectionReason: 'recovered_preceding_document',
    });
  });

  it.each([
    ['leading prose', `Here is the page:\n${completeHtml}`],
    ['partial fragment', '<main><h1>Only a fragment</h1></main>'],
    ['trailing commentary', `${completeHtml}\nThe layout is complete.`],
    ['missing closing html', completeHtml.replace('</html>', '')],
    ['multiple fenced documents', ['```html', completeHtml, '```', '```html', completeHtml.replace('Demo', 'Second'), '```'].join('\n')],
  ])('classifies %s as an invalid HTML artifact', async (_label, artifactHtml) => {
    const result = await selectHtmlArtifactDeliverySource({
      artifact: { identifier: 'probajarealty-clone', html: artifactHtml },
      candidateFileName: 'probajarealty-clone.html',
      currentRunFiles: [],
      readProjectFileText: async () => null,
    });

    expect(result).toMatchObject({
      kind: 'invalid',
      failure: {
        code: 'HTML_ARTIFACT_INVALID',
        artifactIdentifier: 'probajarealty-clone',
        lifecycleMark: 'source_artifact_persist_failed',
      },
    });
  });

  it('does not guess between multiple valid unmatched current-run HTML files', async () => {
    const result = await selectHtmlArtifactDeliverySource({
      artifact: { identifier: 'demo', html: 'The files are ready.' },
      candidateFileName: 'demo.html',
      currentRunFiles: [htmlFile('one.html'), htmlFile('two.html')],
      readProjectFileText: async (file) => completeHtml.replace('Demo', file.name),
    });

    expect(result).toMatchObject({ kind: 'invalid' });
  });
});
