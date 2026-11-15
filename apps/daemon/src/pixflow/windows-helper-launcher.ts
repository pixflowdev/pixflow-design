/** Native command launcher: independent of PowerShell script policy and PATH.
 * Delayed expansion is disabled to preserve exclamation marks in paths/arguments.
 * Long or structured arguments belong in quoted @files, not shell JSON literals.
 */
export function windowsHelperLauncher(script: 'site-tool.mjs' | 'builder-tool.mjs', runtime = process.execPath): string {
  const executable = runtime.replaceAll('%', '%%');
  return [
    '@echo off',
    'setlocal DisableDelayedExpansion',
    `set "ELECTRON_RUN_AS_NODE=${process.versions.electron ? '1' : ''}"`,
    `"${executable}" "%~dp0${script}" %*`,
    'exit /b %errorlevel%',
    '',
  ].join('\r\n');
}
