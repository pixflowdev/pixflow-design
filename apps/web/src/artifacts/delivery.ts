import type { ProjectFile } from '../types';
import { resolveHtmlPointerArtifactTarget } from './pointer';
import {
  recoverHtmlArtifactFromPrecedingDocument,
  recoverHtmlDocumentFromMarkdownFence,
} from './recover';
import { validateHtmlArtifact } from './validate';

export type ArtifactDeliveryFailureCode =
  | 'HTML_ARTIFACT_INVALID'
  | 'ARTIFACT_PERSISTENCE_FAILED';

export interface ArtifactDeliveryFailure {
  code: ArtifactDeliveryFailureCode;
  artifactIdentifier: string;
  validationReason: string;
  detail: string;
  lifecycleMark: 'source_artifact_persist_failed';
}

interface HtmlArtifactLike {
  html: string;
  identifier?: string;
  title?: string;
}

interface SelectHtmlArtifactDeliverySourceInput {
  artifact: HtmlArtifactLike;
  candidateFileName: string;
  projectFiles?: ProjectFile[];
  currentRunFiles: ProjectFile[];
  sourceText?: string;
  readProjectFileText: (file: ProjectFile) => Promise<string | null>;
}

export type HtmlArtifactDeliverySourceDecision =
  | {
      kind: 'reuse_file';
      file: ProjectFile;
      html: string;
      selectionReason: 'pointer_target' | 'matching_project_file' | 'single_current_run_html' | 'matching_project_content';
    }
  | {
      kind: 'persist_artifact';
      html: string;
      selectionReason: 'valid_artifact' | 'recovered_preceding_document' | 'recovered_fenced_document';
    }
  | {
      kind: 'invalid';
      failure: ArtifactDeliveryFailure;
    };

type ValidProjectHtml = { file: ProjectFile; html: string };

/**
 * Select the canonical HTML delivered by one completed run.
 *
 * Files written during the run are authoritative because capable agents are
 * instructed to persist source directly and may finish with a prose artifact
 * pointer. Model-emitted HTML and bounded recovery are fallbacks. Callers must
 * pass only files newly written by this run; accepting the whole project would
 * risk reviving a stale artifact from an earlier attempt.
 */
export async function selectHtmlArtifactDeliverySource({
  artifact,
  candidateFileName,
  currentRunFiles,
  projectFiles = currentRunFiles,
  sourceText,
  readProjectFileText,
}: SelectHtmlArtifactDeliverySourceInput): Promise<HtmlArtifactDeliverySourceDecision> {
  const projectHtmlFiles = projectFiles.filter(isHtmlProjectFile);
  const htmlFiles = currentRunFiles.filter(isHtmlProjectFile);
  const pointerTarget = resolveHtmlPointerArtifactTarget({
    content: artifact.html,
    candidateFileName,
    projectFiles: projectHtmlFiles,
  });
  if (pointerTarget) {
    const pointerFile = projectHtmlFiles.find(
      (file) => (file.path || file.name) === pointerTarget || file.name === pointerTarget,
    );
    const validPointer = pointerFile
      ? await readValidProjectHtml(pointerFile, readProjectFileText)
      : null;
    if (validPointer) {
      return { kind: 'reuse_file', ...validPointer, selectionReason: 'pointer_target' };
    }
  }

  const matchingFiles = matchingCurrentRunFiles(artifact, candidateFileName, htmlFiles);
  for (const file of matchingFiles) {
    const valid = await readValidProjectHtml(file, readProjectFileText);
    if (valid) {
      return { kind: 'reuse_file', ...valid, selectionReason: 'matching_project_file' };
    }
  }

  const remainingFiles = htmlFiles.filter((file) => !matchingFiles.includes(file));
  const validRemaining: ValidProjectHtml[] = [];
  for (const file of remainingFiles) {
    const valid = await readValidProjectHtml(file, readProjectFileText);
    if (valid) validRemaining.push(valid);
  }
  if (validRemaining.length === 1) {
    return {
      kind: 'reuse_file',
      ...validRemaining[0]!,
      selectionReason: 'single_current_run_html',
    };
  }

  const directValidation = validateCompleteHtmlDocument(artifact.html);
  if (directValidation.ok) {
    const normalizedArtifactHtml = artifact.html.replace(/^\uFEFF/, '').trim();
    const currentRunFileNames = new Set(htmlFiles.map((file) => file.path || file.name));
    const equivalentProjectCandidates = projectHtmlFiles
      .filter((file) => !currentRunFileNames.has(file.path || file.name))
      .sort((left, right) => right.mtime - left.mtime);
    for (const file of equivalentProjectCandidates) {
      const valid = await readValidProjectHtml(file, readProjectFileText);
      if (valid?.html === normalizedArtifactHtml) {
        return {
          kind: 'reuse_file',
          ...valid,
          selectionReason: 'matching_project_content',
        };
      }
    }
    return {
      kind: 'persist_artifact',
      html: normalizedArtifactHtml,
      selectionReason: 'valid_artifact',
    };
  }

  const precedingDocument = recoverHtmlArtifactFromPrecedingDocument({
    artifactHtml: artifact.html,
    identifier: artifact.identifier,
    sourceText,
  });
  if (precedingDocument && validateCompleteHtmlDocument(precedingDocument).ok) {
    return {
      kind: 'persist_artifact',
      html: precedingDocument,
      selectionReason: 'recovered_preceding_document',
    };
  }

  const fencedDocument = recoverHtmlDocumentFromMarkdownFence(artifact.html);
  if (fencedDocument && validateCompleteHtmlDocument(fencedDocument).ok) {
    return {
      kind: 'persist_artifact',
      html: fencedDocument,
      selectionReason: 'recovered_fenced_document',
    };
  }

  const identifier = String(artifact.identifier || artifact.title || candidateFileName || 'untitled').trim();
  const validationReason = directValidation.reason;
  return {
    kind: 'invalid',
    failure: {
      code: 'HTML_ARTIFACT_INVALID',
      artifactIdentifier: identifier,
      validationReason,
      detail: `The HTML source artifact "${identifier}" is invalid: ${validationReason}. Retry source generation; conversion has not started.`,
      lifecycleMark: 'source_artifact_persist_failed',
    },
  };
}

function isHtmlProjectFile(file: ProjectFile): boolean {
  const name = String(file.path || file.name || '').toLowerCase();
  const mime = String(file.mime || '').toLowerCase();
  const manifestKind = String(file.artifactManifest?.kind || '').toLowerCase();
  return file.kind === 'html'
    || manifestKind === 'html'
    || mime.includes('html')
    || /\.html?$/.test(name);
}

function matchingCurrentRunFiles(
  artifact: HtmlArtifactLike,
  candidateFileName: string,
  files: ProjectFile[],
): ProjectFile[] {
  const identifier = String(artifact.identifier || '').trim();
  return files
    .filter((file) => (
      (identifier && file.artifactManifest?.metadata?.identifier === identifier)
      || file.name === candidateFileName
      || file.path === candidateFileName
    ))
    .sort((left, right) => right.mtime - left.mtime);
}

async function readValidProjectHtml(
  file: ProjectFile,
  readProjectFileText: (file: ProjectFile) => Promise<string | null>,
): Promise<ValidProjectHtml | null> {
  const html = await readProjectFileText(file);
  if (html === null || !validateCompleteHtmlDocument(html).ok) return null;
  return { file, html: html.replace(/^\uFEFF/, '').trim() };
}

function validateCompleteHtmlDocument(content: string):
  | { ok: true }
  | { ok: false; reason: string } {
  const validation = validateHtmlArtifact(content);
  if (!validation.ok) return validation;
  if (!/<\/html\s*>\s*$/i.test(content)) {
    return { ok: false, reason: 'content is missing a closing </html> tag or has trailing non-document commentary' };
  }
  return { ok: true };
}
