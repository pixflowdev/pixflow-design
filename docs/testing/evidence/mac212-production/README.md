# Pixflow Design Bridge v2.1.2 — production Mac draft artifacts

29 October 2026. Built under the coordinator authorization in `docs/testing/2026-10-29-mac-v212-production-build.md` at `da4cf48c3d4551ba784a6742b60b2018503a4390`.

## Sources and reviews

- Core: `3c77ca403e2d5a3ceaac845c3619e011ae3d9696` — [PR #45](https://github.com/pixflowdev/pixflow-design/pull/45).
- Pro: `4271c500eae347288af3ddfd68bc17da43b37e5e` — [PR #25](https://github.com/pixflowdev/pixflow-design-pro/pull/25). Exact Core pin enforced; module API 14.
- Reviewed implementation baseline: Core `7c90aca799b4bea03db320e3e65247cc065715ff`, Pro `17b358fb11dcfdbab6e4f8e095c1a981b3dc497a`.
- Includes [popup fix #44](https://github.com/pixflowdev/pixflow-design/pull/44), commit `e4397c40a00088024fb42d9d7fa95bf8debebb7b`.
- Release preparation changed only version identities, release notes and Pro's exact pin. No Team changes or pin bypass. Separate clean arm64/x64 worktrees; Node 24.19.0, pnpm 10.33.2 and frozen lockfiles.

## Artifacts

Exactly one production extension-ready DMG per architecture, retaining direct access:

| Artifact | Bytes | SHA256 |
|---|---:|---|
| pixflow-design-bridge-2.1.2-mac-arm64.dmg | 209977197 | a17263235bd4246343a74640b612ae726a2f2f4b4ad712fa0d9c3960b16bc510 |
| pixflow-design-bridge-2.1.2-mac-x64.dmg | 221105338 | 83a96b1ede8ee398bfac434f67c66112218646d5f4f34d91023c0d8bf6b85873 |
| pixflow-design-bridge-extension-1.0.3-v2.1.2.zip | 42754 | 5ee8924e5dc62e8be9d73570a52da3f57403a1e1b5ce586dfffb0ac977087b41 |

The ZIP is browser-only, manifest version 1.0.3, rebuilt with the popup correction. It is separate from the installers and contains no embedded customer origins or test public manifest key. The original archived 1.0.3 ZIP was not overwritten. Browser payloads built in the arm64 and x64 lanes matched byte-for-byte.

## Validation

- Core and Pro guard/typecheck passed. Pro build-contract tests: 3 passed. Native popup/reconnect regression tests: 9 passed.
- Both bundles and launchers identify as **2.1.2**, stable `dev.pixflow.bridge` / `Pixflow Design Bridge`; no RC version. Portable config has no build-machine data paths.
- `hdiutil verify` passed for both DMGs. Read-only mounting verified the actual shipped identities, config, payload hashes and signatures.
- All 18 Mach-O binaries in each bundle include the expected architecture, including Electron and native modules. Intel was built and run with x64 tooling under Rosetta on an Apple Silicon Mac, **not a physical Intel Mac**.
- Both bundles passed strict/deep code-signature verification with **ad-hoc signatures**. They are **not Developer ID signed or notarized**; no Gatekeeper distribution approval is claimed.
- Matching native payload included in both bundles; permanent extension ID `hbnbiboohlelmngadeolikeejamjlbkh`. Correct `/api/test/connection` allowance verified in shipped helper bytes.
- Both installed artifacts launched and returned version 2.1.2 through direct loopback and framed native-host health requests. Wrong extension identity and unapproved origin were rejected.
- Native registration and repair used an isolated per-user registration fixture pointing to each actual installed executable. The normal Chrome manifest and native payload remained byte-identical. This is not a claim that these artifacts replaced the user's normal native registration.
- Installed repair/restart preserved all eight files in each populated isolated runtime data directory. Artifact-specific smoke checks are read-only transport checks, not a rerun of every functional chat scenario.
- Prior functional acceptance is reused as authorized. Automatic Claude card refresh and permission removal/recovery are owner-reported manual passes from the coordinator handoff, not relabelled automated results. Claude steering is excluded. Live five-minute timeout was waived; deterministic tests passed. No claim of every provider/panel permutation or independently installed standalone CLI coverage.

## Publication and preservation

Target: [GitHub draft bridge-v2.1.2](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-672053e956d050394f51), release ID `427963549`. Production version, `prerelease=false`, **draft=true**. Asset receipts record server digests and independent DMG download hashes after upload.

No release publication, Store submission, updater-pointer change, customer deployment or v2.1.1 asset replacement. Existing chats/settings and normal Chrome permission/registration state were preserved. Artifact runtimes are stopped after verification and the prior isolated acceptance app is restored. Staged installer checkouts and backups remain available; they are not the user's normal Applications installation.
