# Pixflow Design Bridge v2.3.1 Mac build receipt

Built on Apple Silicon, macOS 26.5.1 (25F80), from Core `7de674745c7207b5320a96e7f8c311c4f6f620fb` and Pro `a96bca545e8655c2a55ae107dadcfcf7616879df`. Pro's manifest names that exact Core revision and module API 14. Both source trees passed the clean-source checks without an override. The committed source includes Core #133 and Pro #73. No version or CSS patches were applied.

Each architecture used its own checkout and frozen pnpm 10.33.2 dependencies. The build used native arm64 Node 24.22.1 and x64 Node 24.19.0 under Rosetta respectively. After dependency installation, the build restored four executable mode bits that pnpm changed on tracked entry points. The desktop and packaged entry builds and the Mac packager ran with the repository's Bridge identity and icon recipe, native messaging payload, portable configuration and stable namespace.

The Mac keychain had zero valid code signing identities. The local images use ad hoc signatures and are for validation. Notarisation was skipped per the owner's instruction. The handoff specifies Developer ID Application signing before upload. The existing Bridge draft targets the pinned Core revision.

Exact-pin automated checks passed. These include the release version check, 84 web tests, 15 daemon entitlement tests, 85 paired Bricks destination checks and 77 translation tests. Both matching WordPress v2.3.1 draft ZIPs were downloaded and verified against their GitHub SHA-256 digests and version headers. The Pro ZIP contains the exact merged Bricks PHP fix.

Both images passed `hdiutil verify`, were mounted read-only, and matched bundle ID `dev.pixflow.bridge` and version `2.3.1`. The app, Electron, bundled Node and SQLite binding matched their target architectures. Each selected `open-design/bin/node`, reported Node 24.22.3, included the Node licence and ran the SQLite in-memory query. Strict code signature verification passed for both apps and bundled Node binaries. Gatekeeper rejected both apps. Both installed app copies started and reported Bridge 2.3.1 healthy, with both sidecars running the bundled Node. Apple Silicon passed direct site switching and packaged Chrome native host enrollment and health. The Intel app ran under Rosetta. The previous v2.3.0 Bridge was restored and verified healthy.

The two local validation DMGs are named `pixflow-design-bridge-2.3.1-mac-arm64.dmg` and `pixflow-design-bridge-2.3.1-mac-x64.dmg`. Their hashes are in `SHA256SUMS-mac.txt`. Final browser upgrade, Chrome popup and live provider acceptance on the Developer ID signed installer remain open. The preceding QA receipt covers the successful live Codex Bricks and translation flows on the previous build. No Mac assets were uploaded to the release draft.

Local validation hashes

```text
43aa754bf5f82865ed00b4922540fcbead518d5a60665684d3baebf24c90845c  pixflow-design-bridge-2.3.1-mac-arm64.dmg
efbb7b3f637031daf2fe78f3220e39628f394b347bf0939f5d0f7ff53cc5a054  pixflow-design-bridge-2.3.1-mac-x64.dmg
```
