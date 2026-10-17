# Exact Gutenberg document evidence

Start with target status and `read-document`. A complete inline read has the
`pixflow.wp-admin.gutenberg-read.v2` schema, matching post ID and authority,
`contentComplete: true`, `contentTruncated: false`, and
`blockTreeComplete: true`.

For a chunked document, read every required bound chunk and verify the
reassembled content hash before editing. An outline, excerpt, generic post
response, partial chunk set, remembered article, or previous-post transcript
is not content authority.

The typed read response binds the site, session, post and content fingerprint.
For any editing route, use the current target and refresh stale document data.

If the open editor has unsaved changes, work from its current tree and preserve
those changes. Reconcile server edits with live state before saving.
