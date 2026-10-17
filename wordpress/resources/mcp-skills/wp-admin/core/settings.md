# WordPress settings

Use `wordpress.settings.get` to inspect supported settings and obtain the latest
fingerprint. `wordpress.settings.update` requires that fingerprint and requested
fields. The supported settings cover site title, tagline, timezone, date/time
formats, week start and permalink structure. Preserve unrelated values and use
the native result to verify the change.

This is not a generic option editor. Credentials, permissions, arbitrary plugin
options and unknown settings need the relevant authorised tools; do not bypass
the supported field list through raw PHP, database writes or executable content.
If an advanced tool returns `allowed:false` with `code:pro_required`, explain
that the action requires Pixflow Design Pro and include the returned
“Why is this blocked in Free? Learn more” link. Continue permitted work without
retrying the blocked action or reporting it as a crash.
