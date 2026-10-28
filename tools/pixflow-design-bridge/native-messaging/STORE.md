# Chrome Web Store draft

Submitted 28 October 2026: version 1.0.2 is Pending review. Owner-authorized data-usage certifications are saved. Automatic publication is disabled; approval stages the extension for later publication. Live plugin and Bridge packages are unchanged. Earlier verification sections are chronological preparation records; see the final submission receipt in docs/testing/2026-10-28-store-final-reconciliation.md.

- Name: Pixflow Design Bridge
- Store draft version: 1.0.2; package and permission explanations are saved. Reviewer instructions were updated for the matching reviewer-only installer on 28 October 2026.
- Permanent extension ID: `hbnbiboohlelmngadeolikeejamjlbkh`
- Native host: `dev.pixflow.bridge`
- Approved native origin: `chrome-extension://hbnbiboohlelmngadeolikeejamjlbkh/`
- Production Bridge endpoint: `http://127.0.0.1:7456`
- Customer sites: discovered from the existing Bridge pairing, never embedded in the package.

Build browser assets and the matching installer payload with:

```powershell
pnpm exec tsx tools/pixflow-design-bridge/native-messaging/store-build.ts hbnbiboohlelmngadeolikeejamjlbkh
```

Only `.tmp/chrome-store/browser` belongs in the extension ZIP. The native payload is separate. Never package the parent directory: it may contain isolated browser profiles and private test evidence.

## Verified

The Store accepted the browser ZIP and assigned the ID above. Listing copy, permission explanations, data categories and reviewer prerequisites were saved as drafts. No compliance certifications were accepted and nothing was published.

The Store public key was used in a disposable browser profile to verify that Chrome assigns the exact permanent ID. Windows native registration, paired-site discovery, health, reload, explicit direct mode, reconnect and foreign-origin rejection passed against the isolated Bridge. Registration was removed afterwards. The test overrode the Bridge port to 17467 and used prior site approval; it is not customer-installer or new interactive-permission acceptance. Earlier interactive onboarding was confirmed by the user, including automatic popup opening and readable layout.

The 41 native tests, module typecheck and production signed-authorization boundary test passed. Production authorization coverage includes missing, expired, revoked and wrong-installation grants. It is not a full installed production-session acceptance run.

## Customer Windows installer verification

The full archived v2.1.1 payload exposed a missing `bin/node.exe` assumption in native registration. The installer now uses the packaged Electron runtime in Node mode when a standalone Node binary is absent; the generated native launcher preserves that mode.

A separate install identity passed full installation, repair, exact native payload and Store-ID registration checks. The installed runtime passed native health, pairing, reload, explicit direct preference, reconnect and foreign-origin rejection against an isolated Bridge port. Uninstall removed its registration and install directory while preserving the synthetic saved-data hash. Normal customer runtime data and published packages were untouched.

The separately prepared Windows review installer uses the original customer identity and the same tested archives/hooks. Its SHA256 is `65be3f4c09f2863f0b92396415e2749419b3a6db2f36c9217b7cdeff2b2b0051`. It is for a clean reviewer Windows environment, not a published updater artifact. macOS/Linux installer acceptance is still outstanding.

All 41 native tests, three packaging tests, module typecheck, repository guard and full typecheck passed after the fix.

## Store and reviewer handoff

The 1.0.1 ZIP is saved in the existing Store draft. Dedicated reviewer credentials and instructions linking the review guide are saved in Google's confidential Test instructions section. The extension privacy URL is saved. Certifications remain unchecked and the draft has not been submitted.

## Before submission

- Current 1.0.2 permissions are `nativeMessaging`, `storage`, `scripting`, `tabs`, `activeTab` and `alarms`. Update the older Store explanations: `activeTab` supports user-initiated pre-consent site discovery; `alarms` supports reconnection after Bridge starts. Neither grants persistent host access. The earlier 1.0.1 permission-removal statement is historical and no longer describes the candidate.
- Public policy updated and verified at https://pixflow.dev/privacy#browser-extension. Store disclosures cover personal information, authentication, chat communications, website content and local tab-address processing (Web history). No browsing-history log is retained.
- Dedicated reviewer WordPress login is available at https://docs.pixflow.dev/extension-review/wp-admin/ and its new synthetic account credentials are saved only in the Store confidential reviewer form/private local evidence. The separate Windows download and guide are verified at https://docs.pixflow.dev/extension-review/reviewer-guide. An independent in-app-browser download matched the full installer hash and byte count. Normal HTTPS-subpath PKCE pairing passed; unauthenticated, wrong-verifier and replay attempts were rejected, and the test token was revoked. Do not use public downloads as a substitute.
- Test the final installer with this ID on each advertised platform. macOS/Linux filesystem contract tests do not replace actual installer acceptance.
- Public reviewer native session passed with the permanent ID: real Free read-only Codex streaming, steering, navigation reattachment, explicit direct preference and reconnect. Unknown run credentials, revoked WordPress sessions and foreign origins were denied. This used the installed Windows native host with an isolated development daemon on port 7456 and prior permission in a disposable profile. A fresh customer-machine installer run and new interactive permission removal/recovery remain distinct checks.
- Obtain the owner's confirmation for the Store's final compliance certifications and review submission.

The plugin/Bridge maintenance release remains independent of extension approval. Do not alter live packages or updater settings as part of Store preparation.

## Privacy copy for review

The optional Pixflow Design Bridge browser extension connects approved WordPress sites to Pixflow Bridge on your computer. It reads the active tab's address to determine whether that site matches your Bridge pairing and to offer setup. It does not retain a browsing-history log or send tab addresses to a remote analytics service.

The extension stores connection preferences and whether setup has been shown locally in your browser. With your site permission, it relays Pixflow requests and responses, which may include prompts, chat messages, attachments, page content and site/session authentication information, to Bridge on your computer. Bridge and your selected AI agent/provider then process the requested work under their applicable settings and policies. Using a local Bridge does not mean the AI provider processes everything locally.

You can remove a site's extension permission in Chrome or choose the direct connection in the extension. This stops extension access; it does not delete your WordPress conversations, settings or Bridge data. The extension does not sell data, use it for advertising or credit decisions, or collect it for unrelated purposes.

Platform acceptance plan: see [PLATFORM-ACCEPTANCE.md](PLATFORM-ACCEPTANCE.md). macOS/Linux automatic registration and persistent launchers are now implemented in source and tested at contract/entrypoint level. Actual platform installer acceptance remains outstanding. Seven focused installation/Store-contract tests passed on Windows on 28 October; they do not establish other-platform installer acceptance.

## Reconciled candidate — 28 October 2026

The historical checks above are not all checks of the final package. See [the current reconciliation](../../../docs/testing/2026-10-28-store-final-reconciliation.md) for the immutable source, package hash, latest Apple Silicon report and remaining gates. Apple Silicon installer acceptance has since passed; Intel Mac and Linux acceptance remain unverified. The final Windows browser check must use the permanent Store identity and matching native payload. A successful prototype-ID test does not establish that acceptance.
