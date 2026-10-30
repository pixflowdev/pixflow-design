# Provider usage automatic refresh

The shared usage hook previously fetched on mount, model changes and explicit refresh only. The composer ring and its hover summary could remain out of date indefinitely without a click.

Mounted usage surfaces now fetch every 60 seconds while the tab is visible. Returning to an overdue tab triggers a read. Requests do not overlap; unmount and provider/model changes abort the previous request and remove timers/listeners. A previous reading remains visible during a background read, while a failed read clears it to unavailable and retries on the next interval. No account usage is persisted or inferred from subscription names.

This changes the shared Core UI consumed by both composer surfaces and Execution settings. The existing usage HTTP endpoints and `od agents usage codex|claude --json` remain the data contract; no new CLI command, Bridge runtime, provider permission or translation is required. No Pro implementation or Team change is included.

## Verification

- Six new component regressions failed before the fix: Codex/Claude minute polling, visible reading during a pending refresh without overlap, automatic error recovery, hidden-tab recovery/cleanup, and polling the newly selected Claude model.
- All 16 usage component tests passed after the fix, including existing manual refresh, provider-model race and portal layout coverage.
- Repository guard and full typecheck passed. After stacking this change above the existing Claude recovery candidate, the contracts build was refreshed before typechecking. A missing `resetsAt: null` in the new fixture was corrected.
- Free and explicitly paired Pro browser builds passed. Published packages and language manifest pins were not changed.
- Installed isolated WordPress acceptance waited a real minute in each composer, with synthetic usage responses: the ring changed from 80% to 65%, its SVG offset changed to 35, and the hover summary showed the new value without a click. The floating-panel harness was corrected to open the initially closed panel; hover was retargeted after layout settled. These are browser UI checks, not new provider usage-discovery claims.
- Content/chat table fingerprints and saved preferences were unchanged. Automatic entitlement and admin audit options refreshed during inspection. No prompt was sent and no site content was edited.

The local installed candidate retains the preceding Claude recovery fixes. Source is stacked above Core PR #63 (`3047e0cd`) to avoid rolling those fixes back; this patch's scope is the usage refresh only. The running Bridge did not require a restart or replacement.
