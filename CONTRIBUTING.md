# Contributing to Pixflow Design

Pixflow Design Free provides AI-assisted WordPress administration and Gutenberg editing. This repository also maintains the shared browser contracts and Bridge toolchain. Premium implementations belong in the separate Pro repository.

## Before changing code

Read [README.md](README.md), [QUICKSTART.md](QUICKSTART.md), [AGENTS.md](AGENTS.md) and the guidance for the module you are changing. Keep fixes focused and describe the customer-visible problem. Discuss larger architectural changes before implementing them.

Maintain the existing WordPress plugin identity, routes, saved content, chats, settings and licensing boundaries. A source cleanup must not delete customer data or silently reduce functionality.

## Development and validation

Use Node 24 and pnpm 10.33.2. Install frozen dependencies with `pnpm install --frozen-lockfile`. Run `pnpm guard`, `pnpm typecheck` and the tests/builds relevant to the change. Free must pass its checks without Pro source. Changes to the shared interface must also be verified with the pinned Pro consumer before a coordinated release.

Prefer TypeScript for new project-owned scripts and modules. Keep tests outside source directories. Reuse shared UI primitives and maintain complete translations, accessible labels and the established theme tokens.

For a bug fix, add a focused regression test where practical. Record the result and relevant limitations. Do not claim live editor or provider acceptance from a mocked test.

## Pull requests

Use the repository's pull-request template. Explain what users will see, the reason for the change, affected UI/CLI surfaces, validation and any migration considerations. Keep screenshots free of personal data. Commits must not include co-author metadata.

Do not include API keys, credentials, licence values, customer captures, database exports or internal operational/security reports. Preserve upstream copyright and dependency licence notices. Report suspected security issues privately through Pixflow's official contact channel rather than posting exploit details in a public issue.

## Releases

Development artifacts must be isolated from published packages. The website and WordPress.org packages are distinct targets; see [directory build instructions](wordpress/directory/BUILD.md). Repository changes do not authorize deployment, publication, updater changes or changes to repository visibility.
