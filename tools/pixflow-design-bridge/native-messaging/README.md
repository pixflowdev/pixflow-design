# Optional native messaging prototype

Development-only Chrome transport. Free/Pro ZIPs, installed Bridge files and published packages are unchanged. This is not a released extension. Prototype sources and tests are excluded from the normal Bridge resource copy.

The extension forwards fetch requests to the existing Bridge through Chrome native messaging. It preserves the verified tab origin and supplied site/session credentials. The Bridge continues to authorize runs, tools and sites; the adapter does not execute page-supplied shell commands.

## Connection and coverage

The popup follows Pixflow's neutral light/dark surfaces, compact controls and superellipse corners. It uses `tabs` to identify the focused paired site before optional host approval; this does not grant persistent site access. The Store package does not request `activeTab`. The Connect action requests host permission explicitly. Existing configured origins remain the allowlist; the popup cannot enroll arbitrary sites.

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

Windows Bridge installers call the staged `install.mjs install` using their bundled Node, or packaged Electron in Node mode when no standalone Node is present, after extraction, and `install.mjs uninstall` before removing app files. Missing payload leaves the direct connection unchanged. Registration refuses another installation's key or manifest. Uninstall removes only a matching manifest/registration, never Chrome consent, chats or Bridge data. Registration failure does not disable direct transport.

On Windows, `PIXFLOW_NATIVE_NSIS_TEST=1 pnpm --dir e2e test tests/pixflow/native-installer.test.ts` compiles and executes a small isolated NSIS installer using these exact hooks. It checks install, repair and uninstall against a uniquely named real registry key and a saved-data sentinel. It does not install or replace the full customer Bridge. Set `PIXFLOW_NSIS_COMPILER` if NSIS is not in its standard installation directory.

The same lifecycle helper supports Chrome's per-user manifest locations on macOS and Linux; executable launchers use the installed Node and host paths. Native macOS/Linux app lifecycle wiring and real machine acceptance are still outstanding. Filesystem contract tests on Windows are not equivalent to installer tests on those platforms.

Additional checks exercise the actual native host process with eight concurrent streams, backpressure, cancellation, overload rejection and recovery without mutation replay. A separate HTTP boundary test relays HTTPS site-origin requests through the production signed-entitlement gate with synthetic signed grants, verifying missing/expired/revoked and wrong-installation rejection. This does not substitute for complete installed production route/session acceptance.

## Customer-site enrollment

Approved paired sites now connect on extension installation, browser startup, tab activation and completed navigation without a second popup action. Chrome 133+ receives a pattern-scoped host-access request for the active tab when permission is missing. Chrome itself decides whether to display that request; older versions retain the popup approval fallback. Permission approval triggers automatic enrollment. The extension does not grant browser permission or pair an arbitrary WordPress installation itself.

Choosing the direct connection is stored separately and survives browser restarts; background discovery must not override it. Permission removal still immediately invalidates active connections and pending admissions. Automatic activation retains the exact paired origin, existing Bridge authorization and no-replay behavior.

Validation for automatic onboarding covers real installed Chromium transport with prior permission, restart preservation, popup recovery, permission-race regression tests and production signed-grant rejection. Chrome's interactive first-time host-access request remains a manual acceptance gate; preapproved test profiles do not validate that prompt.

Prototype setup also supports `--discover-paired-site --bridge http://127.0.0.1:17467` instead of `--site`. In that mode, both the native host and popup discover the exact active origin from the existing local Bridge pairing. No customer domain is embedded in the installer. Pair the site using Pixflow's existing Bridge flow, open the extension popup, and explicitly allow Chrome access. Discovery does not pair a site, grant WordPress access, or grant Chrome permission. Failed discovery admits no origins. Site/session authorization continues to run in Bridge.

## Independent release gates

The upcoming plugin/Bridge fixes do not depend on Google approving this extension. Build the normal release without `PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR`; prototype sources remain excluded. Reused output containing a stale native payload is rejected rather than silently shipping it. Validate the normal installer and both composers with no extension installed before promoting that separate release.

Before the **extension** release: permanent Chrome Web Store identity, complete installed customer-enrollment and Windows installer acceptance, macOS/Linux lifecycle integration and acceptance, full production route/session checks, and Chrome Web Store submission. The Store-assigned permanent identity and current verification limits are recorded in `STORE.md`; no customer permissions are pre-granted. The direct connection remains available.


### Chrome documentation check (2026-10-28)

Chrome action popups auto-size to their contents within 25x25-800x600. The popup now declares a 352px document width without viewport-relative caps, avoiding the circular initial sizing seen in the toolbar. Browser tests exercise an initial 180px measurement viewport. The user subsequently confirmed that the real automatically opened toolbar popup had the correct width and readable layout.

The host-access request API exists from Chrome 133, but Chrome documents that its display depends on the new extensions menu and can be disabled or throttled. Feature detection alone does not prove a visible prompt. Keep the explicit popup permission fallback. Repeated requests for the same tab/pattern are limited to once per five minutes in a worker lifetime; successful permission grant clears that request. The earlier manual acceptance used the popup, so it proves approval, native connection and reload, not popup-free approval.

References: https://developer.chrome.com/docs/extensions/reference/api/action and https://developer.chrome.com/blog/new-extensions-menu-testing


### One-time automatic setup panel

Chrome 127+ can open the action popup programmatically. The extension now requests `tabs` solely to compare the focused tab origin with the native host's verified pairing before site permission exists. It does not record browsing history or send tab URLs to a service. Matching is exact, including the port. Unrelated sites and unfocused windows never trigger the panel.

A local `onboardingShown` list records the once-per-origin attempt before opening, so dismissal and worker restart cannot repeatedly reopen it. Explicit direct-mode preferences are retained. Older Chrome retains the popup fallback. `openPopup` is not permission approval; the browser acceptance test checks `permissions.getAll().origins` before accepting persistence as proven.
