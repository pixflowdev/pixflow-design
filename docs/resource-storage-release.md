# Resource storage release checklist

This candidate adds an encrypted fallback when WordPress cannot create its private
resource directory. Existing private filesystem storage remains preferred. It does
not change chats, settings, licences, installed plugin identity or Bridge protocols.

## Coordinated release

- Review Free and the matching Pro encrypted skill-storage adapter together.
- Install compatible Pro before Free on existing Pro sites. Free refuses to start
  fallback migration when an active older Pro lacks the adapter. Free-only sites
  need no Pro installation.
- Assign new package versions after review. Rebuild both packages and regenerate
  Pro's integrity receipt. Do not replace previously published package bytes.
- Verify ordinary WordPress upgrades and the paired package install order before
  changing download/update pointers. No Bridge rebuild is required by these PHP-only
  changes.

## Data and recovery

Back up the WordPress database and resource files together. The independent
encryption key and object index are database-owned. Restoring only the encrypted
files without the matching database cannot recover their contents. Missing keys
fail closed and never silently generate a replacement over existing encrypted data.

Migration copies and verifies before activation. Bounded recovery authenticates
each encrypted object and compares the original hash before retiring its plaintext
copy. Changed, linked, corrupt or unreadable originals remain untouched. Concurrent
recovery is locked. A failed batch resumes on a subsequent WordPress request.

Site Health → Info → Pixflow resource storage reports the backend, verified file
count, preserved bytes and remaining legacy folders. Completion requires zero
legacy folders and no preparation attention. Dismissing the notice for 28 days
does not disable recovery.

After migration, do not downgrade to a plugin without encrypted readers. Recovery
requires compatible readers or a coordinated database-and-files backup restore.
Same-path recovery is tested; relocation to a different absolute storage root is
not covered. Individual resources above 16 MiB are retained and block migration
instead of being discarded. These limits must remain visible in release review.

## Acceptance evidence

Local tests cover encrypted read/write integrity, immutable versions, interrupted
index commits, missing-key restoration, read-only directory iteration, path and
PHP-include rejection, bounded migration, concurrent recovery, changed/corrupt
original preservation, native storage compatibility and notice expiry. Pro's paired
tests cover signed installs, updates, removals, entitlement checks and pinned versions.

An authorized restricted-hosting acceptance run completed with all original files
preserved, zero remaining legacy folders, working Pro skill discovery after reload,
and an unchanged existing chat and published-content counts. Customer screenshots
and operational receipts stay outside the public repository. This is behavioral
preservation evidence, not a complete production-database comparison.

Published archives, updater pointers and the directory submission remain unchanged.
