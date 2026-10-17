# Maintainer approval

Every path is owned by `@pixflowdev` in CODEOWNERS, including CODEOWNERS itself
and workflows. Contributions require a Pixflow review before merging.

## Enforcement prerequisites

GitHub currently does not enforce branch protection on this private repository's
plan. CODEOWNERS review is also disabled by that plan. A saved rule alone is not
enforcement. Keep the repository private until its separate publication review
is complete; do not make it public merely to enable branch protection.

When the repository can safely become public (or the account obtains a plan
supporting private protection), verify the `main` protection rule has:

- Pull requests required, with at least one approval.
- Code-owner review required, with `@pixflowdev` as a valid owner.
- Stale approvals dismissed after new commits.
- Approval of the latest reviewable push by someone other than its pusher.
- All review conversations resolved.
- Required status check `Free validation`, from GitHub Actions.
- Branch up to date before merging.
- Administrator bypass disabled; force pushes and branch deletion disallowed.

The check workflow intentionally skips private repositories to avoid hosted
runner charges. A skipped job does not prove validation. Before enabling the
required check, run it successfully on the public repository and select that
exact check in GitHub's rule editor. If retaining a private repository after a
plan upgrade, first agree a runner/budget arrangement and remove the private-job
condition; do not treat the skipped check as passing the release gate.

Use pull_request, never pull_request_target, for untrusted contribution builds.
The workflow needs no repository secrets, Pro checkout, deployment credentials
or write token. Maintainers must still assess change-specific regression tests.

GitHub does not allow authors to approve their own pull requests. Changes authored
by the sole owner need another trusted Pixflow code owner before they can satisfy
strict protection; do not silently add a bypass to work around this.
