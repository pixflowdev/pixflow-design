# Third-party notices

## Upstream source

Pixflow Design derives from [Open Design](https://github.com/nexu-io/open-design),
licensed under the Apache License, Version 2.0. Pixflow modifies that source for
WordPress integration, its Free/Pro architecture and the Pixflow interface.
The complete licence is retained in `LICENSE`. Copyright and attribution notices
remain alongside their respective source files.

Third-party dependencies and resources retain their own licence terms. The
WordPress.org build generates package-specific notices from its actual inputs.

## Separate Pro authentication components

The following credits concern authentication components maintained in the separate
Pro add-on; these components are not included in the Free WordPress package:

- **lbuchs/WebAuthn 2.2.0** — Copyright Lukas Buchs and contributors, licensed
  under the MIT License. The complete license is shipped at
  `vendor/lbuchs/webauthn/LICENSE`.
- **qrcode-generator 2.0.4** — Copyright (c) 2009 Kazuhiko Arase, licensed
  under the MIT License. It renders authenticator setup QR codes locally in
  the browser. The complete license is shipped at
  `assets/vendor/qrcode-generator/LICENSE`.

The two-factor provider architecture is independently implemented from public
WordPress authentication APIs and informed by the open-source WordPress
Two-Factor project. The passkey request boundaries and fail-closed malformed
response handling were also reviewed against the MIT-licensed WebAuthn Provider
for Two Factor project. No source from either plugin is bundled; this avoids
bringing the GPL plugin into Pixflow and avoids the WebAuthn provider's runtime
dependency on a separately installed Two-Factor plugin.
