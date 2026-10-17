# Codex image generation in floating panels

Settings → Execution mode → Local CLI → Codex includes **Override media provider for image generation with compatible models**. It is off by default and is saved in the bridge's app config as `codexImagegenOverride`.

The same setting is available through the existing config HTTP API and CLI:

```sh
od config set codexImagegenOverride true --json
od config get codexImagegenOverride --json
od config set codexImagegenOverride false --json
```

In Direct mode, both the WP Admin and Bricks panels prefer the selected Codex session's native imagegen skill/tool when this setting is enabled. Availability is determined by the tools available to that session; image-input support and model names are not treated as proof of image-generation support. If native generation is unavailable, the agent uses the configured image provider. Other agents and video generation retain their provider workflow.

The run-local `site-tool.mjs media.import @metadata.json` helper accepts the actual output path and uploads its bytes with `filename`, `mimeType`, `title`, `altText`, and `prompt`. WordPress calls its existing `MediaLibraryService::save_generated` implementation, preserving generated-media naming, attachment metadata, image sizes, and content-hash deduplication. The helper requires title and alt text. Ask/Plan sessions cannot import media. An import error must be repaired rather than generating another image through a provider.

The guarded Bricks runner uses its existing media project and generated-media tokens. Native output is copied into that project and returned through the established WordPress attachment importer before applying the Bricks mutation. Missing output does not trigger an automatic second provider generation.

The integration depends on the selected session exposing native image generation. Inspect existing generated output before retrying a failed retrieval. WordPress's image editor owns derivatives and responsive metadata; generation alone does not prove thumbnail support on the host.
