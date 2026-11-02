# Mac production return for Bridge 2.2.0

The two production DMGs are on the [Bridge draft](https://github.com/pixflowdev/pixflow-design/releases/tag/untagged-1b0b14a61ebf62b72f69), release ID 431501883. Both downloaded copies matched the local files by size and SHA-256. The Windows coordinator can proceed with release review.

| Architecture | Draft asset ID | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| arm64 | 702136010 | 210535988 | `d63f60e7f85e04fd08fe62e518ab368781cd66a76593ebe4408eda8a21e3dbd9` |
| x64 | 702137799 | 221711933 | `e1b433b1471dec95ffe2ebd79015a8e3d2b2c532b76de9d559345b031fa2bc23` |

The Bridge uses Core `50744ab415c465f728b4e236fe65ffb6d81460f2` and Pro `387c46e406d4b4f8e6a69521fc5650b98c3990c8` at module API 14. The installed plugins use Core `a8a920e780bb47ef0dcfd03e9ceff8e0ec44267b` and Pro `dc6bbd9ccd9721008a3c15b9ad311c21c885ab88`. Hosted integration checks passed for both plugin commits. [Core integration #80](https://github.com/pixflowdev/pixflow-design/pull/80) and [Pro integration #39](https://github.com/pixflowdev/pixflow-design-pro/pull/39).

The corrected ZIPs matched the handoff hashes. All 278 Free files and 956 Pro files matched the installed bytes on both the licensed QA site and the disposable unlicensed fixture. In Chrome the saved research reply showed its inline citation, preview and Sources (1) in floating chat, Workspace and Bricks. The link resolved in each UI to the official WordPress Media Library documentation. The temporary Bricks configuration was restored. On the unlicensed site a simulated 503 produced the Retry control. After service recovery Retry restored License, showing Inactive. The QA Pro banner cleared on refresh and the site reported an active add-on. [Citation fix #81](https://github.com/pixflowdev/pixflow-design/pull/81), [License Retry #83](https://github.com/pixflowdev/pixflow-design/pull/83), [Pro pairing #40](https://github.com/pixflowdev/pixflow-design-pro/pull/40), and [first Mac acceptance report #82](https://github.com/pixflowdev/pixflow-design/pull/82).

Each DMG passed image verification. The mounted apps reported production version 2.2.0, the correct product identity, portable configuration, the exact Store host payload and architecture-compatible native code including SQLite. Both installed copies returned runtime health 2.2.0. Apple Silicon ran natively and Intel ran under Rosetta on the same Mac. Both apps have valid ad-hoc signatures. They are not notarized and Gatekeeper did not accept them. The earlier live provider tests used OpenAI only, as requested.

See the [redacted build receipt](build-receipt.json) and [asset IDs and download verification](github-draft-verification.json).
