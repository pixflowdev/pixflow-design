/** Run the adjacent helper with the daemon runtime and explicit output streams. */
export function windowsHelperLauncher(script: 'site-tool.mjs' | 'builder-tool.mjs', runtime = process.execPath): string {
  return [
    '$ErrorActionPreference = "Stop"',
    '$start = New-Object System.Diagnostics.ProcessStartInfo',
    `$start.FileName = '${runtime.replaceAll("'", "''")}'`,
    '$start.UseShellExecute = $false',
    '$start.CreateNoWindow = $true',
    '$start.RedirectStandardOutput = $true',
    '$start.RedirectStandardError = $true',
    '$start.StandardOutputEncoding = [System.Text.Encoding]::UTF8',
    '$start.StandardErrorEncoding = [System.Text.Encoding]::UTF8',
    `$start.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "${process.versions.electron ? '1' : ''}"`,
    // These helpers accept flags and quoted @file paths. Quote Windows argv
    // according to the CRT rules, including backslashes before quotes.
    'function Quote-HelperArgument([string]$value) {',
    `  return '"' + ($value -replace '(\\\\*)"', '$1$1\\\\"' -replace '(\\\\+)$', '$1$1') + '"'`,
    '}',
    `$helperArgs = @(Join-Path $PSScriptRoot '${script}') + @($args)`,
    '$start.Arguments = ($helperArgs | ForEach-Object { Quote-HelperArgument $_ }) -join " "',
    '$child = [System.Diagnostics.Process]::Start($start)',
    'try {',
    '  $stdout = $child.StandardOutput.ReadToEndAsync()',
    '  $stderr = $child.StandardError.ReadToEndAsync()',
    '  $child.WaitForExit()',
    '  if ($stdout.Result.Length) { Write-Output ($stdout.Result.TrimEnd("`r", "`n")) }',
    '  if ($stderr.Result.Length) { $Host.UI.WriteErrorLine($stderr.Result.TrimEnd("`r", "`n")) }',
    '  exit $child.ExitCode',
    '} finally { $child.Dispose() }',
    '',
  ].join('\r\n');
}
