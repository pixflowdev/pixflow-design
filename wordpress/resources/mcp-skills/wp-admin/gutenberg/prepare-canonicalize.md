# Target-editor canonicalization

The typed preparation endpoint uses a short-lived ticket bound to the current user, site,
session, tab, source message, post, proposed tree hash, and content fingerprint.

Inside the actual target editor: wait for registration, create every typed
block, parse the initial serialization, mount the complete tree in an isolated
store, lock saving/autosaving, wait for lifecycle changes to settle, serialize,
parse again, and validate every resulting block.

Reject missing blocks, changed required block counts, invalid blocks, empty
content, timeout, target mismatch, or unstable mounting. Browser validation is
diagnostic evidence; the server recomputes hashes, byte length, parsed counts,
outline consistency, media evidence, and ticket bindings.

A failed preparation does not provide a usable commit receipt. Investigate
and repair the error; Direct native editing does not require this endpoint.
