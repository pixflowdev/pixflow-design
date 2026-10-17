# Pixflow Design product scope

Pixflow Design provides a WordPress-hosted AI workspace and shared browser/agent runtime. This repository owns Free, public app contracts and the Bridge toolchain. Premium site integrations and optional Pro libraries are maintained separately.

Free supports its bundled guidance, configured provider chat, onboarding/settings and persisted conversation workflows without requiring a private checkout. The local Bridge connects installed agent CLIs for supported local execution. Optional features are discovered from active integrations and authorized server-side; catalogue metadata or source availability does not grant paid access.

The UI and `od` CLI share HTTP contracts. Agent execution remains driven by the selected provider/CLI and current user intent. Read-only modes, site isolation and native builder permission boundaries remain authoritative. Preserve existing chat, settings, content and installed package identifiers during updates.

This repository also maintains shared standalone web/daemon/desktop development surfaces used by Bridge and integration tooling. Their source presence does not mean every standalone capability ships in the minimal Free WordPress ZIP.

The [architecture guide](architecture.md), [repository instructions](../AGENTS.md), [runtime ownership](pixflow-bridge-optional-runtime-checklist.md), [packaging contract](pixflow-design-local-packaging.md), [plugin specification](plugins-spec.md), [skills protocol](skills-protocol.md) and [agent adapters](agent-adapters.md) describe the implementation boundaries. [References and credits](references.md) preserve upstream provenance.
