# Translating Pixflow Design

WordPress packages bundle English. The other supported languages are published as versioned, hash-pinned data packs and installed outside the plugin directory. Do not restore foreign dictionaries or MO/PO files to the Free or Pro ZIPs.

## Source catalogues

The shared dictionary contract is `apps/web/src/i18n/types.ts`. Maintain complete messages in all 19 locale sources under `apps/web/src/i18n/locales/`. Preserve named placeholders, command examples, stored identifiers and user content. Translated display labels must not change saved page, design or chat identifiers.

Add a key to the typed contract before using it. Follow the app's existing locale-loading boundaries; Pro consumes the shared language context rather than shipping a separate copy.

## Verification

Run:

```powershell
pnpm exec tsx scripts/i18n-coverage-report.ts
pnpm --filter @open-design/web typecheck
```

Run the focused i18n tests and inspect the affected interface, including right-to-left layouts and longer translated labels. Catalogue parity alone does not establish complete UI coverage.

## Language packs

`scripts/build-wordpress-language-packs.ts` builds immutable downloads and `wordpress/resources/language-packs.json`. Publish the exact new data bytes before releasing a plugin that references their hashes, and retain earlier published hashes for existing installations. Signing, hosting and operational credentials belong outside this repository.

Selecting a downloaded language must update mounted UI roots immediately, without reloading. Failed downloads must retain the current preference. Never alter chats or host-editor content as part of language switching.
