# Pixflow Design Bridge v2.3.3 production Mac handoff

## Release hold and scope

Build fresh production Apple Silicon and Intel DMGs from the exact reviewed pair below. Upload only to the existing unpublished Bridge draft; do not publish releases, change updater feeds, replace live packages or change website downloads. Ad hoc signing without notarisation is explicitly authorized for v2.3.3. Seamless updating remains Windows-only: the Mac experiment required another manual Gatekeeper approval.

**Start gate:** begin production builds only after Pro #92 and the PR containing this refreshed handoff are merged with successful CI. The exact Pro commit below is the tested source commit included by #92; do not substitute an unreviewed branch tip.

## Exact source pair

| Repository | Revision |
| --- | --- |
| pixflowdev/pixflow-design | `a4e7741732881a0e7c7c435731b208f0a38ae6d8` |
| pixflowdev/pixflow-design-pro | `2c19c1b6719dc90981721f61d2b79274e82dad54` |

Pro's pixflow-pro.json must pin a4e7741732881a0e7c7c435731b208f0a38ae6d8. Use clean detached architecture-specific checkouts and explicit PIXFLOW_DESIGN_CORE_ROOT / PIXFLOW_DESIGN_PRO_ROOT. Do not build from earlier validation branches, candidate binaries or the archival acceptance report's old pins. Read both AGENTS.md files and Core tools/pack/AGENTS.md. Use Node 24 and pinned pnpm 10.33.2.

All eight Core fixes (#159–#166), three Pro fixes (#89–#91), and the accompanying changelog/pin PRs are included. Core #161 and #165 test failures were corrected, and #165/#166 were tested together. Team, comments/Feedback and the Tauri prototype remain excluded.

## Production build and draft destination

- Generate the production Chrome native host payload with `pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh`. Set PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR to the generated `.tmp/chrome-store/native` directory.
- Build arm64 with native arm64 Node, and x64 with x64 Node under Rosetta if native Intel is unavailable. Use separate dependencies. Run the maintained `pnpm bridge:mac` packaging flow from the exact paired sources.
- Verify each DMG with `hdiutil verify`. Check version 2.3.3, bundle ID dev.pixflow.bridge, Electron/Node/SQLite architecture, standalone Node 24.22.3, SQLite in-memory database, production native host identity and absence of build-machine paths.
- Record `codesign --verify --deep --strict` and `spctl --assess` results honestly. Preserve quarantine and normal security settings. Ad hoc packages are not notarised; manual Gatekeeper approval may be required.
- Name final assets `pixflow-design-bridge-2.3.3-mac-arm64.dmg` and `pixflow-design-bridge-2.3.3-mac-x64.dmg`. Calculate SHA-256 after final signing and packaging.
- Upload to repository **pixflowdev/pixflow-design**, existing release draft ID **446489613**, tag **bridge-v2.3.3**. First verify it is still a draft with that tag. Preserve all unrelated assets. Do not create a separate release or publish the draft. Re-download both uploaded DMGs and verify their hashes.

## Final packaged acceptance

Run on the final packaged Apple Silicon app, not the earlier development Bridge:

1. Fresh install and v2.3.2-to-v2.3.3 upgrade in isolated data roots. Verify GUI launch, provider detection, Chrome native messaging, pairing, reconnect and preservation of settings/chats. Test x64 launch under Rosetta; distinguish this from native Intel testing.
2. Codex and Claude in the real local floating panel: natural full-page and complex Bricks briefs, without tool recipes or prescribed layout. Saved design context must guide the agent. Inspect commands, repeated discovery, retries and timing. Verify live canvas, follower, saved preview and native Undo/Redo, including a compound edit on a query page and pagination after Undo/Redo.
3. Workspace-to-Bricks handoff in the same conversation: original saved Plan progresses and completes, no duplicate failed assistant row, no false history conflict. Reload both surfaces and verify the same full transcript. Stop and queued follow-ups must work with a saved Plan card.
4. Check tool/reasoning details stay closed until clicked, preserve manual choice while streaming, and remain functional after reload. Verify preview screenshots work without embedding image payloads in saved history.
5. Recheck permission rejection, stale revision recovery and repeated request idempotency on disposable drafts. Do not relax access control, TLS trust or macOS security settings to make a test pass.
6. Restore original test routing/services and leave client/live sites untouched. Return focused PRs for any new reproducible defect before replacing candidate artifacts.

## Retained evidence and limits

The full chronological Mac report and screenshots are preserved in [Mac acceptance evidence](pixflow-bridge-v2.3.3-mac-acceptance.md). Its earlier failed checks are superseded only where later sections explicitly retest them. Do not use its old source pairs for production.

Remaining known limits: an exact future-proof condition distinguishing an editor-supplied excerpt from WordPress-generated fallback text was not established; older-Bricks fallback and native Intel hardware coverage were unavailable. Do not report these as passed or silently substitute hard-coded post IDs. The ad hoc updater experiment demonstrated replacement and reconnect after manual approval, not unattended Mac updating or complete pairing/settings migration; keep manual DMG delivery for Mac.

Report exact Core/Pro revisions, architecture, provider/model/reasoning, final package test results, checksums, asset URLs, signing/Gatekeeper results and any remaining limitations. **Publication stays on hold pending Windows-side final artifact and release review.**
