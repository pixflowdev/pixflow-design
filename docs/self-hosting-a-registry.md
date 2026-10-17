# User-managed plugin registries

Pixflow can read an external HTTPS catalogue that you manage. It does not ship a default community registry or a catalogue publication service. A catalogue is an `open-design-marketplace.json` document using the [marketplace index schema](schemas/open-design.marketplace.v1.json).

Keep the catalogue and plugin sources in your own repository or storage. Its layout is independent of the Pixflow source tree. Each entry identifies its plugin name, version and supported source; preserve licence, publisher and integrity metadata when distributing third-party content.

## Add and inspect a catalogue

With the daemon running, use the raw JSON URL:

```sh
od marketplace add https://example.com/open-design-marketplace.json --trust restricted
od marketplace list --json
od marketplace refresh CATALOGUE_ID
od marketplace search "my workflow" --json
od marketplace doctor CATALOGUE_ID --strict --json
```

Replace `CATALOGUE_ID` with the ID returned by the add or list command. A GitHub tree page is HTML and cannot replace the raw JSON document. `restricted` discovery does not grant execution capabilities; inspect the source and required permissions before trusting it.

Install an entry by its exact catalogue name, then inspect its recorded provenance:

```sh
od plugin install vendor/my-workflow --json
od plugin info vendor/my-workflow --json
```

Version, dist-tag, integrity and yanked-version metadata remain supported by the catalogue format. Catalogue authors maintain those bytes through their own publication process. Pixflow no longer provides catalogue publish/yank commands or a GitHub PR publication backend.

## Authentication and preservation

`od marketplace login` delegates GitHub authentication to `gh`; tokens stay in GitHub CLI. It does not configure arbitrary HTTPS server credentials or guarantee that a private raw endpoint is readable by the catalogue fetcher. Configure and verify the chosen host's supported access before relying on a private catalogue.

The former Pixflow/Open Design official and community catalogue URLs return a retirement error before fetching. Their saved metadata and installed resources remain intact, but they cannot resolve new installations. Use an explicit URL for your own catalogue rather than refreshing a retired default.

For local authoring and publication to your own GitHub repository, see [sharing a personal plugin](publishing-a-plugin.md). Keep customer data, credentials and internal operational evidence outside resource sources and archives.
