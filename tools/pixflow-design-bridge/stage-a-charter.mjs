/**
 * Filesystem Stage A charter for the standalone Pixflow bridge runtime.
 *
 * Build in Bricks inherits the OD v0.16.1 Prototype HTML decision rhythm and
 * keeps only the source-level differences needed for an editable conversion.
 * It intentionally lives in the compatibility runtime as MJS so packaged
 * bridge installs can execute it directly without a workspace build.
 */
export function renderStageABricksSlimCharter() {
  return `# Prototype HTML pipeline for Build in Bricks

Use the same creative pipeline, design freedom, planning behavior, skills, references, quality bar, and normal fail-soft completion behavior as Prototype HTML. HTML is the compiler source, not the creative ceiling.

## Prototype HTML workflow

- Read the brief and supplied evidence once, choose a precise design direction, build the complete requested artifact, then run one bounded self-check at the end.
- Design the real artifact for this business and audience. Preserve Prototype HTML's art direction, narrative flow, typography, imagery, whitespace, responsive recomposition, interaction craft, and anti-slop standard.
- When the user asks for a page, build the complete page, not one section. For a section or component, keep exactly that requested scope.
- Use supplied media first. When a specific stock-photography role materially improves the design, use the normal fail-soft stock lookup. Keep the returned remote stock image URL in the HTML and do not download it into the Stage A workspace.
- Keep the artifact when an optional quality check is inconclusive. Fix an obvious issue in place when useful, then finish. Do not run repeated screenshot, critique, or repair loops.

## The Bricks-friendly authoring difference

- Do not create a site header or footer unless the user explicitly requests one. Navigation chrome and announcement bars follow the same rule.

Preserve the Prototype HTML preset's class vocabulary when using its seed or layouts. Use clear descriptive classes for custom structures, but do not rename preset classes merely to impose another naming convention. The converter preserves source class names exactly.

Author normal standards-based HTML, CSS, and optional JavaScript with the creative techniques that best serve the design. The converter owns framework-variable mapping, Bricks elements and settings, fonts, media import, persistence, and canvas insertion. Do not inspect an active framework route or constrain the source around converter implementation details.

## Source handoff

Write the complete HTML to the exact index.html path supplied by the host, the authored CSS to its requested stylesheet path, and optional interaction JavaScript to its requested script path. End with a brief summary of the design direction and files written.`;
}

export function renderStageAAnsweredFormOverride(formId = 'discovery') {
  const safeFormId = String(formId || 'discovery').replace(/[^\w.-]/g, '') || 'discovery';
  return `## Form already answered — build now

The user already submitted the ${safeFormId} form in the active user turn.
Do not emit another question form, form schema, or form-asking prose.
Treat the submitted answers as the locked brief. Read the required workspace evidence once, build the complete \`index.html\` artifact, and perform one final self-check.`;
}
