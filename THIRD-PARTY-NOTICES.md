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

## Shared chat UI components

Trace, Message, Bubble, Attachment, Hover Card, Message Scroller, Questionnaire, Input Group and Code Block compositions adapt shadcn/ui (https://github.com/shadcn-ui/ui).

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Base UI

Shared chat disclosures use @base-ui/react (https://base-ui.com/).


MIT License

Copyright (c) 2019 Material-UI SAS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
