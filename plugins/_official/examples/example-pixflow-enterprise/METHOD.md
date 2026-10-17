# Enterprise Recipe

Use this recipe when the brief asks for a serious product, operations platform, workflow automation tool, data app, AI operations system, admin console, or enterprise SaaS landing page that should feel high-trust, structured, and product-led.

## Intent

Create a page that looks like a real enterprise product surface, not a generic SaaS template. The first viewport should communicate the business outcome and show a believable workflow/product system: dashboards, automations, queues, integrations, audit states, data sync, approvals, or AI-assisted operations.

This is a visual method, not a replacement for the active Pixflow Design skill. Follow the run brief, uploaded references, selected design system, craft rules, and active Pixflow skill first. Use this recipe to shape palette, product proof, section rhythm, enterprise information density, and motion.

## Core Rules

- Lead with a dark green control surface, usually the header and first hero band.
- Use the warm enterprise canvas only for light sections and product cards. Do not make the entire page dark.
- Use orange as the action accent: primary CTA, active module, key connector, selected workflow node, or one chart highlight.
- Use display typography that feels compressed and authoritative. Oswald-style headings are appropriate; body copy remains readable and human.
- The hero must include product evidence: a dashboard, workflow builder, data panel, integration map, operational command center, or automation canvas.
- A workflow, drag-and-drop, or automation diagram should appear at least once in the page. It must use labels and states, not abstract floating rectangles.
- Use high-contrast enterprise cards with explicit state labels: Active, Running, Queued, Synced, Approved, Error, Secure, Live, or Scheduled.
- Include trust and operational proof: uptime, compliance, audit logs, SSO, integrations, response time, data volume, or team workflow outcomes.
- Keep cards and panels aligned to a strict grid. Enterprise pages can be dense, but they cannot be cluttered.
- Avoid fake complexity. Every chart, table, node, and metric needs a clear role.
- Never include `body` in a `font: inherit` reset. If resetting controls, use `button, input, textarea, select { font: inherit; }` and keep the body font declaration intact.

## Entrance Motion

Enterprise supports purposeful entrance animation when the artifact needs a premium run-time feel.

- Use simple reveal motion: opacity plus a short vertical or horizontal translate.
- Stagger product cards, workflow nodes, and proof tiles lightly. Keep the whole sequence under one second.
- Motion should reinforce structure: hero copy first, product surface second, supporting cards after.
- Add `prefers-reduced-motion` handling.
- Never hide core content permanently if JavaScript fails. The static screenshot must still show the page.
- Do not use parallax, scroll-jacking, auto-rotators, complex physics, decorative particle fields, or motion that changes layout.

## Signature Page Rhythm

1. Dark green top navigation with brand, compact links, login, and one orange CTA.
2. Dark green hero with oversized display headline, one clear lead, two actions, and a large product/workflow dashboard.
3. Logo or trust strip on warm canvas, kept restrained and aligned.
4. Problem/proof band with concrete operational metrics and short explanation.
5. Platform capability section: six cards or a split grid covering speed, security, analytics, scale, integrations, and AI automation.
6. Workflow builder or solution tabs showing drag-and-drop modules, active states, checklist rows, connectors, and an inspectable module panel.
7. Operational visibility/product proof section with a large dashboard and supporting value points.
8. Testimonials or enterprise proof cards.
9. Pricing, implementation, or security section if relevant to the brief.
10. Final dark or warm CTA that uses the same green/orange language and does not switch into an unrelated visual style.

## Visual DNA

- Background: deep teal/green hero and footer, warm stone canvas for main page.
- Surfaces: white or warm light cards with quiet borders; dark panels for command centers.
- Ink: near-black text on light sections, white/teal text on dark sections.
- Accent: orange for action and selected state; status colors only for actual status.
- Typography: compressed display headings; calm sans body; monospace labels for status, URLs, and operational metadata.
- Shapes: 4px to 8px radius for enterprise controls, 12px to 18px for large product panels.
- Product visuals: dashboards, tables, automation nodes, timelines, triggers, queues, activity feeds, and integration cards.
- Icons: simple functional line icons or letter marks. Do not use emoji.
- Motion: short, structural reveals and hover feedback only.

## Copy Direction

Use concrete enterprise language: automate, sync, approve, monitor, route, trigger, enrich, audit, govern, deploy, integrate, queue, pipeline, workflow, data layer, operations, SSO, SLA, compliance, logs, permissions, run history.

Avoid vague lines like "unlock potential", "supercharge everything", "seamless experience", "all-in-one solution", "game changer", "team superpowers", or claims without context. If metrics are not supplied by the user, make them clearly illustrative.

## Responsive Rules

- Desktop: use a wide product surface. Do not center a narrow dashboard in a huge empty hero.
- Desktop: if using a dashboard mockup, include at least two readable content zones: metrics plus activity, workflow plus detail panel, or table plus graph.
- Tablet: keep the hero product surface below the copy; preserve readable card labels.
- Mobile: stack product panels in task order and remove decorative side panels first.
- Navigation collapses before links wrap.
- Long enterprise labels must wrap or truncate gracefully with accessible full text nearby.
- Workflow diagrams collapse into ordered cards on small screens; connectors may simplify, but labels remain.
- CTAs should remain 44px tall and should not overflow.
- Entrance motion must not delay content visibility on mobile.

## Bricks Awareness

Stage A should output clean HTML/CSS only. Do not plan Bricks JSON here. However, structure sections so Stage B can convert them reliably:

- Use semantic sections and clear class names such as `enterprise-hero`, `workflow-board`, `ops-dashboard`, `metric-card`, `integration-card`, and `security-panel`.
- Prefer CSS grid/flex and stable section wrappers over absolute positioning.
- Keep product mockup content as real HTML labels, rows, lists, and buttons.
- Decorative glows, connectors, and reveal wrappers must be optional; content must remain readable without them.
- If JavaScript is used for reveal, keep it scoped and place functional library needs in page settings during Stage B.
