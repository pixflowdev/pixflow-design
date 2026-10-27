# Optional native messaging prototype

Development-only transport experiment. Not enabled or registered by Free/Pro ZIPs or Bridge installers. No packages have been rebuilt for it. Before any release from this branch, exclude prototype sources from the Bridge's blanket resource-tree copy or explicitly graduate the reviewed implementation. No customer data migration, permissions changes, automatic site switching, or provider configuration changes.

The extension uses Chrome native messaging to reach a small Node adapter. The adapter forwards approved requests to the existing loopback Bridge, preserving the page Origin and supplied site/session headers. The Bridge continues to own site matching, authentication, licensing and run authorization. It does not launch a CLI or run shell commands from page messages.

## Scope and limitations

- Explicit toolbar activation for the current tab, using `activeTab`; no blanket host permissions, cookies, storage or automatic injection. Reload/navigation removes activation. Reload also restores the ordinary connection.
- Native adapter independently restricts extension identity, exact approved site origins, exact loopback destination, endpoints, methods and headers. Redirects are rejected. Configuration is a local development file, never supplied by the webpage.
- JSON requests and streamed response bytes, cancellation, bounded frame sizes and eight concurrent requests. No automatic replay or fallback of requests: an unknown mutation outcome must be inspected first.
- Enabled paths: health, agents, agents/stream, site-context (read only), chat and the basic runs/events/steer/stop endpoints. This is **not yet complete Pixflow transport coverage**. Builder-specific routes, pairing, uploads, audio and other API paths intentionally fail closed pending review.
- No production installer registration, store submission, persistent per-site grants, browser-wide navigation continuity or polished onboarding yet. The adapter requires an existing running Bridge; it does not restart it.
- A compromised approved page has the same page-side input access as the existing web transport. Extension permission is not proof of WordPress login. Existing server checks must never be replaced with a DOM marker or extension presence.

## Build and isolated Windows setup

From Core, Node 24 and the pinned pnpm:

```powershell
pnpm exec tsc -p tools/pixflow-design-bridge/native-messaging/tsconfig.json
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/build.ts
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/setup.ts --site http://127.0.0.1:18364 --bridge http://127.0.0.1:17467 --register-windows
```

Generated output is `.tmp/native-messaging-prototype`. Setup creates a public extension identity, a local adapter configuration, launcher and manifest. Registration uses only `HKCU\Software\Google\Chrome\NativeMessagingHosts\dev.pixflow.bridge_prototype`, refuses to overwrite an existing registration and does not modify the installed Bridge. Build again before setup again, since rebuilding replaces the extension manifest. Use this only with isolated profiles/sites. For manual testing, load the unpacked directory in an isolated Chrome/Chromium profile, open the configured site and click the extension toolbar action; then rescan Local CLI. Existing direct access remains the default until activation.

After testing, remove that exact prototype registry key. No production key or Bridge files should be removed. Keep output/evidence in `.tmp`; there is no live distribution artifact.

## Verification

```powershell
node --import tsx --test tools/pixflow-design-bridge/tests/native-messaging.test.ts
$env:PIXFLOW_NATIVE_EXTENSION = (Resolve-Path .tmp/native-messaging-prototype).Path
pnpm --dir e2e exec playwright test --config=playwright.native.config.ts
```

The browser check opens a separate disposable Chromium profile with the unpacked extension and uses the real Chrome native-messaging API against an already running Bridge. It checks health, unapproved-site denial, parity with the direct transport for a mismatched site-key read and reconnection. The local development Bridge currently returns 200 for that loopback-origin site-context read on both transports; this is not evidence of production authorization denial. It does not send prompts or modify chat/page settings. Unit transport tests exercise streaming, denied mutations and redirect rejection with a local fixture server.

Before product integration: test actual toolbar activation in supported Chrome releases, complete route coverage without weakening access checks, add frame acknowledgement/backpressure, test cancellation/disconnection during real synthetic agent runs and navigation, and validate installer registration/update/uninstall on Windows/macOS/Linux. Native host frame streaming alone is not evidence of model steering or builder-save acceptance.
