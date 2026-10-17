// Help surface for `od design-systems`. Kept pure and separate from cli.ts so a
// test can assert the advertised subcommands without spawning the CLI or
// stubbing process.exit / console.log.

export const DESIGN_SYSTEMS_USAGE = `Usage:
  od design-systems bricks <command>          Manage a WordPress Bricks system (bricks --help).
  od design-systems list                       List design systems.
  od design-systems show <id>                  Print one entry.
  od design-systems rename <id> --title <new>  Rename an editable design system.
  od design-systems import-local <path>        Import a local project.
  od design-systems import-github <url>        Import a public GitHub repo.
  od design-systems import-shadcn <reference>  Import a shadcn registry item.
  od design-systems import-design-md --prompt-file <path|->
                                               Import an existing DESIGN.md.
  od design-systems inspect-website <url>      Inspect public brand evidence.
  od design-systems publish-pixflow --profile-file <path|-> --title <name> --route-id <id>
                                               Publish/update a Pixflow Framework system.
  od design-systems pixflow-profile <id>       Print the lossless Pixflow profile.
  od design-systems rebuild-token-contract <id>  Start a token contract rebuild review.`;

// `help`, `--help`, and `-h` all route to the usage text above. Without the
// flag forms, `od design-systems --help` falls through to the generic library
// list, which only advertises `list` and `show` and never mentions `rename`.
export function isDesignSystemsHelpArg(arg: string | undefined): boolean {
  return arg === 'help' || arg === '--help' || arg === '-h';
}
