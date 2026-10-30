# Claude sign-in recovery

Customer report: the Claude sign-in action disappears, and clicking it can coincide with Bridge showing disconnected. The provider's manual-code flow is reachable but cannot be completed in PowerShell. Local and staging differ despite matching plugin versions.

## Confirmed defects

- Execution settings removed the Claude sign-in component whenever discovery reported `authStatus: ok`. A later scan could therefore remove the action. A previous successful login status also must not prevent signing in again.
- The daemon browser provider announced Bridge disconnection for every rejected endpoint request, including native transport congestion. A separate successful health request did not prevent this false announcement.
- The owned hidden login subprocess discarded its recovery instructions and offered no way to submit a manual code from WordPress. Settings polling treated a transient failure as a failed login rather than reconciling the existing attempt.

These are reproducible defects, not proof of the customer's exact network failure or a Bridge process crash. Matching plugin versions do not establish matching Bridge versions, runtime authentication, site authorization or extension state.

## Implementation boundaries

The existing Desktop-first runtime resolver and CLI fallback remain in use. Runtime provenance is taken from the selected executable. The official provider owns OAuth and credentials; Pixflow does not inherit Desktop credentials, change OAuth client branding or implement a new OAuth client.

Only an official HTTPS Claude authorization URL emitted by the owned login is retained in bounded process memory. The runtime supplies the path; validation checks an explicit official-origin allowlist, a code-flow OAuth request with S256 PKCE and state, and a loopback or official-origin redirect. Unknown domains, credentials, fragments and ambiguous duplicate parameters are refused. Paths are not pinned to a runtime version. The reopen endpoint accepts an attempt identifier, never a caller-supplied URL. Manual codes go through the existing authorized local Bridge transport to that attempt's stdin. They are excluded from status, settings, conversation storage and diagnostic output. The CLI takes codes through `--prompt-file <path|->`, not command-line code arguments. Stale attempts, invalid input and missing permissions are rejected without reflecting private process output.

Status recovery retries reads with backoff, not mutations. Cancellation stops only the owned login. Closing settings leaves that login available to restore when reopened. Existing extension relay coverage already includes the agent endpoints; this patch requires no new extension permissions or extension package.

## Verification

- Red regressions reproduced disappearing reauthentication, transient polling failure, unavailable manual-code controls and false disconnection before the source fixes.
- Focused runtime tests cover process ownership, stale completion/output, cancellation, timeouts, verification after exit, malformed URLs/codes, private-output exclusion and broken stdin.
- HTTP tests enforce the same authorization on all recovery endpoints and OPTIONS, plus non-cached status and non-reflecting error responses.
- Actual `od` subprocess tests use fixture HTTP endpoints and synthetic stdin codes; no user account is signed out or modified.
- Component/settings tests cover persistent reauthentication, initial-status races, one-login recovery, permission refusal, code clearing and both authenticated Test/sign-in controls.
- Playwright desktop/mobile checks use synthetic login endpoints, including one interrupted status read, reopening and code completion. These verify browser UI behavior, not provider OAuth acceptance.
- Free/Pro browser bundles and language packs are built into `D:\Pixflow\work\claude-sign-in-recovery\staging`, with published manifests and packages unchanged.

Initial local result: 147 focused checks passed (24 runtime/HTTP/CLI, 109 web/i18n, 12 native relay/status, 2 desktop/mobile browser), with 6 platform-specific runtime checks skipped on Windows. `pnpm guard` and the full `pnpm typecheck` passed. The translation audit reports 19 complete dictionaries with no missing keys/placeholders. Both Free and explicitly paired Pro browser builds passed. The isolated synthetic browser-test namespace was stopped after verification; the installed production Bridge and user sign-ins were not replaced or logged out.

## Installed Windows test with Desktop closed

The desktop app was confirmed not running before and during testing. Its managed Claude Code 2.1.309 runtime remained discoverable and authenticated. A real read-only prompt returned `TEST` in 6,816 ms with tools disabled and session persistence disabled; the standalone CLI fallback was not used.

The existing isolated database and site 18364 were restarted without initialization or restoration. Four changed host assets were installed after recording preservation fingerprints and a small original-asset checkpoint. The candidate daemon used the existing isolated Bridge data; the user started/restarted it because automatic approval rejected agent launches.

Clicking the actual WordPress sign-in button opened Claude's browser page while the desktop app remained closed. This exposed a recovery parser defect: the installed runtime emits `https://claude.com/cai/oauth/authorize`, which the original exact-path allowlist did not recognize. A failing regression reproduced this before the correction. There is no evidence of an app update or a recent route change on the machine; the defect was our incomplete assumption about supported addresses.

The first correction added that exact endpoint. Following the request to handle future changes, URL validation now discovers the path from the owned runtime and verifies origin plus OAuth/PKCE request shape rather than enumerating paths. Synthetic tests cover changed paths, hostile origins, unsafe redirects, duplicate parameters and missing/invalid OAuth fields. The isolated daemon was restarted to load this generalized validation before the final provider-authorization tests.

After the generalization, 41 runtime/HTTP/CLI checks passed (6 platform-specific checks skipped), alongside the earlier 109 web/i18n, 12 native relay/status and 2 synthetic browser checks: 164 focused checks in total. Full guard, typecheck and daemon compilation passed again. Official runtime authentication remained active after cancellation.

After loading the corrected candidate, the actual WordPress sign-in and reopen buttons each opened Claude's sign-in page. Waiting, code-entry availability and direct Bridge connectivity were verified. The test was cancelled through its WordPress Cancel control without authorizing a new session. Only the five test-created cancelled sign-in tabs were closed. Official runtime status remained authenticated afterwards.

## Completed provider authorization and native transport

- Direct WordPress: the actual sign-in button opened official authorization with Desktop closed. The user authorized it; the owned runtime verified authentication. Settings refreshed automatically without Rescan and retained Sign in again after closing/reopening settings.
- Chrome native messaging: the permanent-ID extension used a separate test native-host registration and profile. Browser HTTP requests to the candidate Bridge were blocked, and responses identified the actual `chrome-extension` route. Production registration and configuration were not replaced.
- Manual recovery: Open sign-in page reopened the runtime-emitted official recovery URL. After the duplicate automatic-callback tab was closed, the user authorized, entered the returned code only in WordPress, and clicked Complete sign-in. The code endpoint was observed without recording its body. The backend reached verified `connected`; the code field disappeared; automatic refresh and settings reopen passed without Rescan.
- Browser restart and page reload preserved the extension connection, verified Claude authentication and available reauthentication action without Connect or Rescan. The reload harness initially lacked WordPress session cookies; restoring the authorized fixture session corrected the harness without a product change.
- An earlier automatic callback page reported a refused localhost connection. A cancelled diagnostic login may have left that stale page open; its ownership cannot be established from the available evidence. The successful fresh direct flow and real manual recovery are recorded separately. This is not evidence that every possible callback failure is fixed.

Final fingerprints confirm content/chat tables and saved preferences were unchanged; only the automatic entitlement cache refreshed. Official authentication remains active after the user-authorized refresh. The isolated native-host registration was removed after testing, with production registration, host and config hashes unchanged. Test-profile consent was retained. Published packages, updater settings and normal Chrome permissions were unchanged.

## CI, staging inspection and remaining limits

All three workflows executed successfully for source commit `441754c595f1e670da443a22601d8cdb2803a77a`: Free validation (41076431359), Native transport prototype (41076431679, including the new Claude recovery step), and Unified chat validation (41076431205). This final documentation update changes no runtime code.

Read-only inspection of the reporting customer's staging site confirmed active Core/Pro v2.1.3 and exact parity for all 14 observed Core JavaScript assets against the deployed ZIP. No customer settings, plugins, chats or content were changed. Its Bridge endpoint targets the visitor's own computer, so testing from this machine does not establish the cause of the customer's original intermittent connection or browser-launch failure. Customer-side Bridge/runtime versions and diagnostics remain necessary for that attribution.

Desktop/mobile layout, transient errors and permission rejection have automated coverage. Real OAuth acceptance above was Windows desktop only; no macOS acceptance or production deployment is claimed. Pro consumes the shared Core changes and its browser build passed; no separate Pro implementation or Team changes are included.
