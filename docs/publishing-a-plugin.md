# Share a personal Pixflow Design plugin

Personal plugins remain supported. The inherited Pixflow community catalogue and its submission commands are retired. This guide covers local authoring and an optional publication to your own GitHub repository; it does not submit anything to a Pixflow registry.

## Create, validate and pack

Use a working directory outside the Pixflow source tree:

```sh
od plugin scaffold --id my-workflow --title "My workflow" --out ./personal-plugins
od plugin validate ./personal-plugins/my-workflow --no-daemon --json
od plugin pack ./personal-plugins/my-workflow --json
```

Replace the scaffold instructions before using it. The folder contains `SKILL.md` and `open-design.json`, with optional references and assets. Keep the source author's licence, credits and attribution when adapting an existing skill. See the [manifest reference](plugins-spec.md) and [skills protocol](skills-protocol.md).

## Install locally

With the daemon running:

```sh
od plugin install ./personal-plugins/my-workflow --json
od plugin list --json
od plugin info my-workflow --json
```

Installation preserves resource identity and provenance. It does not connect external accounts, authorize remote actions or activate premium integrations.

## Publish to your own repository

Review the folder and repository target before publishing. This command can create a **public** repository and push plugin files and version tags:

```sh
od plugin login
od plugin whoami --json
od plugin publish-repo ./personal-plugins/my-workflow --owner YOUR_GITHUB_LOGIN --dry-run --json
```

The dry run prepares the workflow without publishing. After reviewing its target, repeat the last command without `--dry-run` to publish. GitHub authentication remains in `gh`; Pixflow does not store those credentials. The command uses the manifest's `plugin.repo` or resolves the target owner through the supported GitHub workflow. Never include customer data, credentials or private operational files in the plugin folder.

For an external catalogue you manage, see [user-managed registries](self-hosting-a-registry.md). The retired `od plugin publish`, `od plugin open-design-pr` and `od plugin yank` commands are unavailable. Existing installed content and saved snapshots are preserved.
