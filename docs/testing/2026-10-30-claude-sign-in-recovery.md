# Claude sign-in recovery

Customer report: the Claude sign-in action disappears, and clicking it can coincide with Bridge showing disconnected. The provider's manual-code flow is reachable but cannot be completed in PowerShell. Local and staging differ despite matching plugin versions.

## Confirmed defects

- Execution settings removed the Claude sign-in component whenever discovery reported `authStatus: ok`. A later scan could therefore remove the action. A previous successful login status also must not prevent signing in again.
- The daemon browser provider announced Bridge disconnection for every rejected endpoint request, including native transport congestion. A separate successful health request did not prevent this false announcement.
- The owned hidden login subprocess discarded its recovery instructions and offered no way to submit a manual code from WordPress. Settings polling treated a transient failure as a failed login rather than reconciling the existing attempt.

These are reproducible defects, not proof of the customer's exact network failure or a Bridge process crash. Matching plugin versions do not establish matching Bridge versions, runtime authentication, site authorization or extension state.

## Implementation boundaries

The existing Desktop-first runtime resolver and CLI fallback remain in use. Runtime provenance is taken from the selected executable. The official provider owns OAuth and credentials; Pixflow does not inherit Desktop credentials, change OAuth client branding or implement a new OAuth client.

Only an official HTTPS Claude authorization URL emitted by the owned login is retained in bounded process memory. The reopen endpoint accepts an attempt identifier, never a caller-supplied URL. Manual codes go through the existing authorized local Bridge transport to that attempt's stdin. They are excluded from status, settings, conversation storage and diagnostic output. The CLI takes codes through `--prompt-file <path|->`, not command-line code arguments. Stale attempts, invalid input and missing permissions are rejected without reflecting private process output.

Status recovery retries reads with backoff, not mutations. Cancellation stops only the owned login. Closing settings leaves that login available to restore when reopened. Existing extension relay coverage already includes the agent endpoints; this patch requires no new extension permissions or extension package.

## Verification

- Red regressions reproduced disappearing reauthentication, transient polling failure, unavailable manual-code controls and false disconnection before the source fixes.
- Focused runtime tests cover process ownership, stale completion/output, cancellation, timeouts, verification after exit, malformed URLs/codes, private-output exclusion and broken stdin.
- HTTP tests enforce the same authorization on all recovery endpoints and OPTIONS, plus non-cached status and non-reflecting error responses.
- Actual `od` subprocess tests use fixture HTTP endpoints and synthetic stdin codes; no user account is signed out or modified.
- Component/settings tests cover persistent reauthentication, initial-status races, one-login recovery, permission refusal, code clearing and both authenticated Test/sign-in controls.
- Playwright desktop/mobile checks use synthetic login endpoints, including one interrupted status read, reopening and code completion. These verify browser UI behavior, not provider OAuth acceptance.
- Free/Pro browser bundles and language packs are built into `D:\Pixflow\work\claude-sign-in-recovery\staging`, with published manifests and packages unchanged.

Final local result: 147 focused checks passed (24 runtime/HTTP/CLI, 109 web/i18n, 12 native relay/status, 2 desktop/mobile browser), with 6 platform-specific runtime checks skipped on Windows. `pnpm guard` and the full `pnpm typecheck` passed. The translation audit reports 19 complete dictionaries with no missing keys/placeholders. Both Free and explicitly paired Pro browser builds passed. The isolated browser-test namespace was stopped after verification; the installed Bridge and user sign-ins were not replaced or logged out.

Before release, verify the installed candidate through direct and extension routes, complete official browser authorization, and exercise the manual-code fallback if the provider returns one. Check settings reopen, staging/local behavior and automatic connection refresh. This requires a real user sign-in and remains distinct from the synthetic tests. Obtain the customer's Bridge version and diagnostics to determine the specific disconnect cause; do not ask them to repeatedly restart authentication or paste credentials into chat.
