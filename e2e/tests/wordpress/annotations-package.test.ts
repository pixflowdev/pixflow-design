import { freeWordPressPackage, testWordPressPackages } from '@/vitest/wordpress-packages';
import { expect } from 'vitest';

testWordPressPackages('packages annotation authoring only in Pro and preserves core history contracts', async (pro) => {
  const core = await freeWordPressPackage();
  for (const path of ['assets/app/pixflow-annotations.js','assets/app/pixflow-annotations.css','src/Annotations/AnnotationsModule.php']) {
    expect(core.file('pixflow-ai/'+path)).toBeNull();
    if (pro) expect(pro.file('pixflow-design-pro/'+path)).not.toBeNull();
  }
  const free = await core.file('pixflow-ai/assets/app/pixflow-design-app.js')!.async('string');
  const paid = pro ? await pro.file('pixflow-design-pro/assets/app/pixflow-annotations.js')!.async('string') : '';
  // Shared translation catalogues contain labels for both editions. They are not
  // evidence that the executable annotation implementation leaked into Free.
  expect(free).not.toContain('getDisplayMedia');
  if (pro) expect(paid).toContain('ui.annotationToolbar.moveAnnotationToolbar');
  if (pro) expect(paid).toContain('ui.pageAnnotationControl.annotationComment');
  if (pro) expect(paid).toContain('getDisplayMedia');
  expect(free).toContain('page-annotation-batch');
  expect(free).toContain('Remove annotations attachment');
  expect(free).toContain('features/annotations/authorize');
});
