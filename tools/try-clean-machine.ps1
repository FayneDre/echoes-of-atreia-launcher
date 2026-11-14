<#
.SYNOPSIS
    Opens a Windows Sandbox (a clean Windows, thrown away when closed) with a launcher release installed in it, to try the install of the
    server from nothing on a machine that has nothing: no Java, no MySQL, no Visual C++ runtime, no earlier launcher.

.DESCRIPTION
    Downloads the release's Setup (or takes -Installer), writes a .wsb and starts the sandbox. Inside, the Setup runs silently and the launcher
    opens; the person then installs the server from the home page into a folder of the sandbox's own disk (never a mapped folder: MySQL's data
    stays on a real disk). Two folders are mapped from this computer:
    - in (read only): the Setup and collect.cmd;
    - out (writable): where collect.cmd, run inside before closing, copies the launcher's settings and reports, and the logs of the servers
      and of MySQL. Everything else is lost with the sandbox.
    With -Client, the game client's folder is mapped read only too, to press Play inside.

    Needs the Windows feature "Windows Sandbox" (Containers-DisposableClientVM), turned on once by an administrator, then a restart:
        Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All

.EXAMPLE
    .\tools\try-clean-machine.ps1 -Version 0.3.0-beta.7
    .\tools\try-clean-machine.ps1 -Installer dist\Echoes-of-Atreia-Setup-0.3.0-beta.7.exe -Client 'D:\Jeux\Aion\client' -MemoryMB 6144
#>
param(
    [string]$Version,
    [string]$Installer,
    [string]$Client,
    [int]$MemoryMB = 8192,
    [string]$WorkDir = (Join-Path $env:TEMP 'echoes-clean-machine')
)
$ErrorActionPreference = 'Stop'

$sandbox = Join-Path $env:windir 'System32\WindowsSandbox.exe'
if (-not (Test-Path $sandbox)) {
    throw "Windows Sandbox is not turned on. As an administrator: Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All, then restart."
}
if (-not $Version -and -not $Installer) { throw 'Give -Version X.Y.Z[-beta.N] (a published release) or -Installer <Setup.exe>.' }
if ($Client -and -not (Test-Path (Join-Path $Client 'bin64'))) { throw "$Client holds no bin64 folder: it is not the game client's folder." }

$in = Join-Path $WorkDir 'in'
$out = Join-Path $WorkDir 'out'
New-Item -ItemType Directory -Force $in, $out | Out-Null
Get-ChildItem $in | Remove-Item -Recurse -Force

if ($Installer) {
    Copy-Item $Installer $in
} else {
    $tag = 'v' + $Version.TrimStart('v')
    & gh release download $tag -R FayneDre/echoes-of-atreia-launcher --pattern 'Echoes-of-Atreia-Setup-*.exe' --dir $in
    if ($LASTEXITCODE -ne 0) { throw "Could not download the Setup of $tag." }
}
$setup = (Get-ChildItem $in -Filter 'Echoes-of-Atreia-Setup-*.exe' | Select-Object -First 1).Name
if (-not $setup) { throw "No Echoes-of-Atreia-Setup-*.exe in $in." }

$box = 'C:\Users\WDAGUtilityAccount\Desktop'
# Inside: the Setup silently (per user, no question) into a folder named here (/D= comes last, unquoted), then the launcher.
@"
@echo off
"$box\in\$setup" /S /D=C:\Echoes of Atreia
start "" "C:\Echoes of Atreia\Echoes of Atreia.exe"
"@ | Set-Content -Encoding ascii (Join-Path $in 'install.cmd')

# Inside, before closing: what tells how the install went, copied to this computer.
@"
@echo off
set OUT=$box\out\%DATE:/=-%_%TIME::=-%
set OUT=%OUT: =0%
set OUT=%OUT:,=-%
mkdir "%OUT%"
xcopy /E /I /Q /Y "%APPDATA%\Echoes of Atreia" "%OUT%\launcher" >nul
powershell -NoProfile -Command "`$s = Get-Content -Raw \"`$env:APPDATA\Echoes of Atreia\settings.json\" | ConvertFrom-Json; if (`$s.serverRoot) { `$r = `$s.serverRoot; foreach (`$d in 'chat-server\log','login-server\log','game-server\log','mysql\data','reports') { `$p = Join-Path `$r `$d; if (Test-Path `$p) { `$t = Join-Path '%OUT%\server' `$d; New-Item -ItemType Directory -Force `$t | Out-Null; Get-ChildItem `$p -File | Where-Object { `$_.Extension -in '.log','.err','.zip','.txt' } | Copy-Item -Destination `$t } }; Get-ChildItem `$r | Select-Object Name,Length | Out-File '%OUT%\server\listing.txt' }"
echo Copied to %OUT%
pause
"@ | Set-Content -Encoding ascii (Join-Path $in 'collect.cmd')

$folders = @"
    <MappedFolder><HostFolder>$in</HostFolder><SandboxFolder>$box\in</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$out</HostFolder><SandboxFolder>$box\out</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
"@
if ($Client) {
    $folders += "    <MappedFolder><HostFolder>$((Resolve-Path $Client).Path)</HostFolder><SandboxFolder>$box\client</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>`n"
}
$wsb = Join-Path $WorkDir 'clean-machine.wsb'
@"
<Configuration>
  <VGpu>Enable</VGpu>
  <Networking>Enable</Networking>
  <MemoryInMB>$MemoryMB</MemoryInMB>
  <MappedFolders>
$folders  </MappedFolders>
  <LogonCommand><Command>$box\in\install.cmd</Command></LogonCommand>
</Configuration>
"@ | Set-Content -Encoding utf8 $wsb

Write-Host "Sandbox with $setup, $MemoryMB MB. Inside: install the server from the home page into a folder on C:, start, play;"
Write-Host "then run in\collect.cmd on the sandbox's desktop before closing it. What it copies lands in $out."
Start-Process $sandbox -ArgumentList "`"$wsb`""
