# Gutenberg persistence

Native editor changes can retain undo history and unsaved user work. Server
writes need reconciliation with an open editor so a later Save does not restore
stale content. Read back the changed document and metadata and inspect relevant
editor/front-end behavior.

The typed preparation/commit adapter uses a receipt, current fingerprint,
context bindings and permissions. Those are its transport inputs, not extra
model approval stages. Its supported content and metadata changes form one
logical transaction with rollback on verification failure.

Direct native API work may span multiple operations. Preserve the previous
state when useful for recovery, resolve failures within the run and report
partial results honestly if something remains unresolved. Do not promise
atomicity that the chosen APIs do not provide.
