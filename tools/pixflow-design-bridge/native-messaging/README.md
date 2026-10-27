# Optional native messaging prototype

Development-only Chrome transport. Free/Pro ZIPs, installed Bridge files and published packages are unchanged. This is not a released extension. Prototype sources and tests are excluded from the normal Bridge resource copy.

The extension forwards fetch requests to the existing Bridge through Chrome native messaging. It preserves the verified tab origin and supplied site/session credentials. The Bridge continues to authorize runs, tools and sites; the adapter does not execute page-supplied shell commands.

## Connection and coverage

The popup follows Pixflow's neutral light/dark surfaces, compact controls and superellipse corners. It selects the current configured site when Chrome exposes its URL after the extension is clicked (`activeTab`); this does not grant persistent site access. The Connect action requests host permission explicitly. Existing configured origins remain the allowlist; the popup cannot enroll arbitrary sites.

Saved permission is distinct from connection status: a bounded, read-only `/api/health` request travels through the native host before the popup reports Bridge connected. This verifies transport reachability, not WordPress login, installed CLI agents or authorization to edit a page. Setup, permission, refusal, timeout and unavailable-Bridge states have separate recovery copy. Disconnect disables extension transport without removing unrelated Chrome permissions, deleting chat/settings data or replaying a run.

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

## Opt-in candidate installer integration

Set `PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR` explicitly to a staged payload directory containing `host.mjs`, `install.mjs` and `config.json`. No directory is discovered automatically. Configuration must include an explicit `hostName`, exact `extensionOrigin`, loopback `bridge` origin and approved `sites`. Browser profiles, session credentials and popup assets are not copied into Bridge installers. Do not use customer-specific development configuration in a public release.

Windows Bridge installers call the staged `install.mjs install` using their bundled Node after extraction, and `install.mjs uninstall` before removing app files. Missing payload leaves the direct connection unchanged. Registration refuses another installation's key or manifest. Uninstall removes only a matching manifest/registration, never Chrome consent, chats or Bridge data. Registration failure does not disable direct transport.

On Windows, `PIXFLOW_NATIVE_NSIS_TEST=1 pnpm --dir e2e test tests/pixflow/native-installer.test.ts` compiles and executes a small isolated NSIS installer using these exact hooks. It checks install, repair and uninstall against a uniquely named real registry key and a saved-data sentinel. It does not install or replace the full customer Bridge. Set `PIXFLOW_NSIS_COMPILER` if NSIS is not in its standard installation directory.

The same lifecycle helper supports Chrome's per-user manifest locations on macOS and Linux; executable launchers use the installed Node and host paths. Native macOS/Linux app lifecycle wiring and real machine acceptance are still outstanding. Filesystem contract tests on Windows are not equivalent to installer tests on those platforms.

Additional checks exercise the actual native host process with eight concurrent streams, backpressure, cancellation, overload rejection and recovery without mutation replay. A separate HTTP boundary test relays HTTPS site-origin requests through the production signed-entitlement gate with synthetic signed grants, verifying missing/expired/revoked and wrong-installation rejection. This does not substitute for complete installed production route/session acceptance.

Before release: permanent Chrome Web Store identity, customer-site enrollment/discovery, complete Windows installer acceptance, macOS/Linux lifecycle integration and acceptance, full production route/session checks, and Chrome Web Store submission. No production extension identity has been invented or permissions pre-granted. The direct connection remains available.
