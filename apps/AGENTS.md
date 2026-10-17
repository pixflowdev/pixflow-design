# apps/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `apps/`.

## Active apps

- `apps/web`: Next.js 16 App Router + React 18 web runtime. Entrypoints live in `apps/web/app/`; the main client shell is `apps/web/src/App.tsx`. During local `tools-dev` web runs, `apps/web/next.config.ts` rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to `OD_PORT`.
- `apps/daemon`: Express + SQLite local daemon and `od` bin. It owns REST/SSE APIs, agent CLI spawning, skills, design systems, artifact persistence, static serving, and local data under `.od/`.
- `apps/desktop`: Electron shell. Desktop does not guess the web port; it reads runtime status through sidecar IPC and opens the reported web URL.
- `apps/packaged`: Thin packaged Electron runtime entry. It starts packaged daemon/web sidecars, registers the `od://` entry protocol, and delegates desktop host behavior to `apps/desktop`.

## Daemon layout

- `apps/daemon/src/` contains only daemon app source.
- `apps/daemon/tests/` contains daemon tests.
- `apps/daemon/sidecar/` contains the daemon sidecar entry.
- CLI/agent argument definition changes belong in `apps/daemon/src/runtimes/defs/`; stdout parser changes belong with the matching runtime helpers and parser tests.

### Router layout

- Existing daemon domain endpoints belong in the matching daemon route file; avoid adding route handlers directly to `apps/daemon/src/server.ts` unless the route is bootstrap-wide or has no clear domain owner.
- New route registrars should be wired into the matching semantic section in `server.ts`; keep sections broad and reuse existing sections before adding a new one.
- Bootstrap-wide routes describe daemon availability or startup metadata shared by every domain. `/api/health` and `/api/version` stay in `server.ts` because they only report process-level status.
- Domain routes describe a product capability or data model. `/api/active` belongs in `apps/daemon/src/routes/active-context.ts` because transient UI focus is its own domain, while chat routes own persistent conversation and run state.
- Add endpoints to an existing route file when they share the same domain language and dependency set. Split a new module under `apps/daemon/src/routes/` when the endpoint introduces a distinct domain or has little dependency overlap with existing route modules.

## Optional Pro source boundary

- This repository owns Free and shared web source. Premium implementations live in the separate private `pixflow-design-pro` checkout; do not restore `apps/web/src/pro` here.
- Free WordPress builds and the default web typecheck must work with no Pro checkout. Contribution signatures live in core-owned contracts; never infer their types by importing a private Pro implementation.
- `PIXFLOW_DESIGN_PRO_ROOT` explicitly pairs an optional private checkout for full standalone/Bridge builds. Next aliases `@pixflow-design/pro-standalone` to the private registration entry only after build-contract and module-API validation. Without it, the core shell uses the empty registration entry.
- Pro source consumes shared web code through the named `@pixflow-design/core/*` development API, resolved to this checkout. Shared source must not be copied into the private repository. This is a synchronized development boundary, with compatibility recorded in the Pro manifest, rather than permission for one app to import another app's internals.
- The public WordPress build API is `scripts/wordpress-build-contract.ts`; private bundle recipes belong to the Pro checkout. Full Bridge installers require the explicit Pro source so a package cannot silently omit Workspace or builder features.

## Test layout

- App tests live in each app's `tests/` directory, sibling to `src/`; preserve source-relative subpaths inside `tests/` when useful.
- Keep app `src/` directories source-only; do not add new `*.test.ts` or `*.test.tsx` files under `src/`.
- `apps/web/tests/` contains web-owned Vitest tests and uses `*.test.ts` / `*.test.tsx`.
- Playwright UI automation belongs in `e2e/ui/`; do not add Playwright suites or UI automation helper scripts under `apps/web`.

## Sidecar awareness

- App business layers must not import sidecar packages or branch on `runtime.mode`, `namespace`, `ipc`, or `source`.
- Keep sidecar awareness in `apps/<app>/sidecar` or the desktop sidecar entry wrapper.

## Packaged runtime

- `apps/nextjs` has been removed; do not restore it.
- Packaged web uses Next.js SSR through the web sidecar; do not put Next output under daemon `OD_RESOURCE_ROOT`.
- Packaged `OD_RESOURCE_ROOT` is only for daemon non-Next read-only resources: `skills/`, `design-systems/`, and `frames/`.
- Packaged data/log/runtime/cache paths must be namespace-scoped and must not depend on daemon or web ports.
- Daemon↔web packaged traffic still uses an HTTP origin/port because Next.js dev server and SSR proxy paths assume HTTP origins; switching to Unix sockets would require patching Next internals. The invariant is that data/log/runtime/cache paths never embed ports.

## Common app commands

```bash
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/desktop typecheck
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/packaged typecheck
pnpm --filter @open-design/packaged build
```
