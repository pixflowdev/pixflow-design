$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$qaRoot = Join-Path $env:RUNNER_TEMP 'pixflow-230-qa'
$appRoot = Join-Path $env:RUNNER_TEMP 'px230'
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Pixflow Design Bridge-release-stable-win'
$nativeKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\dev.pixflow.bridge'
if ($env:GITHUB_ACTIONS -ne 'true' -or (Test-Path $appRoot) -or (Test-Path $registry) -or (Test-Path $nativeKey)) {
    throw 'This test requires a fresh Windows runner.'
}
New-Item -ItemType Directory -Path $qaRoot | Out-Null
$repo = 'https://api.github.com/repos/pixflowdev/pixflow-design'
$headers = @{ Authorization = 'Bearer ' + $env:GH_TOKEN; Accept = 'application/vnd.github+json' }
$draft = Invoke-RestMethod -Uri "$repo/releases/443158326" -Headers $headers
if (!$draft.draft -or $draft.target_commitish -ne 'd8b1a49339a998930ba5292cb57cb40c4ef1caa4') { throw 'Unexpected draft release' }
$asset = $draft.assets | Where-Object name -eq 'pixflow-design-bridge-2.3.0-win-x64-setup.exe'
$expectedHash = '31d8db7c75337643cfb2fdbfba260fc4f6a88c083a4872a9482cf73d74462f0d'
if (!$asset -or $asset.digest -ne "sha256:$expectedHash") { throw 'Unexpected draft installer digest' }
$candidate = Join-Path $qaRoot 'candidate.exe'
$previous = Join-Path $qaRoot 'stable.exe'
Invoke-WebRequest -Uri "$repo/releases/assets/$($asset.id)" -Headers @{ Authorization = $headers.Authorization; Accept = 'application/octet-stream' } -OutFile $candidate
if ((Get-FileHash $candidate).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Downloaded candidate hash mismatch' }
$stable = Invoke-RestMethod -Uri "$repo/releases/tags/bridge-v2.2.1" -Headers $headers
$oldAsset = $stable.assets | Where-Object name -eq 'pixflow-design-bridge-2.2.1-win-x64-setup.exe'
if ($stable.draft -or !$oldAsset.digest) { throw 'Published stable installer is missing' }
Invoke-WebRequest -Uri $oldAsset.browser_download_url -OutFile $previous
if ($oldAsset.digest -ne ('sha256:' + (Get-FileHash $previous).Hash.ToLowerInvariant())) { throw 'Downloaded stable hash mismatch' }
Remove-Item Env:GH_TOKEN
$env:OD_UPDATE_ENABLED = '0'

function Install-Bridge([string]$installer, [string]$version) {
    $setup = Start-Process -FilePath $installer -ArgumentList "/S /D=$appRoot" -WindowStyle Hidden -PassThru -Wait
    if ($setup.ExitCode -ne 0) { throw "Installer $version returned $($setup.ExitCode)" }
    $record = Get-ItemProperty -LiteralPath $registry
    if ($record.DisplayVersion -ne $version -or $record.InstallLocation -ne $appRoot) { throw "Registry mismatch for $version" }
    $app = Join-Path $appRoot 'Pixflow Design Bridge.exe'
    if ((Get-Item -LiteralPath $app).VersionInfo.FileVersion -ne $version) { throw "Installed executable version mismatch for $version" }
    $manifest = (Get-Item -LiteralPath $nativeKey).GetValue('')
    if (!(Test-Path -LiteralPath $manifest)) { throw 'Native host manifest missing' }
    $native = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    if ($native.name -ne 'dev.pixflow.bridge' -or !(Test-Path -LiteralPath $native.path)) { throw 'Native host registration is invalid' }
    Write-Host "Installed $version and verified registry and Chrome native host"
}

function Test-BridgeHealth([string]$version) {
    $app = Join-Path $appRoot 'Pixflow Design Bridge.exe'
    $process = Start-Process -FilePath $app -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(100)
        while ([DateTime]::UtcNow -lt $deadline -and !$process.HasExited) {
            try {
                $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7456/api/health' -TimeoutSec 3
                $listener = Get-NetTCPConnection -LocalPort 7456 -State Listen -ErrorAction SilentlyContinue |
                    Where-Object OwningProcess -eq $process.Id
                if ($listener -and $health.ok -and $health.product -eq 'pixflow-design-bridge' -and $health.version -eq $version) {
                    Write-Host "Installed $version reported healthy on its own listener"
                    return
                }
            } catch { }
            Start-Sleep -Milliseconds 500
        }
        throw "Installed Bridge $version failed its health check"
    } finally {
        if (!$process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
        $process.Dispose()
    }
}

Install-Bridge $candidate '2.3.0'
Test-BridgeHealth '2.3.0'
$uninstall = Start-Process -FilePath (Join-Path $appRoot 'Uninstall Pixflow Design Bridge.exe') -ArgumentList '/currentuser /S' -WindowStyle Hidden -PassThru -Wait
if ($uninstall.ExitCode -ne 0 -or (Test-Path $registry)) { throw 'Fresh install cleanup failed' }
Install-Bridge $previous '2.2.1'
Test-BridgeHealth '2.2.1'
$dataRoot = Join-Path $env:APPDATA 'Pixflow Design Bridge/namespaces/release-stable-win/data'
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$marker = Join-Path $dataRoot 'qa-upgrade-marker.txt'
Set-Content -LiteralPath $marker -Value 'Pixflow v2.2.1 upgrade fixture' -Encoding utf8
$markerHash = (Get-FileHash $marker).Hash
Install-Bridge $candidate '2.3.0'
Test-BridgeHealth '2.3.0'
if ((Get-FileHash $marker).Hash -ne $markerHash) { throw 'Upgrade changed the existing data marker' }
@{ installerSha256 = $expectedHash; previousInstallerSha256 = $oldAsset.digest; freshInstall = 'passed'; upgradeFrom = '2.2.1'; upgrade = 'passed'; installedHealth = 'passed'; chromeNativeHost = 'passed'; namespaceDataPreserved = 'passed' } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qaRoot 'receipt.json') -Encoding utf8
