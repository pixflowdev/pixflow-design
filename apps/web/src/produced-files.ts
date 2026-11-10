import type { ProjectFile } from './types';

/** Plugin inputs are staged by the runtime, never user deliverables.
 * Apply to saved output lists too, so historical false attributions stay hidden. */
export function isUserFacingProducedFile(file: ProjectFile): boolean {
  return ![file.name, file.path].some(value => value && /(?:^|[\\/])plugin-assets(?:[\\/]|$)/i.test(value));
}

// Implicit attribution is based on project-file timing or pre/post file-list
// diffs. User-created sketches can change during a run, but that does not make
// them assistant output files unless a run records them explicitly.
export function isImplicitProducedFileCandidate(file: ProjectFile): boolean {
  const lowerPath = (file.path ?? file.name).toLowerCase();
  return isUserFacingProducedFile(file) && !lowerPath.endsWith('.sketch.json');
}

export function filterImplicitProducedFiles(files: readonly ProjectFile[]): ProjectFile[] {
  return files.filter(isImplicitProducedFileCandidate);
}
