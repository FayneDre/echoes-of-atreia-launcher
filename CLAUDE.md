# Echoes of Atreia — launcher

A public launcher for a self-hosted Aion 4.8 server with bots: it installs or finds the server and the client, starts and stops them, sets
the server up and acts on the player's character. The server itself lives in its own repository (`aion-server-playerbots`, locally
`D:\Jeux\Aion\source\aion-server-4.8`); work on the server happens there, never here.

[docs/roadmap.md](docs/roadmap.md) says what is done and what is left, by theme in priority order. Start there.
[docs/decisions.md](docs/decisions.md) says why the launcher works the way it does, and what kind of work each feature needs.
[docs/how-it-works.md](docs/how-it-works.md) says how the servers are started and stopped, and why; read it before touching `src/main/server/`.
[docs/desktop.md](docs/desktop.md) says what the launcher does outside its window (taskbar, tray, Windows options, problem report).
[docs/client.md](docs/client.md) says what is checked in the client folder and how the game language is chosen (`-lang:<code>`).
[docs/server-update.md](docs/server-update.md) says how a beta launcher installs the server's pre-releases; read it before touching `src/main/serverUpdate/`.
The one rule above all: **never kill the game server while it can stop by itself** (it saves the players on shutdown).

## Stack

Electron + TypeScript + React, built with electron-vite; Playwright drives the built application in `tests/e2e/`.

- `src/main/` holds everything that touches the system. `src/renderer/` never does: it asks through `src/preload/` (`window.launcher`),
  and the window keeps `contextIsolation`, `sandbox` and no `nodeIntegration`.
- Every text shown goes through `t()`; `src/renderer/src/i18n/en.ts` is the reference and French must define the same keys (the types
  enforce it).
- Each test runs on a throwaway profile (`ECHOES_USER_DATA_DIR`), never the player's.

Before calling something done: `npm test` (typecheck, Vitest, Playwright), and a new feature comes with its test. The end-to-end tests
run against fake servers (`tests/fixtures/`), never the real installation; a test that would start the real MySQL service is not written.

## Conventions

- Commits in English, short, no co-author or AI attribution line.
- Never name a colleague or the user in code, comments, docs or commits: "the co-designer", "the tester".
- Docs stay under ~200 lines each; split by topic.
- The launcher never edits the server's default configuration: it writes `game-server/config/mygs.properties`.
- Keep the NCSoft disclaimer visible in the README and in the launcher.

## Branches and releases

- `main`: the one branch, the default on GitHub (`develop` until 14 November 2026: one developer gained nothing from two). Every version is
  a tag on it: test builds `vX.Y.Z-beta.N` are GitHub **pre-releases**, so `Latest` keeps pointing at the stable one; a stable `vX.Y.Z` goes
  on a commit a beta was validated on. To fix a stable once `main` has moved on, a branch is cut from its tag that day.
- Versions are this launcher's own, independent of the server's; a release declares the lowest server version it needs. The release process
  is the server repository's `docs/architecture/plans/release-process-plan.md`.
- `tools/release.ps1 -Version X.Y.Z[-beta.N]` makes a release: it refuses a wrong branch, a dirty tree, a `package.json` of another version,
  a missing entry in `docs/release-notes/current.md` (French) or `current.en.md` (English), an entry with no minimum server version, a failed
  `npm test` or build, or a build without its update files; then it tags and writes the GitHub body and notes under `release/<tag>/`, and
  prints the `gh` command, which attaches `latest.yml` and the installer's `.blockmap`: installed launchers update themselves from them. Both entries are written in the same pass.
- Every push and every publish is the user's call.
