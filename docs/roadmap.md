# Roadmap

Status: in progress: phases 0 and 1 done (start, client launch and stop checked by the tester on the real servers, 4 November); phase 2
next.

How phase 1 works, and why: [how-it-works.md](how-it-works.md).

The launcher is distributed publicly: a player installs it, it installs or finds the server and the client, and the game is one click away.

## What each feature needs

Features fall in three kinds, and the kind decides the order:

- **Launcher only** — processes and files: start and stop MySQL and the three servers, launch the client, show their terminals, detect
  an install, patch notes, FR/EN.
- **A server setting that already exists** — written to `game-server/config/mygs.properties`, the local overrides file, never to the
  defaults (so a server update never conflicts with the player's choices). XP rates (`gameserver.rates.xp.*`), AP (`gameserver.rates.ap.*`),
  honour points, which are the Glory Points that open the upper Abyss ranks: their gain (`gameserver.rates.gp.gain`) and, more useful than
  a boost, their daily loss (`gameserver.topranking.gp_loss.<RANK>` in `ranking.properties`, 9 to 219 a day by rank, 0 turns it off; shown
  as one percentage applied to every rank; check that `mygs.properties` overrides these per-rank keys), both factions on one account
  (`gameserver.character.creation.mode = 1`).
  A change takes effect at the next server start, and the launcher says so.
- **Server work first** — the setting does not exist yet and is added to the server before the launcher shows it: skill learning (only
  stigmas have an auto-learn setting), every bot setting (`playerbot.properties` only has `enable` and `populate`), the broker house, and any
  action on a character that is in game.

## Phases

| Phase | Content | Server work |
|---|---|---|
| 0. Base | Electron + TypeScript + React, FR/EN, Playwright, README | — |
| 1. Play | Detect server, client and MySQL; ordered start (MySQL, chat, login, game, each waiting for the one before); clean stop; the three terminals; launch the client | — |
| 2. Settings | XP, AP, honour gain and daily loss, both factions, in `mygs.properties`, with "restart required" | — |
| 3. Account | Sign in with account name and password, list its characters, pick the one played; several accounts; database backup and restore | — |
| 4. Admin channel | A local-only, key-protected interface in the game server; teleport the picked character to any zone | yes |
| 5. Bots and broker | One global density slider over the fixed-density system, bot XP rate, PvP, chat and its language, broker settings, skill learning, list of bots | yes |
| 6. Distribution | Public installer, updates from published releases, SQL updates, patch notes in FR and EN | releases |
| 7. Linux | The servers run there; the client needs Wine | — |

## Decisions and their reasons

- **Stop the game server cleanly.** Killing the Java process loses whatever was not saved yet.
- **Updates come as published builds**, not compiled on the player's machine: compiling needs Git, JDK 25 and Maven, too much to ask of
  a player.
- **The density slider is bounded by memory.** On the development PC 958 awake bots took 1.7 GB of the server's 2.5 GB; the launcher
  suggests a maximum from the RAM it finds.
- **The account sign-in asks for the password**, checked against the login server's database: on a LAN server another player must not act
  on your characters.
- **An action on a character in game goes through the server, never the database.** The server holds that character in memory and writes
  it back at the next save, overwriting the change. Hence the admin channel of phase 4; once it exists, each new action is one more command.
  The `bot-commands.txt` inbox the server already reads is not enough: it takes bot commands only and answers in the log.
- **Backups start with the whole database.** One character is spread over dozens of tables; a per-character backup comes later, if at all.
- **The server's PowerShell tools** (`start-server.ps1`, `apply-sql.ps1`, `sync-install.ps1`) are Windows-only: their logic is rewritten
  in TypeScript here, which is also what Linux needs.

## Open questions

- Does the 4.8 client accept anything on its command line that could pre-fill the account? If not, the launcher's sign-in only selects the
  character for the launcher's own actions.
