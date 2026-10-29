# Mac to Windows handoff — v2.1.2 production builds

29 October 2026. This records the owner's latest direction and supersedes the earlier blanket hold on producing installers, but does not authorize public release or Chrome Web Store submission.

## Decision and next action

Prepare **production v2.1.2**, not RC, installers for a GitHub **draft** after freezing the final compatible Core/Pro revisions and matching native helper. There is no confirmed additional Bridge-specific defect blocking creation of draft installers. Remaining acceptance limitations below must stay visible; this is not unconditional production deployment sign-off.

The owner clarified that **steering acceptance applies to Codex only**. Claude steering is not implemented and is not a blocker. The owner also requested skipping the five-minute live sign-in timeout wait; deterministic timeout coverage passed.

Do not build from an arbitrary branch tip or relabel old 2.1.1 artifacts. Do not overwrite published v2.1.1 assets, publish the draft, change updater pointers, deploy to customer sites or submit the Store extension.

## Review and source freeze

Review/reconcile these PRs against the final release branch; links identify provenance, not an assertion that all are currently unmerged:

- [Core #44 — multi-site popup health fix and Mac evidence](https://github.com/pixflowdev/pixflow-design/pull/44). Fix commit `e4397c40a`; later commits update evidence. The browser health probe must enroll the approved selected site on the **same native port** used for its health request. Frozen extension 1.0.3 falsely showed Bridge unavailable with multiple sites; the fix passed regression and live checks.
- [Core #42 — macOS Claude app-bundle runtime discovery](https://github.com/pixflowdev/pixflow-design/pull/42).
- [Pro #23 — footer expectation](https://github.com/pixflowdev/pixflow-design-pro/pull/23).
- [Pro #24 — paired acceptance assertions and POSIX synthetic launcher](https://github.com/pixflowdev/pixflow-design-pro/pull/24).
- [Core #43 — earlier Mac report](https://github.com/pixflowdev/pixflow-design/pull/43), historical context.

The tested baseline was Core `6e13644ac17c8b97d451b0639b031f00d01093db` with Pro `17b358fb11dcfdbab6e4f8e095c1a981b3dc497a`, module API 14. The live extension then received #44's rebuilt background script in the disposable test folder. Therefore the original frozen browser ZIP is **not** the final corrected artifact. Freeze replacement browser bytes, exact final Core SHA and matching Pro pin before release builds. No new Pro implementation change was made during the popup-fix pass.

Original extension asset: 1.0.3, SHA256 `4750cbe937d5365c771c8ade9f5ebed7456d5841dee0101d977e8e3be2144839`; permanent ID `hbnbiboohlelmngadeolikeejamjlbkh`. Keep that identity. Rebuild the corresponding native helper and verify the corrected `/api/test/connection` route is included.

## Mac results

Environment: macOS 26.5.1, Apple Silicon, Node 24.19.0, pnpm 10.33.2; Claude Desktop 4.29.0 with managed CLI 2.1.309. Tests used an isolated packaged arm64 app and the trusted QA WordPress site. This is not physical Intel acceptance.

- Core guard/typecheck/daemon build and focused runtime/web gates passed. Paired web: **2,224 passed, 28 skipped**. Paired Bridge: **18 passed, one skipped**; the POSIX synthetic runner actually executed.
- Final native suite: **64 passed, one skipped**. Final auth/discovery/model-probe tests: **15 passed, one skipped**. Final provider UI tests: **14 passed**.
- Fresh Chrome QA discovery before permission, QA-only consent, all three reconnect entry points, popup Close and direct-route preference passed across the recorded sessions. New tab, reload, full Chrome restart and Bridge restart restored the extension connection without opening its popup or clicking Reconnect.
- Claude Desktop discovery, runtime catalogue/model/effort selection, native Provider Test, floating/Workspace responses and representative direct requests passed. Model/effort were verified in redacted process evidence; no misleading dollar estimate was shown.
- Codex Workspace steering/cancel passed. Codex floating native steering, reload reattachment and cancel passed. Claude floating streaming/cancel and Workspace navigation recovery passed. These individual passes do not imply every provider/panel permutation was run.
- Scoped fallback selected a CLI path, queried 13 real runtime models, restored Desktop preference and confirmed an isolated unauthenticated state. It reused the existing managed executable; a separately installed standalone distribution was not available.

## Remaining release-sign-off limitations

1. Automatic Claude provider-card refresh is **inconclusive**: authentication succeeded and the button changed to Signed in, but browser configuration overwrote the isolated test auth setting. No normal account was logged out. Automated callback/provider-sync tests passed; do not describe this as a clean live refresh pass or a confirmed product defect.
2. Live permission-revocation/active-port closure is **inconclusive** because Chrome debugging interfered with the reload and a popup interaction contaminated the sequence. Permission restoration and route/history recovery passed; automated revocation checks passed. Live foreign-origin/subframe scenarios remain unrun, with deterministic coverage passing.
3. Live five-minute timeout was **waived by owner**; deterministic coverage passed. Some provider/panel control permutations and an independently installed standalone CLI remain unrun. Resolve these as explicit release acceptance decisions or targeted follow-ups; do not silently mark them passed.

## Preservation and local state

Database reconciliation found posts, post metadata, comments, taxonomies and existing chat messages unchanged. Intentional synthetic chats/project records were added; preferences, session metadata and caches changed. No customer-content mutation was requested on the second site. QA-only persistent Chrome access was restored and no synthetic run was left active.

The final daemon-config check found no test-only Claude config-directory override remaining. Isolated auth directories, full database/plugin backups and native-registration backups remain on the Mac outside Git. The isolated acceptance app/helper remains available for follow-up; production native-registration restoration and complete preference reconciliation are not claimed finished. Do not blanket-restore the database or delete chats to clean up tests.

Detailed evidence: [corrected Mac report](evidence/claude-mac-2026-10-29/mac-corrected/README.md). Unredacted local native screenshots and private backups must not be uploaded. The report intentionally distinguishes live, deterministic, scoped and unrun checks.

## Build and draft-upload requirements

Once the coordinator records the final source pair and version bump, build one extension-ready production installer per architecture: arm64 and x86_64, both retaining direct access. Use portable paths, stable product identity and the matching native payload. The wrapper's x64 option imports an existing DMG; use a genuine x64 build toolchain or approved Rosetta setup and label the evidence accurately.

Validate bundle version/identity, Electron and native-module architecture, `hdiutil verify`, permanent-ID host registration, install/repair/restart preservation, and direct/extension smoke tests on the actual artifacts. Record signature classification accurately; ad-hoc signing is not notarization. Attach SHA256, size and draft upload receipts. Build/upload authorization does not waive these artifact checks or authorize publishing.
