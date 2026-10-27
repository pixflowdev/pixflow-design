# Optional native messaging prototype

Development-only Chrome transport. Free/Pro ZIPs, installed Bridge files and published packages are unchanged. This is not a production extension or an installer integration. Exclude prototype sources from the Bridge resource-tree copy before any unrelated release from this branch.

The extension forwards fetch requests to the existing Bridge through Chrome native messaging. It preserves the verified tab origin and supplied site/session credentials. The Bridge continues to authorize runs, tools and sites; the adapter does not execute page-supplied shell commands.

## Connection and coverage

- Direct connection remains the default. The extension popup requests optional permission for a configured site when the user enables native connection. Approved sites reconnect across navigation. Use direct connection disables injection and restores direct fetch without replaying pending mutations.
- Chrome host permission patterns cannot restrict ports. The background worker and native host independently enforce the exact configured origin, including port. Only top-level tabs can connect.
- Browser-facing Bridge route families cover agents, runs/steering/cancellation/events, projects, connectors, integrations, artifacts, import, dialogs, editors, AMR, applied plugins, sync, and Pixflow direct-site/builder/audio routes. Existing Bridge authorization remains authoritative. Lifecycle endpoints are excluded.
- JSON, multipart and binary bodies use chunked native frames (18 MiB request limit). Responses stream with acknowledgement/backpressure; cancellation, navigation and disconnect do not replay requests. Eight concurrent requests and bounded upload/stream timeouts limit resource use.
- Only fetch is adapted, including Pixflow's saved native-fetch hook. Image/iframe navigation, WebSocket and EventSource URLs are not rewritten. Direct-only previews may still need local-network permission. This prototype does not grant or bypass WordPress permissions.

## Isolated Windows setup

```powershell
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/build.ts
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/setup.ts --site http://127.0.0.1:18364 --bridge http://127.0.0.1:17467 --register-windows
```

Output is `.tmp/native-messaging-prototype`. Setup registers only `HKCU\Software\Google\Chrome\NativeMessagingHosts\dev.pixflow.bridge_prototype` and refuses to overwrite an existing registration. The extension identity survives rebuilds. Load this unpacked directory in an isolated Chrome profile; enable the configured site from the popup, then rescan Local CLI. Remove only this prototype registry key after testing.

## Verification

```powershell
node --import tsx --test tools/pixflow-design-bridge/tests/native-messaging.test.ts
pnpm exec tsc -p tools/pixflow-design-bridge/native-messaging/tsconfig.json --noEmit
$env:PIXFLOW_NATIVE_EXTENSION = (Resolve-Path .tmp/native-messaging-prototype).Path
pnpm --dir e2e exec playwright test --config=lib/playwright/native.config.ts
```

The first browser check uses real Chromium native messaging against an already running Bridge. It checks health, rejection of an unapproved origin and parity with direct HTTP authorization. Loopback development reads returning 200 are not evidence of production authorization denial.

The opt-in real CLI test additionally requires `PIXFLOW_NATIVE_REAL_CLI=1` and a fresh, private `session.private.json` in the generated directory containing `{projectId, conversationId, session}` from an authorized synthetic WordPress Workspace session. Never commit this credential. It creates a matching synthetic Bridge project and runs Codex, streams text, sends steering, navigates, reconnects to the same run and restores the direct transport. It blocks browser-to-Bridge HTTP during the native portion. It preapproves host permissions only in a disposable test profile, so it does not validate Chrome's interactive permission prompt. Tests do not modify existing chats or page content.

Isolated Windows acceptance covered the real optional-permission prompt, permission removal and recovery, both composers, CLI streaming/steering and navigation. Revocation closes active ports and rejects in-flight admissions; disconnect notification survives extension-context invalidation. Automated tests cover these races without credentials.

Before release: finish installer registration/update/uninstall across supported platforms, production authorization and disconnect-under-load checks, packaging exclusion/integration, and Chrome Web Store submission. Prototype transport acceptance alone does not establish builder-save acceptance or Chrome Web Store approval. The direct connection remains available.
