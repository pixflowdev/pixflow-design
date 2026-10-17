# Third-party Gutenberg blocks

Discover the installed block’s server metadata and live editor registration.
Use the installed plugin version and actual `block.json`/registration evidence;
do not transplant a schema from another version.

Runtime-validate unknown self-contained blocks cautiously. Add a Pixflow
adapter only for genuine lifecycle behaviour such as generated unique IDs,
version markers, linked records, generated CSS, caches, or save hooks.

GenerateBlocks, Kadence Blocks, and Spectra names are not sufficient proof of
adapter certification. Certification requires versioned mounted-editor and
front-end/cache fixtures. Until those pass, report runtime validated or
unsupported as appropriate.

Inspect the actual compatibility problem. A companion plugin or source fix
may be appropriate; vendor updates can replace direct vendor-file changes.
