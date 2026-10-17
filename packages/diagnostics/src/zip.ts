import JSZip from "jszip";
import { createHash } from "node:crypto";

import { redactJsonValue, type RedactionOptions } from "./redaction.js";
import { buildManifest, buildMachineInfo, type DiagnosticsContext, type DiagnosticsManifest, type MachineInfo } from "./manifest.js";
import { collectLogSources, findCrashDumps, findMacOSCrashReports, type CollectedFile, type CrashDumpLookup, type CrashReportLookup, type LogSource } from "./sources.js";

const PLACEHOLDER_PREFIX = "; file unavailable: ";

export interface DiagnosticsExportInput {
  context: DiagnosticsContext;
  sources: LogSource[];
  redaction?: RedactionOptions;
  /** When provided, scan macOS crash reports matching these substrings. */
  crashReports?: CrashReportLookup;
  /** When provided, collect recent Electron/Chromium minidumps. */
  crashDumps?: CrashDumpLookup;
  attachments?: DiagnosticAttachment[];
  limits?: {
    /** Maximum redacted input bytes admitted before compression. */
    maxCollectedBytes?: number;
    /** Hard maximum for the final compressed ZIP. */
    maxZipBytes?: number;
  };
  privacy?: {
    /** Defaults to true for backwards compatibility. Pixflow sets false. */
    includeHostIdentity?: boolean;
  };
}

export interface DiagnosticAttachment {
  name: string;
  kind: "json" | "text";
  content: unknown;
  priority?: number | undefined;
  required?: boolean | undefined;
}

export interface DiagnosticsExportResult {
  zip: Buffer;
  manifest: DiagnosticsManifest;
  machineInfo: MachineInfo;
}

function placeholderForMissing(file: CollectedFile): string {
  return `${PLACEHOLDER_PREFIX}${file.error ?? "unknown error"}\n`;
}

function contentBuffer(content: string | Buffer): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
}

function hashContent(content: string | Buffer): string {
  return createHash("sha256").update(contentBuffer(content)).digest("hex");
}

function attachmentFile(attachment: DiagnosticAttachment, redaction: RedactionOptions): CollectedFile {
  const raw = attachment.kind === "json"
    ? JSON.stringify(redactJsonValue(attachment.content, redaction), null, 2)
    : String(redactJsonValue(String(attachment.content ?? ""), redaction));
  return {
    name: attachment.name,
    absolutePath: "inline://pixflow-diagnostics",
    content: raw,
    bytes: Buffer.byteLength(raw),
    priority: attachment.priority,
    required: attachment.required,
  };
}

function prepareCollectedFiles(files: CollectedFile[], maxCollectedBytes: number): CollectedFile[] {
  const ordered = files.map((file, index) => ({ file, index })).sort((a, b) => {
    if (Boolean(a.file.required) !== Boolean(b.file.required)) return a.file.required ? -1 : 1;
    return (b.file.priority ?? 50) - (a.file.priority ?? 50) || a.index - b.index;
  });
  let admitted = 0;
  for (const { file } of ordered) {
    const archiveContent = file.content ?? placeholderForMissing(file);
    const includedBytes = contentBuffer(archiveContent).byteLength;
    if (!file.required && admitted + includedBytes > maxCollectedBytes) {
      file.included = false;
      file.omissionReason = "collection_budget_exceeded";
      file.content = null;
      file.includedBytes = 0;
      continue;
    }
    if (file.required && admitted + includedBytes > maxCollectedBytes) {
      throw new Error(`Required diagnostics entry exceeds collection budget: ${file.name}`);
    }
    file.included = true;
    file.includedBytes = includedBytes;
    file.sha256 = hashContent(archiveContent);
    admitted += includedBytes;
  }
  return files;
}

function integrityDocument(files: CollectedFile[], limits: { maxCollectedBytes: number; maxZipBytes: number }): object {
  return {
    schema: "pixflow.diagnostics.integrity.v1",
    generatedAt: new Date().toISOString(),
    algorithm: "sha256",
    limits,
    entries: files.filter((file) => file.included).map((file) => ({
      name: file.name,
      bytes: file.includedBytes ?? 0,
      sha256: file.sha256,
    })),
    omitted: files.filter((file) => file.included === false).map((file) => ({
      name: file.name,
      reason: file.omissionReason,
    })),
  };
}

async function generateZip(
  collected: CollectedFile[],
  manifest: DiagnosticsManifest,
  machineInfo: MachineInfo,
  redaction: RedactionOptions,
  limits: { maxCollectedBytes: number; maxZipBytes: number },
): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of collected) {
    if (file.included === false) continue;
    zip.file(file.name, file.content ?? placeholderForMissing(file));
  }
  zip.file("summary/manifest.json", JSON.stringify(redactJsonValue(manifest, redaction), null, 2));
  zip.file("summary/machine-info.json", JSON.stringify(redactJsonValue(machineInfo, redaction), null, 2));
  zip.file("summary/archive-integrity.json", JSON.stringify(integrityDocument(collected, limits), null, 2));
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export async function buildDiagnosticsZip(input: DiagnosticsExportInput): Promise<DiagnosticsExportResult> {
  const redaction = input.redaction ?? {};
  const sources = [...input.sources];

  if (input.crashReports != null) {
    const crashes = await findMacOSCrashReports(input.crashReports);
    sources.push(...crashes);
  }

  if (input.crashDumps != null) {
    const dumps = await findCrashDumps(input.crashDumps);
    sources.push(...dumps);
  }

  const collected = prepareCollectedFiles([
    ...(await collectLogSources(sources, redaction)),
    ...(input.attachments ?? []).map((attachment) => attachmentFile(attachment, redaction)),
  ], input.limits?.maxCollectedBytes ?? Number.POSITIVE_INFINITY);
  const limits = {
    maxCollectedBytes: input.limits?.maxCollectedBytes ?? Number.MAX_SAFE_INTEGER,
    maxZipBytes: input.limits?.maxZipBytes ?? Number.MAX_SAFE_INTEGER,
  };
  const machineInfo = buildMachineInfo(redaction.username, input.privacy?.includeHostIdentity ?? true);
  let manifest = buildManifest(input.context, collected);
  let buffer = await generateZip(collected, manifest, machineInfo, redaction, limits);

  while (buffer.byteLength > limits.maxZipBytes) {
    const removable = collected
      .filter((file) => file.included !== false && !file.required)
      .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50) || (b.includedBytes ?? 0) - (a.includedBytes ?? 0))[0];
    if (!removable) throw new Error("Required diagnostics entries exceed compressed archive budget.");
    removable.included = false;
    removable.omissionReason = "compressed_archive_budget_exceeded";
    removable.content = null;
    removable.includedBytes = 0;
    removable.sha256 = undefined;
    manifest = buildManifest(input.context, collected);
    buffer = await generateZip(collected, manifest, machineInfo, redaction, limits);
  }

  return { zip: buffer, manifest, machineInfo };
}
