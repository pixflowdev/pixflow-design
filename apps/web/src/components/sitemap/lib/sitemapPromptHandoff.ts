import type {
  WorkspaceSitemapGenerationPipeline,
  WorkspaceSitemapBriefMemory,
  WorkspaceSitemapRecipeAttachment,
} from "./sitemapContracts";
import { DIRECT_SITEMAP_PROMPT_HANDOFF_STORAGE_KEY } from "./sitemapConstants";
import { normalizeWorkspaceSitemapBriefMemory } from "./sitemapBriefMemory";

export interface DirectSitemapPromptHandoff {
  version: 1;
  createdAt: number;
  targetWpPostId: number;
  pipeline: WorkspaceSitemapGenerationPipeline;
  prompt: string;
  pageTitle?: string;
  sitemapBrief?: WorkspaceSitemapBriefMemory | null;
  sitemapBriefMarkdown?: string;
  stageChip?: {
    kind: "sitemap_brief";
    label: string;
    detail?: string;
  } | null;
  pageIntentContract?: Record<string, unknown> | null;
  pixflowDesignRecipe?: WorkspaceSitemapRecipeAttachment | null;
}

export function writeDirectSitemapPromptHandoff(
  handoff: DirectSitemapPromptHandoff,
): void {
  try {
    window.sessionStorage?.setItem(
      DIRECT_SITEMAP_PROMPT_HANDOFF_STORAGE_KEY,
      JSON.stringify(handoff),
    );
  } catch {
    // Browser storage can be unavailable; same-page handoff still works.
  }
}

export function readDirectSitemapPromptHandoff(
  normalizeKnownPostId: (value: unknown) => number,
): DirectSitemapPromptHandoff | null {
  try {
    const raw = window.sessionStorage?.getItem(
      DIRECT_SITEMAP_PROMPT_HANDOFF_STORAGE_KEY,
    );
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DirectSitemapPromptHandoff>;
    const targetWpPostId = normalizeKnownPostId(parsed.targetWpPostId);
    const pipeline =
      parsed.pipeline === "pixflow_library_page"
        ? "pixflow_library_page"
        : "pixflow_generation_stage_a";
    const promptValue =
      typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
    if (targetWpPostId <= 0 || !promptValue) {
      return null;
    }
    return {
      version: 1,
      createdAt: Number(parsed.createdAt ?? Date.now()),
      targetWpPostId,
      pipeline,
      prompt: promptValue,
      pageTitle:
        typeof parsed.pageTitle === "string" ? parsed.pageTitle.trim() : "",
      sitemapBrief: normalizeWorkspaceSitemapBriefMemory(parsed.sitemapBrief),
      sitemapBriefMarkdown:
        typeof parsed.sitemapBriefMarkdown === "string"
          ? parsed.sitemapBriefMarkdown.trim()
          : "",
      stageChip:
        parsed.stageChip &&
        typeof parsed.stageChip === "object" &&
        !Array.isArray(parsed.stageChip) &&
        (parsed.stageChip as { kind?: unknown }).kind === "sitemap_brief"
          ? {
              kind: "sitemap_brief",
              label:
                typeof (parsed.stageChip as { label?: unknown }).label === "string"
                  ? (parsed.stageChip as { label: string }).label.trim()
                  : "Sitemap brief",
              detail:
                typeof (parsed.stageChip as { detail?: unknown }).detail === "string"
                  ? (parsed.stageChip as { detail: string }).detail.trim()
                  : "",
            }
          : null,
      pageIntentContract:
        parsed.pageIntentContract &&
        typeof parsed.pageIntentContract === "object" &&
        !Array.isArray(parsed.pageIntentContract)
          ? (parsed.pageIntentContract as Record<string, unknown>)
          : null,
      pixflowDesignRecipe:
        parsed.pixflowDesignRecipe &&
        typeof parsed.pixflowDesignRecipe === "object" &&
        !Array.isArray(parsed.pixflowDesignRecipe)
          ? (parsed.pixflowDesignRecipe as WorkspaceSitemapRecipeAttachment)
          : null,
    };
  } catch {
    return null;
  }
}

export function clearDirectSitemapPromptHandoff(): void {
  try {
    window.sessionStorage?.removeItem(DIRECT_SITEMAP_PROMPT_HANDOFF_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
