# v2.1.3 source and platform reconciliation

Final plugin/runtime payload: Core `e6ec0e0a7ee15c70fbe06ad7974d2fb0b6d11cd7`, Pro `e3b7b86d6ea1e1129200a0a5cc2cfe849f1d6e5f`. Subsequent release-branch commits record evidence only. Core/Pro release assembly is reviewed in #55/#30 and includes the licence, chat readiness and minimise fixes.

Mac DMGs were built from Core `c9d1481944e5020c2b82e48b54754b5c811b8a24`, Pro `fc7c469f7d765a78077181bc4ec958508d63b310`. Retain those exact source identities in the artifact manifest; do not relabel them as builds from the newer plugin pair.

## Why these Mac binaries remain compatible

Compared both immutable source pairs, rather than comparing moving branch tips:

- Core daemon, desktop, packaged app, contracts/packages, native transport and Next app entry sources are identical, ignoring blank lines. The compatibility Bridge entry differs only by a trailing blank line.
- The only changed Core web implementation is `pixflow/use-durable-chat-history.ts`. Its sole consumer is `WpAdminAgentFrameApp`, reached through `WpAdminOnboardingHost` from `pixflow/wordpress-entry.tsx`. That entry is built by `scripts/build-wordpress-web.mjs`, not by the packaged Next application. It is delivered in the final WordPress plugin ZIP.
- Other Core changes are WordPress PHP/resource pins, tests, workflows, version assertions and documentation. They are not packaged application implementation changes.
- Pro standalone application source and Bridge workflow `skills/web-clone` are unchanged. Its implementation change is the WordPress-owned `wordpress-pro/assets/pixflow-design-builder.js` minimise fix, delivered by the final Pro ZIP. Other changes are metadata, tests and documentation.
- The Bridge runtime archive recipe includes daemon/packages/native compatibility resources and the authoritative workflow manifest, not WordPress PHP, WordPress browser entry or Pro builder assets.
- All three native helper hashes exactly match the Mac build receipt and the Windows payload: host.mjs `e5734affe5454b61ec785d1e82e53b75c519ed725914cb313bc82e2281fdebb6`; install.mjs `dff8e0609e40cb79466390554f7c029a83124182ffd3b853d3b1f591af1e5625`; config.json `9e43de61915fc597e1b1cc2d73e747b785d02a4252292512555993f77184d478`.

This supports reusing the verified Mac DMGs with the final plugin ZIPs. It does not imply the whole repositories are identical or that Mac testing covered the later WordPress-only fixes. Those fixes have their own Core/Pro CI and local installed-plugin preservation evidence.

## Final Mac assets

Draft release `bridge-v2.1.3`, ID `428584804`:

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| pixflow-design-bridge-2.1.3-mac-arm64.dmg | 209996027 | f9bf8b3e016dbb8a5b54c5e247d2fd4de8818177a2bbae6699d362b43db31884 |
| pixflow-design-bridge-2.1.3-mac-x64.dmg | 221105005 | cb3a98f7a188f382bc405308b5c55d76c1b35a0c27dc2e626187c16005745f5b |

Mac reports both DMGs passed image verification, identity/version, portable configuration, architecture/native helper checks and strict/deep ad-hoc signature verification. They are not notarized. Intel build used Rosetta; no physical Intel acceptance is claimed. Targeted usage UI/model/recovery checks passed. Keep the existing public signing disclosure accurate.

The imported Mac receipt directory is evidence only; the earlier Mac release-preparation branches must not replace the final WordPress plugin sources. Public deployment remains gated on independently verified server-side artifact hashes, merged release PRs and final website transaction acceptance.
