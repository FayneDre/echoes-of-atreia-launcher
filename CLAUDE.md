# Echoes of Atreia — launcher

A public launcher for a self-hosted Aion 4.8 server with bots: it installs or finds the server and the client, starts and stops them, sets
the server up and acts on the player's character. The server itself lives in its own repository (`aion-server-playerbots`, locally
`D:\Jeux\Aion\source\aion-server-4.8`); work on the server happens there, never here.

[docs/roadmap.md](docs/roadmap.md) says what is left, by phase, and why each decision was made. Start there.

## Stack

Electron + TypeScript + React, built with electron-vite; Playwright drives the built application in `tests/e2e/`.

- `src/main/` holds everything that touches the system. `src/renderer/` never does: it asks through `src/preload/` (`window.launcher`),
  and the window keeps `contextIsolation`, `sandbox` and no `nodeIntegration`.
- Every text shown goes through `t()`; `src/renderer/src/i18n/en.ts` is the reference and French must define the same keys (the types
  enforce it).
- Each test runs on a throwaway profile (`ECHOES_USER_DATA_DIR`), never the player's.

Before calling something done: `npm run typecheck` and `npm run test:e2e`, and a new feature comes with its test.

## Conventions

- Commits in English, short, no co-author or AI attribution line.
- Never name a colleague or the user in code, comments, docs or commits: "the co-designer", "the tester".
- Docs stay under ~200 lines each; split by topic.
- The launcher never edits the server's default configuration: it writes `game-server/config/mygs.properties`.
- Keep the NCSoft disclaimer visible in the README and in the launcher.
