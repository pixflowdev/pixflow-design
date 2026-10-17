# Portable skills and personal resources

**Parent:** [spec.md](spec.md) · **Related:** [architecture](architecture.md), [agent adapters](agent-adapters.md), [personal plugins](plugins-spec.md)

A portable skill keeps its instructions in `SKILL.md`, with optional references and assets alongside it. Pixflow reads that file and adds available project context when composing a run. A resource's presence does not install its dependencies, authorize external actions or make an unavailable integration usable.

Free bundles four maintained skills: `agent-browser`, `export-download-debugging`, `web-design-guidelines` and `writing-guidelines`. The inherited contribution catalogue, rendering templates and brand catalogue are retired. Personal resources and saved identifiers remain supported.

## Skill format

A minimal folder is:

```text
my-workflow/
  SKILL.md
  references/
  assets/
```

For example:

```markdown
---
name: my-workflow
description: Describe the task this personal workflow handles.
triggers:
  - my workflow
od:
  mode: prototype
  design_system:
    requires: false
---

# Workflow

Read the user's request, use only the available tools, and report what was verified.
```

Frontmatter supplies the name and description. Keep a stable name when updating a resource used by saved projects. The body remains the agent instruction source. Relative references must resolve from the skill directory; the daemon supplies a root preamble for supporting files. Preserve the source author's licence and attribution.

The current loader also reads optional localized display fields, `triggers`, `od.mode`, `od.surface`, `od.platform`, `od.scenario`, `od.category`, `od.example_prompt`, `od.preview.type`, `od.design_system.requires`, `od.craft.requires` and critique policy metadata. Use explicit supported values instead of relying on inference. A portable file can be read without promising that every agent supports the tools its instructions request.

An optional `open-design.json` sidecar adds structured plugin identity, inputs, context and pipeline declarations. See the [plugin manifest reference](plugins-spec.md) and [schema](schemas/open-design.plugin.v1.json); skill frontmatter and a plugin manifest are distinct formats.

## Discovery and storage

The daemon scans its configured resource roots when listing resources. User skills under `<runtime-data>/skills` take precedence over bundled skills with the same ID. The default runtime-data directory is `<project-root>/.od`; `OD_DATA_DIR` selects an isolated or installed runtime location. It does not automatically scan every agent's global skill directory or create cross-agent symlinks.

Personal plugins installed through the plugin API/CLI use `<runtime-data>/plugins`. Existing personal rendering templates remain readable from `<runtime-data>/design-templates`, including through saved project references. These directories are runtime data, not destinations for repository contributions or release packaging.

With the daemon running:

```sh
od skills list --json
od plugin install ./my-workflow --json
od plugin list --json
```

The first command lists the skill resource surface. The plugin commands install and list a personal plugin, including supported portable-skill folders; they do not add it to the bundled skill catalogue. See [the personal workflow guide](publishing-a-plugin.md) for scaffold, validation, packaging and optional publication to your own repository. Installation does not imply automatic registration with another agent.

## Design systems and optional craft

Personal design systems retain their `DESIGN.md` instructions and optional token/component assets. See [the authoring guide](design-systems.md) and [format example](examples/DESIGN.sample.md). Saved design-system selections and their authorization remain independent of source catalogue cleanup.

A skill can request personal craft references:

```yaml
od:
  craft:
    requires: [typography, color]
```

The daemon reads `<runtime-data>/craft/typography.md` and `color.md` when present. Missing files are skipped; no craft catalogue ships with Pixflow. These instructions are composed with the active design system and skill body. `CRAFT_DIR` is an internal daemon variable, not a separate user configuration setting.

## Validation and compatibility

Use `od plugin validate` and `od plugin pack` for a personal plugin folder. Validation checks structure and references; it does not prove that the workflow will succeed against a provider, editor or connected account. Run acceptance checks on disposable fixtures and retain the source/artifact identity in private test evidence. There is no `od skill add`, `od skill remove` or `od skill test` command.

Repository changes follow [CONTRIBUTING.md](../CONTRIBUTING.md), the owning module's `AGENTS.md` and the [test guide](testing/README.md). Keep personal content, credentials and operational evidence out of Git.

## Sources and attribution

Pixflow derives shared runtime code from [Open Design](https://github.com/nexu-io/open-design) and retains its Apache 2.0 attribution. The portable `SKILL.md` convention follows Claude Code's skill format. Earlier design references include [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill), [awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design) and [cc-switch](https://github.com/farion1231/cc-switch). These credits do not imply that their catalogues, automatic discovery, symlink behavior or export pipelines ship with Pixflow. See [references](references.md) and [third-party notices](../THIRD-PARTY-NOTICES.md).
