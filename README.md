# Echoes of Atreia

All-in-one launcher for a self-hosted Aion 4.8 server populated by AI-driven bots: install, play and back up your characters.

> Unofficial fan project, not affiliated with or endorsed by NCSoft. Aion is a trademark of NCSoft Corporation.

The server it drives is [aion-server-playerbots](https://github.com/FayneDre/aion-server-playerbots), a fork of
[beyond-aion/aion-server](https://github.com/beyond-aion/aion-server) with bots that are real player characters.

## Status

Early development: the window, the FR/EN switch and the test setup. See [docs/roadmap.md](docs/roadmap.md) for what comes next.

## Development

Requires Node.js 24 or later.

```sh
npm install
npm run dev        # the launcher with hot reload
npm run typecheck  # TypeScript, no build
npm run test:e2e   # builds, then drives the real window with Playwright
```

Layout:

- `src/main/` — the Electron main process: windows, and later processes, files and the database.
- `src/preload/` — the only bridge between the interface and the system (`window.launcher`).
- `src/renderer/` — the interface, in React; texts live in `src/renderer/src/i18n/` (English is the reference).
- `tests/e2e/` — Playwright tests against the built application, each on a throwaway profile.
