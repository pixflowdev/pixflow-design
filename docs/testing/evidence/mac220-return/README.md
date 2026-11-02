# Mac 2.2.0 acceptance return

The Mac found a WordPress chat rendering defect on the release candidate. Review [Core #81](https://github.com/pixflowdev/pixflow-design/pull/81) and [Pro #40](https://github.com/pixflowdev/pixflow-design-pro/pull/40) alongside [Core #80](https://github.com/pixflowdev/pixflow-design/pull/80) and [Pro #39](https://github.com/pixflowdev/pixflow-design-pro/pull/39). The Windows coordinator should integrate the fix, rebuild the paired plugin ZIPs, and issue accepted build revisions before producing final installers. No 2.2.0 Mac production DMGs or draft uploads were made.

## Tested sources

The authenticated Free and Pro draft ZIPs at 42bff0c448cb853d60c89279ea23ab01da42476c and 63252bef23cce361b2aeb81b28fb266834f4ef65 matched the handoff hashes before installation. The isolated Apple Silicon Bridge app used 50744ab415c465f728b4e236fe65ffb6d81460f2 and 387c46e406d4b4f8e6a69521fc5650b98c3990c8. All six Core and three Pro hosted checks passed on those plugin revisions.

The corrective Core commit is 5a7b8ea5d9f2c37f1179c72415754c5a23064fef. Pro #40 pins that commit for its WordPress build. Both rebuilt web bundles were installed on local QA for the browser verification. These local bundles are distinct from the existing GitHub draft ZIPs.

## Chat results

A real Codex Terra search returned an official WordPress reference in the middle of a sentence. The original bundle rendered a search trace but no citation preview or Sources list. On the corrected bundles the same saved reply displayed the domain button and Sources (1) in floating admin chat, Workspace, and Bricks. Opening the preview and source list led to the official Media Library documentation. The original research used the QA site's Chrome extension route.

All 76 focused web tests and two daemon tests passed, including the suites from the streaming PR for text reveal, trace disclosure, thinking and tool messages, scroll behavior, citations and reattachment. The citation regression failed before the fix. The scroll timing and Claude stream deduplication checks are automated. Live AI tests used OpenAI only at the owner's request.

## Other Mac acceptance

- With Bridge offline, GPT-6 Luna and GPT-6.1 Terra each completed French and Spanish API translation jobs with automatic publication. Anonymous requests returned HTTP 200 for both languages and the language picker contained both destinations. A manual correction to the French paragraph appeared in the public page.
- Codex CLI with GPT-6.1 Terra completed a direct translation on the paired Bridge. Chrome displayed the extension transport. The Workspace update published a new French segment with direct browser access to port 7456 blocked for the test. The block was removed afterwards.
- Default and QA-origin health remained healthy during forced discovery. Floating chat showed disconnected after stopping the isolated app and connected again after restart. This receipt covers the live health endpoints and floating status, with automated discovery coverage.
- The WordPress shortcut opened Translations. After a source edit the shortcut and Workspace rail both indicated a pending update. Updating the only pending fixture cleared both indicators. Free alone had no management REST route. An unauthenticated management request was denied. The packaged Windows fixture covered hiding the shortcut on permission removal.
- A fresh WordPress fixture persisted no-AI onboarding and returned 200 on licence status retry after a simulated 503. Automated component tests exercised the corresponding controls. The diagnostic archive was verified with WordPress debugging off, four entry hashes and exclusion of prompts, credentials and post content. These were service/component checks rather than a fresh manual walkthrough of every control.
- Test pages were trashed and temporary language configuration was restored. The corrected local QA web bundles remain installed for review. The Claude CLI live test was skipped under the owner's OpenAI-only constraint.

After new packages arrive, verify the accepted pins, repeat the affected live chat checks on those exact ZIPs, then build, mount, run and independently verify both production DMGs per the original handoff. The existing Bridge draft is release ID 431501883. Final signing results, asset IDs and checksums are pending those builds.
