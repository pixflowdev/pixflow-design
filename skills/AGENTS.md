# skills

This directory holds **functional skills** — capabilities the agent
invokes mid-task to do work on user input. Each skill is a folder with a
`SKILL.md` (frontmatter + body) and any side files (`assets/`,
`references/`, scripts, …) the workflow needs.

If the entry primarily *renders* a design artifact (deck, prototype,
image/video/audio template) it belongs under `../design-templates/`
instead. See `specs/current/skills-and-design-templates.md` for the
full split.

## Daemon plumbing

- Listed under `/api/skills` (functional only). User-imported skills
  shadow built-in entries with the same frontmatter `name`.
- Asset routes (`/api/skills/:id/example`, `/api/skills/:id/assets/*`)
  span both functional skills and design templates so existing
  `srcdoc`-rewritten URLs keep resolving after the split.
- The Settings → Skills panel surfaces this directory only; the
  EntryView Templates tab reads the design-templates registry instead.

## Adding a skill

1. Create `skills/<my-skill>/SKILL.md` with `name`, `description`,
   `triggers`, and `od.mode: utility` (or `design-system`) frontmatter.
2. Drop any side files alongside; reference them from the body using
   the relative-from-skill-root paths the daemon advertises in the
   skill preamble.
3. The daemon's lazy scanner picks the entry up on the next
   `/api/skills` request — no rebuild required during local dev.

## Pixflow product catalogue

`wordpress/resources/skill-editions.json` owns product packaging and compatibility.
Only rows with `status: bundled` ship in the owning Free or Pro plugin. `alias`
rows resolve their exact old ID/folder and SKILL.md reference to a same-edition
bundled target. `retired` entries and `excluded` templates are not executable
product skills, even when their source remains in this repository or a private
legacy bundle. Do not restore placeholder bodies through discovery or downloads.

The inherited installation stubs remain source history for the broader repository;
they are not a ready-to-use Pixflow library. New product skills must contain actual,
capability-aware guidance. Keep essential WordPress and builder references bundled
with their modules. The planned individually downloadable Pro library is separate
from personal skills and has not been implemented in this cleanup.

Personal skills, saved outputs and operational references must be preserved. Optional Pro library implementation and its development inventory are maintained privately in the Pro repository.
