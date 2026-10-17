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
keys; changing them can disconnect existing data. See [the harness notes](../../deploy/README.md)
and [network security](../network-security.md) before changing exposure.
