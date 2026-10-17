import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, it } from 'vitest';

it('packages annotation authoring only in Pro and preserves core history contracts', async () => {
  const root = new URL('../../../', import.meta.url);
  const core = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-ai.zip', root)));
  const pro = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-design-pro.zip', root)));
  for (const path of ['assets/app/pixflow-annotations.js','assets/app/pixflow-annotations.css','src/Annotations/AnnotationsModule.php']) {
    expect(core.file('pixflow-ai/'+path)).toBeNull();
    expect(pro.file('pixflow-design-pro/'+path)).not.toBeNull();
  }
  const free = await core.file('pixflow-ai/assets/app/pixflow-design-app.js')!.async('string');
  const paid = await pro.file('pixflow-design-pro/assets/app/pixflow-annotations.js')!.async('string');
  // Shared translation catalogues contain labels for both editions. They are not
  // evidence that the executable annotation implementation leaked into Free.
  expect(free).not.toContain('getDisplayMedia');
  expect(paid).toContain('ui.annotationToolbar.moveAnnotationToolbar');
  expect(paid).toContain('ui.pageAnnotationControl.annotationComment');
  expect(paid).toContain('getDisplayMedia');
  expect(free).toContain('page-annotation-batch');
  expect(free).toContain('Remove annotations attachment');
  expect(free).toContain('features/annotations/authorize');
});
