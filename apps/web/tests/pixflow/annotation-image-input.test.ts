import { describe, expect, it } from 'vitest';
import type { AgentInfo, ChatAttachment } from '@open-design/contracts';
import { annotationImageInput, routeAnnotationScreenshots } from '../../src/pixflow/annotation-image-input';

describe('annotation image capabilities', () => {
  it('honours an explicit text-only model over the provider capability', () => {
    const agent = { inputCapabilities: { imageInput: true }, models: [
      { id: 'text', metadata: { inputCapabilities: { imageInput: false } } },
      { id: 'vision', metadata: { inputCapabilities: { imageInput: true } } },
    ] } as AgentInfo;
    expect(annotationImageInput(agent, 'text')).toBe(false);
    expect(annotationImageInput(agent, 'vision')).toBe(true);
    expect(annotationImageInput()).toBe(false);
    expect(annotationImageInput({ models: [] } as unknown as AgentInfo)).toBe(false);
  });
  it('reclassifies queued or historical screenshots after provider changes without changing ordinary attachments', () => {
    const files = [
      { name: 'annotation.png', kind: 'image', annotationScreenshot: true },
      { name: 'photo.png', kind: 'image' },
    ] as ChatAttachment[];
    const text = routeAnnotationScreenshots(files, false);
    expect(text[0]?.kind).toBe('file');
    expect(text[1]).toBe(files[1]);
    expect(routeAnnotationScreenshots(text, true)[0]?.kind).toBe('image');
    expect(files[0]?.kind).toBe('image');
  });
});
