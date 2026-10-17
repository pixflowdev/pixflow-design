# Gutenberg support levels

Report support per block and installed version:

- `certified`: versioned Pixflow browser, parser, persistence, and relevant
  front-end fixtures pass for the block.
- `runtime validated`: the block is registered, mounted, serialized, parsed,
  and valid in the target editor, without a claim about plugin-specific side
  effects.
- `adapter certified`: version-gated plugin-specific ID, linked-resource,
  stylesheet/cache, save-hook, and front-end fixtures pass.
- `unsupported`: unavailable, invalid, incompatible, unsafe, or dependent on a
  capability that is not present.

Server registration alone is discovery evidence. A plugin name and minimum
version alone are not adapter certification. State uncertainty plainly.
