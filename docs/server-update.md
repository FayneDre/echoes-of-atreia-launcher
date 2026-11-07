# The server's update

How a beta launcher installs the server's pre-releases, and a stable one its releases (the server repository's
`docs/architecture/plans/release-process-plan.md`, milestone 6). The code is `src/main/serverUpdate/`; the bundle is made by the server's
`tools/package-release.ps1`.

## What a release carries

- `aion-server-<tag>.zip`: the three servers as Maven's assembly makes them (config, data with the geo, start scripts, every library with the
  project's own jars), plus `tools/apply-sql.ps1` and `game-server/sql/update.sql`.
- `manifest.json`: version, revision, launcher API level, the JDK it needs, the SHA-256 of every file of the zip, the bundle's own hash, the
  rules (`prune`: folders holding only what the bundle lists; `local`: files that are the person's to edit) and the navmesh: for each map file,
  its hash and the release whose assets carry it, so a map is attached only to the release that rebuilt it.
- `navmesh-<file>.gz` for the maps rebuilt since the previous bundle, and `notes.en.md`, `notes.fr.md`.

## Where the install stands

`manifest.json` at the install's root says it (`readInstallOrigin`):

- `"source": "deploy"`: written by the server's deploy script, a development install. **No release is ever offered over it**: a bundle is
  often older than `develop`. A manifest the launcher cannot read is treated the same way, never as no manifest.
- `"source": "release"`: installed from a bundle; the manifest is that bundle's, which tells which default files are still untouched.
- none: a server built from git. The first update installs over it.

The releases are listed from GitHub's API at start and when the server folder changes (never on a timer, nor in the developer mode); a beta launcher looks at the
pre-releases too. A release without a `manifest.json` (the server's v0.1.0-beta.1, notes only) is skipped.

## The update, in two halves

**Prepared with the servers running** (`prepare`): the zip downloaded and checked against the manifest's hash and GitHub's digest, then
unpacked (only the entries the manifest names, none outside the folder) and every file checked; the plan worked out by hashing the install;
the maps it needs downloaded, gunzipped and checked; the JDK looked for (`java.home` must hold `javac`: the game server compiles its handlers at
every start); and the database asked, through the bundle's own `apply-sql.ps1`, whether it has ever been through that script (`Ledger:`).

**Then the person sees what will happen**: default files they edited, which stay as they are with the release's own put beside each as
`<file>.new-<version>` (a file that differs only by its line endings is the same file); a database that never went through the script, whose
statements will be recorded as applied rather than run (`-MarkApplied`). Installing is refused without the JDK.

**Installed with the servers stopped** (`install`, under the activity `server-update`, during which the window will not close): the game server
stopped the usual way, never killed; `update-backups/<from>-to-<tag>/restore.json` written first, listing every path replaced, removed or
created, then each replaced or removed file moved into that backup; the new files moved in; the bundle's manifest written as the install's;
`apply-sql.ps1 -Apply` run from its new place (its `mysqldump` is the database's backup); the servers that ran started again.

`mygs.properties`, the logs, the navmesh's own files (`.walked`, the images) and anything else the bundle does not name are never touched: only
the `prune` folders lose what the bundle no longer lists.

## Going back

"Undo the vX update" undoes the last update from its backup: what it created removed, what it replaced or removed put back, the backup then
deleted. The database keeps what the SQL changed; the dump `apply-sql.ps1` took is in the server's `backups` folder.

## Tests

`tests/e2e/serverUpdate.spec.ts` serves releases from a local HTTP server (`ECHOES_SERVER_FEED`, `tests/e2e/serverFeed.ts`), with a fake
`apply-sql.ps1` that records how it was called and a fake JDK (`ECHOES_FAKE_JAVA_HOME`). Every other end-to-end test points the feed at a port
nothing listens on, so no test reaches GitHub.
