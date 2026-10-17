# Media blocks

Use the actual target schemas for image, gallery, cover, media-text, audio,
video, and file blocks. Select existing attachments through typed Media
Library reads and pass semantic media bindings rather than guessed URLs.

Preserve block-local presentation and link attributes during edits, including
caption, className, href, linkDestination, alignment, focal point, crop, and
size choices when present and valid.

An inline image and a featured image are separate changes. Include each only
when requested. Check MIME type, dimensions, available sizes, aspect ratio,
caption, and alt text before selection.

## Pixflow locally hosted fonts and icon packs

When Pro exposes these tools in `help`, use `fonts.list` / `fonts.install` with `builder: "wordpress"` in Gutenberg and ordinary WordPress, even when another builder is installed. Selected families become prefixed native typography presets; read the resulting presets before assigning a block fontFamily. Without Pro, use installed site fonts and WordPress typography presets. Installation never changes existing typography or saved Global Styles. Do not write theme files or replace a user's Font Library records.

Use `icons.wordpress` to read enabled installed packs and the exact `block` descriptor for each icon. Insert it using the connected editor's `gutenberg.insert`, or update an existing matching block using `gutenberg.update`. On supported WordPress this is the native Icon block with editable colour, size and accessible label; older WordPress uses a normal SVG Image block. Never invent registry names. Install/select packs through the shared icons tools first if necessary. Disabling/removing a pack removes picker choices; already placed icons retain their media.
