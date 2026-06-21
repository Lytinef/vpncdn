# Build the Unway Windows installer.
# Steps:
#   1) cd client; flutter build windows --release
#   2) powershell -ExecutionPolicy Bypass -File installer\build.ps1   (or double-click build.bat)
# Output: installer\output\Unway-Setup-<version>.exe

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1) Locate ISCC (Inno Setup compiler).
$iscc = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
  $found = Get-ChildItem "$env:LOCALAPPDATA\Programs", "C:\Program Files (x86)", "C:\Program Files" `
    -Recurse -Filter ISCC.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $iscc = $found.FullName }
}
if (-not (Test-Path $iscc)) {
  throw "ISCC.exe (Inno Setup) not found. Install: winget install --id JRSoftware.InnoSetup -e"
}

# 2) Ensure the app is built.
$buildDir = Join-Path $root "..\client\build\windows\x64\runner\Release"
if (-not (Test-Path (Join-Path $buildDir "vpncdn_client.exe"))) {
  throw "Build not found. Run first: cd client; flutter build windows --release"
}

# 3) Version from pubspec (1.0.0+2 -> 1.0.0).
$pubspec = Join-Path $root "..\client\pubspec.yaml"
$m = Select-String -Path $pubspec -Pattern '^version:\s*(\S+)'
$version = "1.0.0"
if ($m) { $version = ($m.Matches[0].Groups[1].Value -split '\+')[0] }

Write-Host "ISCC:    $iscc"
Write-Host "Version: $version"
Write-Host "Building installer..."

& $iscc "/DAppVersion=$version" (Join-Path $root "unway.iss")
if ($LASTEXITCODE -ne 0) { throw "ISCC exited with code $LASTEXITCODE" }

Write-Host ""
Write-Host ("Done: " + $root + "\output\Unway-Setup-" + $version + ".exe")
