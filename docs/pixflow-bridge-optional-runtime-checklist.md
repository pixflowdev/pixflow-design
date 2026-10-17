# WordPress and Bridge runtime ownership

WordPress hosts the embedded UI, authenticated site APIs and persisted site/user state. The local Bridge supplies installed agent discovery and Local CLI execution. An unavailable Bridge should affect only actions that require local-machine capabilities.

| Owner | Responsibilities |
| --- | --- |
| WordPress | Authentication, onboarding, provider/settings preferences, hosted UI, site-side media and chat storage; optional product modules register their own site capabilities. |
| Bridge | Local CLI/model discovery, child processes, native CLI sessions and local execution scratch. |
| Shared browser/contracts | Transport selection, common request/event shapes and capability discovery used by both runtime surfaces. |

Route ownership is explicit in the WordPress runtime adapter. A shared daemon-style path does not make every request Bridge-backed. Site-owned configuration and chat operations must remain usable independently of Bridge health. Local CLI controls expose connection requirements at their own entry point.

Free owns the shared runtime and its supported site-side features. Premium workspace/builder modules live in the separately configured Pro repository and remain server-authorized. Optional catalogue presence does not grant an entitlement or enable an absent integration.

Preserve saved chat, settings, resource identifiers and user data across runtime or edition changes. Memory and project data ownership must follow the implemented site services; never copy credentials or customer state into a source snapshot. See [private storage](private-project-storage.md), [Direct transport](pixflow-direct-site-mode.md) and the [repository boundaries](../AGENTS.md).
