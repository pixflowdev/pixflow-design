# Personal plugins and manifest compatibility

Pixflow retains portable skill files, personal design systems, optional craft references and installed plugin manifests. The inherited bundled plugin, craft, design-template and design-system catalogues are retired. Removing bundled sources does not remove personal resources, change saved identifiers or grant access to paid integrations.

## 1. Resource formats

A portable skill is a directory containing `SKILL.md`, with optional supporting text or assets. Its instructions remain in that file. The optional `open-design.json` sidecar supplies identity and structured runtime metadata; it does not replace the skill body.

A personal plugin folder can contain:

```text
my-workflow/
  SKILL.md
  open-design.json
  references/
  assets/
```

Personal `DESIGN.md` files and craft references remain optional runtime resources. See [the skills protocol](skills-protocol.md), [personal design-system authoring](design-systems.md) and [the format example](examples/saas-landing-skill/SKILL.md). Preserve the source, licence and attribution when adapting another author's resource.

## 2. Importing a personal plugin

Use an explicit local folder or supported source URL. For a local folder:

```sh
od plugin validate ./my-workflow --json --no-daemon
od plugin install ./my-workflow
od plugin list --json
```

Validation checks resource format; installation and use remain subject to runtime compatibility, configured integrations and permissions. A readable manifest does not establish an entitlement or connect an external account. Personal files and credentials stay in their configured runtime storage; do not copy them into the source repository or release archives.

## 3. Identity and updates

Keep resource names, saved plugin identifiers and existing installed paths stable during updates. `specVersion` describes the manifest format; `version` describes the resource release. Increment the resource version when its behavior or supporting files change. Existing saved references and applied snapshots must remain readable under the runtime's compatibility rules.

Optional metadata includes localized display text, authorship, licence, compatible skill paths, context references, capabilities, preview information and pipeline declarations. The presence of a schema field does not promise a bundled UI feature or an available provider. Runtime validation and the owning integration determine supported behavior.

## 4. Essential bundled guidance

Free retains four functional skills and two essential routers in source:

- `guidance/scenarios/od-default` supplies Home routing.
- `guidance/examples/web-clone` supplies Website Clone routing.

WordPress and desktop packages retain the existing `plugins/_official/scenarios/od-default` and `plugins/_official/examples/web-clone` targets for compatibility. The Bridge manifest keeps its existing Website Clone router contract and accepts the legacy path in installed archives. The private Bridge `skills/web-clone` workflow comes only from an explicitly configured compatible Pro checkout. These package targets do not restore a source catalogue.

## 5. `open-design.json`

The [plugin manifest schema](schemas/open-design.plugin.v1.json) is the machine-readable format reference. Its required fields are `specVersion`, `name` and `version`; names follow the schema's stable identifier syntax.

```json
{
  "specVersion": "1.0.0",
  "name": "my-workflow",
  "title": "My workflow",
  "version": "1.0.0",
  "description": "A personal reusable workflow."
}
```

Keep referenced files within the resource's supported path rules. A metadata-only folder is not a runnable skill merely because its JSON validates. Pipeline atom identifiers and their runtime ownership are documented in [the atom reference](atoms.md).

## 6. External registry index compatibility

The [marketplace index schema](schemas/open-design.marketplace.v1.json) remains available for external, user-managed indexes and existing installed-resource metadata. It requires `specVersion`, `name`, `version` and `plugins`; each plugin entry requires `name`, `source` and `version`.

Configured external sources remain separate from bundled guidance. Preserve provenance, version and integrity metadata when importing or updating resources. Trust decisions, integration credentials and paid-operation authorization remain runtime responsibilities. This repository does not ship a replacement public registry or a community catalogue.

See [storage and recovery](private-project-storage.md), [current architecture](architecture.md), [packaging compatibility](pixflow-design-local-packaging.md) and [references and credits](references.md).
