<?php
// Retired entry point: fail explicitly so old automation cannot start cloud builds.
fwrite(STDERR, "Codemagic builds are retired. Build on the MacBook Pro using MAC-BUILD-HANDOFF.md, then import both DMGs with php build-bridge-mac.php --arm64 <path> --x64 <path>.\n");
exit(1);
