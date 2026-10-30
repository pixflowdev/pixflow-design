# v2.1.3 deployment preparation — 30 October 2026

Payload Core: e6ec0e0a7ee15c70fbe06ad7974d2fb0b6d11cd7. Final Pro: e3b7b86d6ea1e1129200a0a5cc2cfe849f1d6e5f (pins that Core). Core 963574ae only changes handoff documentation. Team is excluded. Published packages and updater pointers are unchanged.

Artifacts prepared:
- Free ZIP: 2395119 bytes, SHA256 490a0be3ec5d2ac057d97758f80639f37b480903f9bad4757f5f3d06d0ca5a6a.
- Pro ZIP: 6087923 bytes, SHA256 97a21849e5480bd997a4c73c9c7e886b1dc9e462ed381dd59a6f7683d059c18b.
- Bridge runtime ZIP: 4685905 bytes, SHA256 4f7a3b61e821e6d29a3ee5497c287ec23f72b41e8f47d006f176f4a570a619af.
- Windows NSIS: 248235764 bytes, SHA256 d30d673e587e79d877a45d29e1c63ee880d9ae22da1fe06b08ec62593b945447.

Core/Pro CI green. Guard, typechecks, 22 usage backend tests, 31 combined UI tests, six native relay tests, nine licence preservation scenarios, release-version assertions and Pro contract tests passed. Eighteen language packs were regenerated and their hashes verified. Website preparation also retains 126 older language objects and privately verifies download behavior. No publication has occurred.

Local WordPress upgraded using both final ZIPs. Content/chat table hashes and saved preferences stayed unchanged. The entitlement cache refreshed during follow-up validation. ZIP identities/versions and foreign-catalogue/secret-path exclusions pass. Windows NSIS archive integrity passes; generated packaged configuration is version 2.1.3 with relative runtime paths. Pro build receipt records the exact clean Core pin.

Remaining gates: Mac usage acceptance and both architecture DMGs; review/merge Core #55 and Pro #30; reconcile all source/build receipts and platform hashes before selecting the staged updater metadata. No physical Linux acceptance is claimed. Linux install script and cross-platform runtime are prepared.

Mac instructions are in docs/testing/2026-10-30-mac213-usage-handoff.md on codex/mac213-usage-handoff. The starting pair has been updated to include the licence, chat-loading and minimise fixes, preventing a second build solely to add those changes. Any Mac fix changes the frozen pair and must be reconciled before promotion.

Windows installed-payload acceptance now passes: see [redacted receipt](evidence/windows213-smoke.json). All 11,418 files match, upgrade/reinstall preserve 40 test files, direct/native usage reads and graceful restart recovery pass. Shared native registration restored; temporary test pairing revoked and QA Bridge stopped.
