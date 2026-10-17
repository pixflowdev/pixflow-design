import type { WorkspaceSitemapBriefMemory } from "./sitemapContracts";

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 30);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function buildWorkspaceSitemapBriefMarkdown(
  brief: Partial<WorkspaceSitemapBriefMemory> | null | undefined,
): string {
  if (!brief) return "";
  const lines: string[] = ["# Sitemap Brief"];
  const addSection = (title: string, body: Array<string | undefined>) => {
    const entries = body.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
    if (entries.length) lines.push("", `## ${title}`, ...entries.map((item) => item.includes("\n") ? item : `- ${item}`));
  };
  const addListSection = (title: string, values: unknown) => {
    const entries = stringList(values);
    if (entries.length) lines.push("", `## ${title}`, ...entries.map((item) => `- ${item}`));
  };

  addSection("Business snapshot", [
    brief.businessName ? `Business: ${brief.businessName}` : undefined,
    brief.websiteType ? `Website type: ${brief.websiteType}` : undefined,
    brief.businessModel ? `Business model: ${brief.businessModel}` : undefined,
    brief.geography ? `Geography/market: ${brief.geography}` : undefined,
    brief.confidence ? `Brief confidence: ${brief.confidence}` : undefined,
  ]);
  addSection("Website purpose", [
    brief.primaryPurpose,
    brief.generationPreference ? `Generation preference: ${brief.generationPreference}` : undefined,
  ]);
  addSection("Audience and buying intent", [brief.audience]);
  addListSection("Offer and service map", brief.servicesOrOffers);
  addListSection("Conversion goals", brief.conversionGoals);
  addSection("Sitemap strategy", [brief.contentModel]);
  addSection("SEO and internal linking", [brief.seoStrategy, brief.localSeoNeeds]);
  addListSection("Required pages", brief.requiredPages);
  addListSection("Excluded pages", brief.excludedPages);
  addListSection("URLs / references", [...(brief.providedUrls ?? []), ...(brief.competitorsOrReferences ?? [])]);
  addListSection("Attached files", brief.attachedFiles);
  addListSection("Assumptions", brief.assumptions);
  addListSection("Open questions", brief.openQuestions);
  addListSection("Conflicts / stale notes", brief.staleOrConflictingNotes);
  return lines.length > 1 ? lines.join("\n") : "";
}

export function normalizeWorkspaceSitemapBriefMemory(
  value: WorkspaceSitemapBriefMemory | null | undefined,
): WorkspaceSitemapBriefMemory | null {
  if (!value || typeof value !== "object") return null;
  const sourceEvidence = Array.isArray(value.sourceEvidence)
    ? value.sourceEvidence
      .filter((source) => source && typeof source === "object" && typeof source.label === "string")
      .map((source, index) => ({
        id: optionalString(source.id) ?? `source-${index + 1}`,
        type: ["message", "url", "file", "form", "agent", "manual", "sitemap"].includes(String(source.type))
          ? source.type
          : "manual",
        label: source.label.trim(),
        ...(optionalString(source.value) ? { value: optionalString(source.value) } : {}),
        ...(optionalString(source.note) ? { note: optionalString(source.note) } : {}),
        ...(optionalString(source.addedAt) ? { addedAt: optionalString(source.addedAt) } : {}),
      }))
      .slice(0, 40)
    : [];
  const confidence = value.confidence === "high" || value.confidence === "medium" || value.confidence === "low"
    ? value.confidence
    : undefined;
  const normalized: WorkspaceSitemapBriefMemory = {
    version: 1,
    updatedAt: optionalString(value.updatedAt) ?? new Date().toISOString(),
    briefMarkdown: optionalString(value.briefMarkdown) ?? buildWorkspaceSitemapBriefMarkdown(value),
    ...(optionalString(value.businessName) ? { businessName: optionalString(value.businessName) } : {}),
    ...(optionalString(value.websiteType) ? { websiteType: optionalString(value.websiteType) } : {}),
    ...(optionalString(value.businessModel) ? { businessModel: optionalString(value.businessModel) } : {}),
    ...(optionalString(value.primaryPurpose) ? { primaryPurpose: optionalString(value.primaryPurpose) } : {}),
    ...(optionalString(value.audience) ? { audience: optionalString(value.audience) } : {}),
    ...(optionalString(value.geography) ? { geography: optionalString(value.geography) } : {}),
    ...(stringList(value.conversionGoals).length ? { conversionGoals: stringList(value.conversionGoals) } : {}),
    ...(stringList(value.servicesOrOffers).length ? { servicesOrOffers: stringList(value.servicesOrOffers) } : {}),
    ...(optionalString(value.contentModel) ? { contentModel: optionalString(value.contentModel) } : {}),
    ...(optionalString(value.seoStrategy) ? { seoStrategy: optionalString(value.seoStrategy) } : {}),
    ...(optionalString(value.localSeoNeeds) ? { localSeoNeeds: optionalString(value.localSeoNeeds) } : {}),
    ...(stringList(value.requiredPages).length ? { requiredPages: stringList(value.requiredPages) } : {}),
    ...(stringList(value.excludedPages).length ? { excludedPages: stringList(value.excludedPages) } : {}),
    ...(stringList(value.competitorsOrReferences).length ? { competitorsOrReferences: stringList(value.competitorsOrReferences) } : {}),
    ...(stringList(value.providedUrls).length ? { providedUrls: stringList(value.providedUrls) } : {}),
    ...(stringList(value.attachedFiles).length ? { attachedFiles: stringList(value.attachedFiles) } : {}),
    ...(stringList(value.assumptions).length ? { assumptions: stringList(value.assumptions) } : {}),
    ...(stringList(value.openQuestions).length ? { openQuestions: stringList(value.openQuestions) } : {}),
    ...(optionalString(value.generationPreference) ? { generationPreference: optionalString(value.generationPreference) } : {}),
    ...(confidence ? { confidence } : {}),
    ...(stringList(value.staleOrConflictingNotes).length ? { staleOrConflictingNotes: stringList(value.staleOrConflictingNotes) } : {}),
    ...(sourceEvidence.length ? { sourceEvidence } : {}),
  };
  return normalized.briefMarkdown || Object.keys(normalized).length > 3 ? normalized : null;
}

export function mergeWorkspaceSitemapBriefMemory(
  current: WorkspaceSitemapBriefMemory | null | undefined,
  incoming: Partial<WorkspaceSitemapBriefMemory> | null | undefined,
  options: { replaceStrategicLists?: boolean } = {},
): WorkspaceSitemapBriefMemory | null {
  if (!incoming || typeof incoming !== "object") return normalizeWorkspaceSitemapBriefMemory(current);
  const now = new Date().toISOString();
  const currentForLists = options.replaceStrategicLists ? null : current;
  const merged: WorkspaceSitemapBriefMemory = {
    ...(current ?? { version: 1, updatedAt: now, briefMarkdown: "" }),
    ...incoming,
    version: 1,
    updatedAt: now,
    conversionGoals: stringList([...(currentForLists?.conversionGoals ?? []), ...(incoming.conversionGoals ?? [])]),
    servicesOrOffers: stringList([...(currentForLists?.servicesOrOffers ?? []), ...(incoming.servicesOrOffers ?? [])]),
    requiredPages: stringList([...(currentForLists?.requiredPages ?? []), ...(incoming.requiredPages ?? [])]),
    excludedPages: stringList([...(currentForLists?.excludedPages ?? []), ...(incoming.excludedPages ?? [])]),
    competitorsOrReferences: stringList([...(currentForLists?.competitorsOrReferences ?? []), ...(incoming.competitorsOrReferences ?? [])]),
    providedUrls: stringList([...(currentForLists?.providedUrls ?? []), ...(incoming.providedUrls ?? [])]),
    attachedFiles: stringList([...(currentForLists?.attachedFiles ?? []), ...(incoming.attachedFiles ?? [])]),
    assumptions: stringList([...(currentForLists?.assumptions ?? []), ...(incoming.assumptions ?? [])]),
    openQuestions: stringList([...(currentForLists?.openQuestions ?? []), ...(incoming.openQuestions ?? [])]),
    staleOrConflictingNotes: stringList([...(currentForLists?.staleOrConflictingNotes ?? []), ...(incoming.staleOrConflictingNotes ?? [])]),
    sourceEvidence: [...(currentForLists?.sourceEvidence ?? []), ...(incoming.sourceEvidence ?? [])].slice(-40),
    briefMarkdown: optionalString(incoming.briefMarkdown)
      || optionalString(current?.briefMarkdown)
      || buildWorkspaceSitemapBriefMarkdown(incoming),
  };
  if (!optionalString(incoming.briefMarkdown) && !optionalString(current?.briefMarkdown)) {
    merged.briefMarkdown = buildWorkspaceSitemapBriefMarkdown(merged);
  }
  return normalizeWorkspaceSitemapBriefMemory(merged);
}
