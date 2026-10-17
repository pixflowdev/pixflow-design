# Clean Recipe

Use this recipe when the brief is for a product, SaaS, plugin, app, workflow, dashboard, developer tool, finance product, productivity tool, or modern platform page that should feel calm, premium, useful, and easy to understand.

## Intent

Clean is a product-first method. The page should feel almost obvious: one clear promise, one crisp action path, one highly readable product proof moment, and enough supporting sections to make the offer credible. It is not a bare white page. It is a disciplined landing system where whitespace, type, surface contrast, and product evidence do the work.

This is a visual method, not a replacement for the active Pixflow Design skill. Follow the run brief, selected design system, uploaded references, craft rules, and active Pixflow skill first. Use Clean to shape page rhythm, product evidence, spacing, hierarchy, and component restraint.

## Core Rules

- Lead with a centered hero and a concrete outcome headline. The H1 should name the result, not just the category.
- Use a sparse header: brand, three to four links, one secondary account action, and one primary action.
- Keep the page light. Use white, soft grey, and one brand accent. A soft violet-blue accent is acceptable when the brief does not provide a brand color.
- Show product proof early. Use an inspectable product screen, code/editor mockup, app device, card stack, builder canvas, workflow panel, or dashboard slab.
- Use one product mockup large enough to inspect before adding many smaller cards.
- Make feature sections calm but substantial: large cards, clear titles, product micro-states, and useful copy.
- Use logos, pricing, testimonials, integrations, compatibility, or support proof when the brief calls for a commercial product page.
- Use one high-contrast trust or CTA moment only when it improves rhythm. Clean can use a dark band, a pale accent band, or a bordered proof band. Do not turn the whole page dark.
- Use sans-serif typography throughout. Do not use serif display headings, editorial mastheads, paper/report styling, brutalist outlines, scrapbook texture, or decorative collage.
- Never include `body` in a `font: inherit` reset. If resetting controls, use `button, input, textarea, select { font: inherit; }` and keep the body font declaration intact.
- Make the page feel like a real production landing page, not a theme demo.

## Signature Page Rhythm

1. Header: sticky or static white header, compact navigation, small primary action, and a subtle border only when useful.
2. Hero: centered H1, short lead paragraph, two compact CTAs, and optional trust/logos line.
3. Product proof: one large inspectable screen/device/card system with real labels, states, rows, tabs, or activity.
4. Primary capability section: two to four large feature cards. Cards can be asymmetric if all columns have enough width.
5. Secondary capability or tools section: smaller grid, integration chips, workflows, or product detail cards.
6. Commercial proof when relevant: pricing, testimonials, supported stack, compatibility, security, or social proof.
7. Final CTA: pale accent or white band, one clear action, and a restrained footer.

The sequence can adapt to the brief, but the first two product proof moments must be specific and inspectable.

## Visual DNA

- Background: white or near-white with soft grey section bands.
- Ink: near-black headings and medium neutral body copy.
- Accent: one crisp blue, violet-blue, or user-provided brand color. Use it for CTAs, small icons, active tabs, focus, and selected states.
- Typography: modern sans, confident weight, generous line-height, and centered hero rhythm. Use Poppins, Lato, Inter, Roboto, or system sans depending on available brand context.
- Shapes: 10px to 18px component radii, 20px to 28px hero/product panels, and pill CTAs.
- Product visuals: browser/editor windows, app screens, cards, dashboards, workflows, command palettes, pricing cards, testimonial cards, integration tiles, or device slabs.
- Shadows: subtle and broad. Borders should do most of the structure. Heavy drop shadows are a failure.
- Motion: optional subtle reveal or hover states only. The preview must remain fully visible with reduced motion or no JavaScript.

## Copy Direction

Use concrete product language: build, publish, automate, protect, review, refactor, connect, track, approve, launch, manage, sync, generate, monitor, collaborate, configure, install, deploy, recover, export, import, workflow, templates, stack, editor, workspace.

Avoid generic phrases like "unlock your potential", "supercharge everything", "seamless experience", "next generation", or "revolutionary platform". Avoid visible editorial words such as issue, folio, field notes, chapter, manifesto, atelier, archive, or publication unless the user explicitly asks for editorial.

## Composition Width

Use a 1600px desktop review viewport with a primary content max width around 1180px to 1280px for normal product pages, and up to 1440px for wide product mockups or logo/integration grids. Use the full page width deliberately; do not trap the page in a skinny center column below the hero.

Two-column sections are allowed only when each side remains readable. If a card, paragraph, or code/mockup panel becomes cramped, switch to one column, an asymmetric grid, or a wider product slab.

## Bricks Awareness

Stage A should output clean HTML/CSS only. Do not plan Bricks JSON here. Structure sections so Stage B can convert them reliably:

- Use semantic sections with clear class names.
- Keep decorative pseudo-elements optional; content must be real HTML.
- Prefer CSS grid/flex, stable aspect ratios, and clear section boundaries.
- Avoid brittle absolute-positioned text and fragile overlap.
- Keep the body font-family intact. Do not override it later with `font: inherit`.
- Put JavaScript behavior in scoped code blocks only when the active skill and user request require it. Clean usually needs no JavaScript.

## Final Critique Questions

- Does the first viewport communicate the product outcome within five seconds?
- Is the product proof specific enough to inspect, or is it generic card decoration?
- Does the page stay clean below the hero, or does it become a random grid of white cards?
- Are all desktop columns wide enough at 1600px?
- Does mobile preserve hierarchy without overflow?
- Is every claim believable from the user brief?
