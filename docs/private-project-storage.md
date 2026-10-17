# Private WordPress project and resource storage

Workspace project files must not be served directly from WordPress uploads.
Project visibility and authenticated REST downloads cannot protect a second,
public filesystem URL. This storage rule applies to Free and Pro equally.

The same rule covers resource-pack HTML, reference assets and script-bearing
recipes. Resource previews use authenticated sandboxed REST delivery, and agent
handoffs retain their authenticated asset-bundle route. There is no public
resource-pack base URL.

## Location and migration

The plugin discovers the web server's real document root and chooses a
site-specific `.pixflow-private-<hash>/projects` directory alongside that root.
It stores the resolved path and its installation origin in WordPress options.
CLI and cron reuse that path; they do not guess the web root from `ABSPATH`.

Hosts may set an absolute `PIXFLOW_DESIGN_PRIVATE_PROJECT_DIR` constant in
`wp-config.php`. Its value is the **projects directory itself**. It must be
outside every directory served by this site or any other virtual host, and
writable only by the appropriate hosting account. Never put it in uploads,
the plugin directory or a shared/public temporary directory. Custom aliases
and other virtual hosts cannot all be detected by the plugin.

Existing `uploads/pixflow-design/projects` content moves as one locked, atomic
directory rename. Database paths retain their old logical prefix; the prefix
is no longer a physical public location. Migration checks tree metadata before
and after moving. It does not discard old file types or create a public backup.
Concurrent requests use the same migration lock.

Resource packs use a separate `.pixflow-private-<hash>/resource-packs` tree.
Hosts can configure `PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR` with the same location
requirements as project storage. Old absolute resource paths in the database
resolve to the private location without rewriting saved records. Bundled
examples are shipped as `resources/bundled-library.zip` and expanded privately
under `_bundled/<archive-hash>`. Loose legacy `skills`, `plugins`,
`prompt-templates`, `design-templates` and `design-systems` directories left by
an in-place plugin upgrade move into `_legacy-bundled`; they are not deleted.
Current bundled resources take precedence over preserved legacy entries.

The plugin refuses linked paths, an unsafe public root, a copied database's
unbound storage path, or a conflict where both old and new trees exist. It never
merges those trees or overwrites one automatically.

## If migration cannot complete

An administrator notice explains the failure, and project API operations return
503 rather than continuing to use public storage. **That does not make legacy
URLs private:** the web server can still serve old uploads until the host moves
them or denies direct access.

Resource migration failures also return 503 for catalogue operations and show an
administrator notice. If a plugin upgrade left loose examples or recipes in its
old public directories, block those directories too until they are migrated.
Do not block the plugin's normal PHP entrypoints or its public UI assets.

For a non-writable parent directory, a different filesystem or a custom hosting
layout:

1. Back up the database and complete project tree to private storage. Pause
   project/agent writes and scheduled work during the migration.
2. Have the host deny direct HTTP access to the old projects directory using
   the server's actual configuration. Do not rely on `.htaccess` on Nginx/IIS.
3. Provision a dedicated private directory and set the constant above. Move the
   entire existing tree there, retaining UUID directories, versions, assets and
   files. For a cross-filesystem copy, verify file counts and hashes before
   removing the old public copy. Keep any backup outside served directories.
4. If both trees already exist, compare them and resolve conflicts offline;
   never delete either tree merely to clear the notice.
5. Load WordPress, confirm the notice clears, and test an authorized project
   download/export. Check that anonymous access and another user's private
   project access are denied. An old URL may return the theme's fallback page
   with HTTP 200; check that it does not return the original file bytes.
6. Resume writes only after those checks pass.

Apply these steps separately to `resource-packs` and its constant when resource
migration is affected. Do not merge project and resource roots. Retain installed
pack/version paths and all preserved legacy collections. Verify authenticated
resource previews and asset-bundle downloads as well as project export.

## Backups, restores and deactivation

Backups must include both private directories **as well as the database**.
A standard uploads-only backup will no longer contain workspace files. When
moving or cloning a site, relocate its private tree and explicitly configure
the new path before using projects. Do not point a clone at the original site's
directory. The saved origin check intentionally refuses this by default.

Keep private storage when deactivating Pro or changing licences. Free still
supports authorized cleanup and exports. When rolling back plugin code, restore
a compatible database/plugin/private-tree snapshot; do not move files back to
public uploads to make older code work.

## Delivery and remaining scope

The stored-file REST route checks the current user's project permissions and
uses private/no-store, no-referrer, no-sniff and sandbox headers. Browser links
include a WordPress REST nonce and still require the authenticated user; they
are not public share links. HTML/SVG and unknown formats are attachments, while
the existing isolated preview route handles active previews.

Host validation must cover the actual web server, document-root aliases, filesystem permissions and cross-filesystem behavior. These storage rules do not secure an already compromised administrator or malicious third-party plugin.
