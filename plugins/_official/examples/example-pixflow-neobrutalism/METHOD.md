# Neobrutalism Recipe

Use this recipe when the brief asks for a bold campaign page, creator product, launch page, digital guide, pricing page, community surface, dashboard, or product landing page that should feel loud, graphic, confident, and intentionally raw.

## Intent

Create a page that rejects safe generic minimalism without becoming chaotic. The result should be unmistakably neobrutalist: thick black outlines, flat color surfaces, hard offset shadows, vivid accents, and blunt hierarchy. The look can be playful and confrontational, but the structure must remain accessible, responsive, and easy to scan.

This is a visual method, not a replacement for the active Pixflow Design skill. Follow the run brief, uploaded references, selected design system, craft rules, and active Pixflow skill first. Use this recipe to shape palette, border weight, shadow language, layout weight, interaction states, and anti-polish.

## Core Rules

- Use thick structural borders, normally 2px to 3px solid near-black.
- Use hard offset shadows with no blur. Shadows should feel like paper-cut layers, not soft elevation.
- Keep one shadow direction across the whole page, usually down and right.
- Use flat fills only. No gradients, glassmorphism, blur cards, frosted panels, soft glow blobs, or subtle beige-only palettes.
- Use vivid yellow and violet as the main accent pair, with status colors only where they represent state.
- Make typography heavy and direct. Headings can be oversized and blunt, but body text must remain readable.
- Let components feel chunky: badges, buttons, cards, input fields, stats, testimonials, price cards, and feature rows should carry the same border/shadow language.
- Every loud visual element needs a purpose: action, proof, pricing, reading rhythm, state, quote, artifact, or section break.
- Avoid equal emphasis everywhere. Neobrutalism fails when every block shouts at the same volume.
- Leave enough space for borders and shadows. Do not let hard shadows collide or create accidental cramped gutters.
- Never include `body` in a `font: inherit` reset. If resetting controls, use `button, input, textarea, select { font: inherit; }` and keep the body font declaration intact.

## Signature Page Rhythm

1. Compact nav with hard-border brand mark, blunt links, and one raised CTA.
2. Hero with a loud badge, oversized promise, clear lead, chunky CTA, and one substantial artifact or offer card.
3. Problem/proof split using two or three heavy cards with clear contrast.
4. Benefits or lesson grid with each item as a bordered block, not a delicate icon card.
5. Artifact, book, product, dashboard, pricing, or package preview with strong physical shadow.
6. Social proof, author, customer, or use-case section with short direct copy.
7. Final saturated CTA panel that keeps the border/shadow treatment and does not switch into generic SaaS polish.
8. FAQ/footer with the same flat graphic system, not a soft corporate footer.

## Visual DNA

- Background: off-white or warm light surface.
- Text: deep navy-black or near-black, never pure low-contrast grey.
- Primary accent: saturated yellow for action, highlight, or block emphasis.
- Secondary accent: deep violet for contrast, links, or alternative emphasis.
- Status colors: green, amber, and red only for actual states.
- Typography: Inter-style sans for display and body; JetBrains Mono-style for technical labels, counters, and code-like details.
- Shape: hard-edged or lightly rounded. Avoid pill overdose unless the source brief asks for it.
- Shadows: solid black, offset 4px to 8px, no blur.
- Motion: optional micro-interactions that compress or shift hard shadows. No parallax or decorative animation fields.

## Layout Guardrails

- Desktop can use large blocks, offset cards, split hero, stacked panels, or asymmetrical section rhythm.
- Use hard section breaks. A neobrutalist page should not feel like one long soft scroll.
- Keep content blocks wide enough for their copy. Thick borders and shadows reduce usable internal space.
- Do not create skinny multi-column cards just to fill a grid.
- Use hierarchy: one dominant card or headline per section, then supporting blocks.
- Reuse the visual language across lower sections. Do not make only the hero neobrutalist.

## Responsive Rules

- Mobile stacks cards in content priority order and preserves shadow-safe spacing.
- Large hard shadows should shrink slightly on mobile to avoid horizontal overflow.
- CTA buttons should remain at least 44px tall.
- Long headings must wrap intentionally; avoid single words overflowing narrow screens.
- Cards with body text need enough internal padding after border and shadow.
- If using decorative off-grid shapes, hide or simplify them before they cause mobile overflow.

## Bricks Awareness

Stage A should output clean HTML/CSS only. Do not plan Bricks JSON here. However, structure sections so Stage B can convert them reliably:

- Use semantic sections and clear class names such as `brutal-hero`, `brutal-card`, `hard-shadow`, `offer-card`, `proof-grid`, `brutal-faq`, and `brutal-cta`.
- Keep borders and shadows in reusable classes or variables, not random one-off inline styles.
- Avoid absolute-positioned content that carries meaning. Decorative shapes may be optional.
- Content must be real HTML: headings, paragraphs, lists, buttons, labels, cards, and rows.
- JavaScript is usually unnecessary. If used, it must be scoped and content must stay visible without it.

## Copy Direction

Use blunt, concrete, memorable wording: ship, build, launch, prove, fix, bold, loud, direct, no fluff, hard edge, clear offer, real proof, checklist, playbook, sprint, kit, pack, teardown, audit, maker, studio.

Avoid vague SaaS filler: "unlock potential", "seamless experience", "supercharge everything", "revolutionize", "all-in-one solution", and unsupported metrics or testimonials.
