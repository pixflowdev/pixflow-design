# Local Docker harness

This is a developer harness for the shared runtime. Install the WordPress plugin
and Bridge using [Pixflow's setup guide](https://docs.pixflow.dev/plugin/getting-started/).
The repository does not advertise a maintained public container image.

From `deploy/`, copy `.env.example` to `.env`, generate a random `OD_API_TOKEN`,
and build the checked-out source locally:

```sh
docker compose build
docker compose up -d --pull never
```

Keep the listener on loopback and retain the existing named volume. The compose
service, volume and `OPEN_DESIGN_*` environment identifiers are compatibility
keys; changing them can disconnect existing data. See [the harness notes](../../deploy/README.md).
The harness defaults to local development: keep authentication enabled and do not
expose its listener publicly without configuring authenticated access and TLS.


## Bundled resources and personal data

The image carries maintained Free skills, essential `guidance/` routers,
prompt templates, device frames and bundled pets. It does not copy the retired
plugin, craft, design-template or design-system source catalogues. Personal
resource imports, conversations and projects remain in the existing
`open_design_data:/app/.od` volume; rebuilding the image does not replace it.

The cross-boundary resource check in `e2e/tests/pixflow-router.test.ts` validates
that Docker COPY sources exist and essential guidance survives the runtime
stage. A native image build is a separate validation step.
