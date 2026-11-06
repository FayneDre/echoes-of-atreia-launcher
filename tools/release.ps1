<#
.SYNOPSIS
    Tags a launcher release, vX.Y.Z-beta.N (a pre-release, from develop) or vX.Y.Z (from main), builds its installers and writes its GitHub release
    notes. Pushes the tag only with -Push; publishing the release is left to the user.

.DESCRIPTION
    The same process as the server's tools/tag-patch.ps1 (the server repository's docs/architecture/plans/release-process-plan.md): semantic
    versions of the launcher's own, notes in French and English, a body built the same way. Refuses, each time saying why:
    - a version that is not X.Y.Z or X.Y.Z-beta.N, that is tagged already, or that is not above the highest version tagged;
    - a beta made from another branch than develop, a release from another branch than main;
    - a dirty tree, and a package.json whose version is not this one (electron-builder names the installers after it, the updater reads it);
    - docs/release-notes/current.md (French) or current.en.md (English) with no entry for the tag, or an entry that names no minimum server
      version ("Serveur minimum : vX.Y.Z..." in French, "Minimum server: vX.Y.Z..." in English), or two entries that name different ones;
    - a minimum server version other than MIN_SERVER_VERSION in src/shared/types.ts, the one the launcher names to a person whose server is too old;
    - a failed npm test, and a build that does not produce both installers and the update files (latest.yml for this version, the
      installer's blockmap, app-update.yml in the build), which are attached too: an installed launcher updates itself from them;

    Once tagged, writes into release/<tag>/ (ignored by git) the release body (the English entry, the French one folded in a <details> block, then
    the downloads and the disclaimer) and the two entries as notes.en.md and notes.fr.md, then prints the gh command that publishes them.

.PARAMETER Version
    The version to release, with or without its leading v: 0.3.0-beta.1, 0.3.0.

.PARAMETER Message
    What the release is, for the tag's annotation. Defaults to the first line of the English entry.

.PARAMETER Push
    Push the tag to origin once made.

.PARAMETER Check
    Run the checks that need no build (version, branch, tree, package.json, notes) and stop before testing, building and tagging.

.EXAMPLE
    .\tools\release.ps1 -Version 0.3.0-beta.1 -Check
    .\tools\release.ps1 -Version 0.3.0-beta.1
#>
param(
    [Parameter(Mandatory)][string]$Version,
    [string]$Message,
    [switch]$Push,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$versionPattern = '^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$'
$serverVersion = 'v\d+\.\d+\.\d+(?:-beta\.\d+)?'

# A key that sorts versions as semantic versioning does: a beta sorts before the release it leads to.
function Get-VersionKey([string]$text) {
    $m = [regex]::Match($text, $versionPattern)
    if (-not $m.Success) { return $null }
    $beta = if ($m.Groups[4].Success) { [int]$m.Groups[4].Value } else { [int]::MaxValue }
    return '{0:D6}.{1:D6}.{2:D6}.{3:D10}' -f [int]$m.Groups[1].Value, [int]$m.Groups[2].Value, [int]$m.Groups[3].Value, $beta
}

# The entry headed '## <tag>' of a notes file, heading included, up to the next entry or the separator before it.
function Get-Entry([string]$file, [string]$tag) {
    $path = Join-Path $repoRoot "docs\release-notes\$file"
    if (-not (Test-Path $path)) { return $null }
    $text = [IO.File]::ReadAllText($path).Replace("`r`n", "`n")
    $m = [regex]::Match($text, "(?ms)^## $([regex]::Escape($tag))( [^\n]*)?\n.*?(?=^## |\z)")
    if (-not $m.Success) { return $null }
    return ($m.Value -replace '(?s)\n-{3,}\s*$', '').TrimEnd()
}

Push-Location $repoRoot
try {
    $key = Get-VersionKey $Version
    if (-not $key) { throw "'$Version' is not a version: write X.Y.Z for a release or X.Y.Z-beta.N for a pre-release." }
    $plain = $Version.TrimStart('v')
    $tag = "v$plain"
    $preRelease = $tag -match '-beta\.'

    git rev-parse -q --verify "refs/tags/$tag" *> $null
    if ($LASTEXITCODE -eq 0) { throw "$tag is tagged already." }
    $highest = @(git tag --list 'v*' | Where-Object { Get-VersionKey $_ } | Sort-Object { Get-VersionKey $_ }) | Select-Object -Last 1
    if ($highest -and (Get-VersionKey $highest) -ge $key) { throw "$tag is not above $highest, the highest version tagged." }

    $branch = git rev-parse --abbrev-ref HEAD
    $wanted = if ($preRelease) { 'develop' } else { 'main' }
    if ($branch -ne $wanted) { throw "$tag is made from $wanted, and this is $branch." }

    if (git status --porcelain) { throw 'The working tree has uncommitted changes. Commit them, then release from a clean tree.' }

    $package = (Get-Content -Raw (Join-Path $repoRoot 'package.json')) | ConvertFrom-Json
    if ($package.version -ne $plain) {
        throw "package.json says $($package.version). Run 'npm version $plain --no-git-tag-version', commit it, and run this again."
    }

    $entries = @{}
    $minimums = @{}
    foreach ($language in @(@{ Name = 'fr'; File = 'current.md'; Label = 'Serveur minimum\s*:' }, @{ Name = 'en'; File = 'current.en.md'; Label = 'Minimum server:' })) {
        $entry = Get-Entry $language.File $tag
        if (-not $entry) {
            throw "docs/release-notes/$($language.File) has no entry for this release. Add a section headed '## $tag' in both files, commit them, and run this again."
        }
        $minimum = [regex]::Match($entry, "$($language.Label)\W*($serverVersion)")
        if (-not $minimum.Success) {
            throw "The entry '## $tag' of docs/release-notes/$($language.File) names no minimum server version: write '$($language.Label -replace '\\s\*', ' ') v0.1.0-beta.1' (the lowest server version it works with)."
        }
        $entries[$language.Name] = $entry
        $minimums[$language.Name] = $minimum.Groups[1].Value
    }
    if ($minimums.fr -ne $minimums.en) { throw "The French entry names server $($minimums.fr) and the English one $($minimums.en)." }
    # the version the launcher itself names to a person whose server is too old
    $types = [IO.File]::ReadAllText((Join-Path $repoRoot 'src\shared\types.ts'))
    $named = [regex]::Match($types, "export const MIN_SERVER_VERSION = '([^']+)'")
    if (-not $named.Success) { throw 'src/shared/types.ts has no MIN_SERVER_VERSION line to read.' }
    if ($named.Groups[1].Value -ne $minimums.en) {
        throw "The notes name server $($minimums.en), and the launcher tells a person with a server too old to install $($named.Groups[1].Value) (MIN_SERVER_VERSION in src/shared/types.ts). Make them the same."
    }

    if ($Check) {
        Write-Host "The checks that need no build passed: $tag (minimum server $($minimums.en)). Without -Check, npm test and the build come next." -ForegroundColor Green
        return
    }

    npm test
    if ($LASTEXITCODE -ne 0) { throw 'npm test failed.' }
    npm run dist
    if ($LASTEXITCODE -ne 0) { throw 'npm run dist failed.' }
    $installers = @("dist\Echoes-of-Atreia-Setup-$plain.exe", "dist\Echoes-of-Atreia-$plain-portable.exe")
    # What an installed launcher reads to update itself: latest.yml names the installer and its hash, the blockmap lets it download only what
    # changed, and app-update.yml inside the build says where to look. A beta launcher asks for beta.yml first and falls back on latest.yml.
    $updateFiles = @('dist\latest.yml', "dist\Echoes-of-Atreia-Setup-$plain.exe.blockmap")
    foreach ($file in $installers + $updateFiles + @('dist\win-unpacked\resources\app-update.yml')) {
        if (-not (Test-Path (Join-Path $repoRoot $file))) { throw "The build did not produce $file." }
    }
    $latest = [IO.File]::ReadAllText((Join-Path $repoRoot 'dist\latest.yml'))
    if ($latest -notmatch "(?m)^version: $([regex]::Escape($plain))\s*$") { throw "dist\latest.yml is not for $plain: the build left an older one." }

    $bodyEn = ($entries.en -replace '^## [^\n]*\n', '').Trim()
    $bodyFr = ($entries.fr -replace '^## [^\n]*\n', '').Trim()
    if (-not $Message) { $Message = ($bodyEn -split "`n")[0] }
    git tag -a $tag -m $Message
    if ($LASTEXITCODE -ne 0) { throw 'git tag failed' }

    $out = Join-Path $repoRoot "release\$tag"
    New-Item -ItemType Directory -Force $out | Out-Null
    $utf8 = New-Object Text.UTF8Encoding($false)
    $footer = @"
## Download
- ``Echoes-of-Atreia-Setup-$plain.exe``: installer, with shortcuts and an uninstaller.
- ``Echoes-of-Atreia-$plain-portable.exe``: runs without installing.

The files are not signed: Windows SmartScreen warns the first time. Click *More info*, then *Run anyway*.

*Unofficial fan project, not affiliated with or endorsed by NCSoft.*
"@ -replace "`r`n", "`n"
    [IO.File]::WriteAllText((Join-Path $out 'notes.en.md'), "$bodyEn`n", $utf8)
    [IO.File]::WriteAllText((Join-Path $out 'notes.fr.md'), "$bodyFr`n", $utf8)
    [IO.File]::WriteAllText((Join-Path $out 'body.md'), "$bodyEn`n`n<details>`n<summary>Fran$([char]0xE7)ais</summary>`n`n$bodyFr`n`n</details>`n`n$footer`n", $utf8)

    if ($Push) {
        git push origin $tag
        if ($LASTEXITCODE -ne 0) { throw "git push of $tag failed; the tag exists locally" }
        Write-Host "Tagged $tag and pushed it." -ForegroundColor Green
    } else {
        Write-Host "Tagged $tag, not pushed. To push it: git push origin $tag" -ForegroundColor Green
    }
    $flag = if ($preRelease) { ' --prerelease' } else { '' }
    $files = ($installers + $updateFiles + @("release\$tag\notes.en.md", "release\$tag\notes.fr.md") | ForEach-Object { "`"$(Join-Path $repoRoot $_)`"" }) -join ' '
    Write-Host 'Once the tag is pushed, to publish the release:'
    Write-Host "  gh release create $tag$flag --verify-tag --title $tag --notes-file `"$out\body.md`" $files"
    if (-not $preRelease) {
        Write-Host 'A stable release carries the English in full and a short French summary: shorten the French part of body.md first unless both are short.' -ForegroundColor Yellow
    }
} finally {
    Pop-Location
}
