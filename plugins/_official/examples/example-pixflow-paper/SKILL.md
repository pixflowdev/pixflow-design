---
name: paper
description: Light document-workspace recipe with tactile paper surfaces, readable editor proof, calm product hierarchy, and conversion-safe responsive structure.
license: Pixflow
metadata:
  author: Pixflow Design
---

# Paper Design Skill

## Mission

Create a polished Pixflow Design Stage A artifact in the Paper visual language: a calm, light, document-workspace page with substantial editor/canvas proof, strong readability, and practical product copy.

## Non-Negotiables

- Default to light theme. Do not follow system dark mode. Use dark only for one pricing highlight, footer, or explicit user request.
- Build a real product page, not a simple paper card or beige editorial report.
- The first viewport needs a clear document/editor/workspace proof object near the fold.
- Use paper-like surfaces through off-white canvas, white frames, thin borders, document cards, sidebars, rows, comments, and workspace controls.
- Use soft blue sparingly as action or selected-state color.
- Keep all visible copy Pixflow-owned and product-specific.

## Required Page Evidence

Include at least five of these if the brief allows:

- Editor shell with document title, sidebar, active document, metadata, and body rows.
- AI suggestion or comment card attached to a real document area.
- Three foundation cards for writing, collaboration, and assistance.
- Six-feature grid with small product miniatures.
- Four-step workflow row.
- Use-case cards with PRD, docs, campaign, research, or wiki previews.
- Advantage list with icon dots and explanatory paragraphs.
- Pricing or package cards with one highlighted plan.
- Final CTA and multi-column footer.

## Layout Guardrails

- Desktop primary content should use about 1440px at a 1600px review viewport.
- Avoid skinny split columns. If a hero or intro split compresses the text, use a one-column intro and place the editor shell below.
- Feature cards must be wide enough for their miniature UI and copy. Do not create extra grid columns.
- Keep section intros readable: heading plus body should not be trapped in narrow sidebars unless the recipe intentionally creates a compact aside.

## Component Rules

- Navigation: thin, light, low-shadow, short links, compact primary CTA.
- Buttons: rounded, calm, high contrast; primary blue or near-black, secondary white with border.
- Cards: white on warm paper, thin border, 20px to 28px radius, low shadow.
- Editor shell: large rounded white frame, pale document canvas, sidebar, content pane, small labels, and readable UI fragments.
- Feature miniatures: CSS-built rows, search boxes, version dots, permission chips, code blocks, or collaboration cursors.
- Footer: quiet, multi-column, light by default. Dark footer is allowed only when it improves contrast and does not dominate.

## Accessibility And Quality

- Maintain WCAG 2.2 AA contrast, especially for muted grey text on paper backgrounds.
- Focus states must be visible.
- Controls need usable target sizes.
- Avoid tiny UI text in the editor shell unless it is decorative metadata; important labels must be readable.
- The artifact must work without JavaScript. Motion is optional and should be subtle.

## Anti-Patterns

- Beige-on-beige low contrast.
- Torn paper, coffee stains, taped scraps, scrapbook decoration, or fake aged paper.
- A generic dashboard full of metrics when the prompt asks for writing or documents.
- A centered hero followed by repeated equal cards with no editor proof.
- Dark theme takeover.
- Blue gradient SaaS drift.
- Emoji icons.
- Copy that talks about the recipe itself.

## Acceptance Criteria

- First viewport reads as Paper within a cropped screenshot.
- The editor/workspace proof is inspectable at desktop and simplified on mobile.
- Lower sections preserve the document-workspace language.
- Desktop composition feels deliberate at 1600px.
- Mobile has no horizontal overflow and no compressed controls.
- Final `stage-a-self-critique.md` explicitly checks philosophy, hierarchy, execution, specificity, restraint, responsiveness, and accessibility.
