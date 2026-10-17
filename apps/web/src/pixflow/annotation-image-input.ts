import type { AgentInfo } from '../types';
import type { ChatAttachment } from '@open-design/contracts';

/** Unknown and explicit text-only models receive a file reference, never forced image input. */
export function annotationImageInput(agent?: AgentInfo | null, model?: string | null): boolean {
  const option = model ? agent?.models?.find(item => item.id === model) : agent?.models?.find(item => item.default);
  return (option?.metadata?.inputCapabilities?.imageInput ?? agent?.inputCapabilities?.imageInput) === true;
}

export function routeAnnotationScreenshots(files: ChatAttachment[], supportsImages: boolean): ChatAttachment[] {
  return files.map(file => file.annotationScreenshot ? { ...file, kind: supportsImages ? 'image' : 'file' } : file);
}
