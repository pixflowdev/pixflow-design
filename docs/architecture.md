# Architecture

Pixflow Design combines a WordPress plugin with shared web/agent runtime and a local Bridge. Free owns shared browser/runtime contracts and the Bridge toolchain. Premium WordPress modules, browser contributions and downloadable Pro guidance live in a separately configured private repository.

## WordPress and local execution

WordPress hosts the embedded React UI and authenticated site APIs. The WordPress runtime adapter directs site-owned requests to the REST API and explicit local-agent operations to the Bridge. Site/user settings and chat identifiers must survive updates and execution-mode changes. See [runtime ownership](pixflow-bridge-optional-runtime-checklist.md).

The local Bridge supplies installed agent discovery and CLI execution. It uses the shared daemon/browser contracts, authenticated site sessions and explicitly selected native canvases. Direct tools retain site authorization; read-only modes must remain read-only. Existing content rendering and exports are not tied to a paid-operation permission. See [Direct mode](pixflow-direct-site-mode.md).

## Repository boundaries

| Layer | Owner |
| --- | --- |
| Web and embedded client | `apps/web`; Next.js app plus WordPress-specific entry bundle. |
| Daemon and CLI | `apps/daemon`; HTTP/SSE, agent processes, local standalone storage and `od` commands. |
| Desktop shells | `apps/desktop` and the thin `apps/packaged` launcher. |
| Public app contracts | `packages/contracts`; pure TypeScript DTOs/events, without platform or private app dependencies. |
| Host and UI primitives | `packages/host` and `packages/components`. |
| Process control | `packages/sidecar-proto`, `packages/sidecar` and `packages/platform`. |
| Development/packaging | `tools/dev`, `tools/pack`, `tools/serve` and standalone `tools/pixflow-design-bridge` compatibility entrypoints. |

App business logic does not know about lifecycle namespaces or sidecar control planes. Shared HTTP request/event shapes live in contracts; new user capabilities expose both UI and CLI against the same endpoints. A compatible private checkout is only selected through `PIXFLOW_DESIGN_PRO_ROOT`. Free builds never discover it implicitly.

## Storage and resources

The standalone daemon defaults to `.od/`, including SQLite, projects, artifacts and local credentials. `OD_DATA_DIR` relocates all runtime data; `OD_MEDIA_CONFIG_DIR` overrides only media configuration. These are local data roots, never source-publication inputs.

WordPress projects and installed resource packs use private storage outside served directories. Database paths and saved identifiers retain compatibility during migration. Backups include the database and private file trees. See [storage and recovery](private-project-storage.md).

Free bundles four functional skills from `skills/` and essential Home/Website Clone routers from `guidance/`. Packages retain the routers' existing `plugins/_official/...` paths for saved workflow compatibility. The inherited plugin, craft, design-template and design-system catalogues are retired. Personal skills, design systems, craft references and installed plugins remain supported runtime data; cleanup of bundled sources must not remove them. The Pro Bridge workflow is supplied only through an explicitly configured compatible Pro checkout.

## Lifecycle and validation

Use `pnpm tools-dev` for development and `pnpm tools-pack` for packaged operations. Ports are transport details; namespaces govern paths and IPC identity. Desktop discovers the web URL through sidecar status. Shared process stamps have exactly `app`, `mode`, `namespace`, `ipc` and `source`.

Read [AGENTS.md](../AGENTS.md), [packaging](pixflow-design-local-packaging.md) and [validation](testing/README.md) before changing runtime boundaries. Published artifacts and user data are preserved; source cleanup does not authorize publication, updater activation or history changes.
