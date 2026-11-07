# Roadmap

Status: in progress: released as v0.2.0 on 5 November (phases 1 to 5); phases 0 and 1 done (start, client launch and stop checked by the tester on the real servers, 4 November; released as
v0.1.0); phase 2 built, unverified in game (the rates taking effect after a restart; the server side that keeps the bots' XP pace is not
deployed yet); phase 3 built: sign-in, several accounts, the characters and the one played with done (checked by the tester on the real
database, 4 November); backup and restore done (checked by the tester on the real database, 4 November); phase 4 built, its server side deployed on 4 November, unverified in game; phase 5 built: the bot list by faction (checked on the real database) and the bot settings (XP, PvP, chat, broker; unverified in game,
the server's bot options of 4 November are not deployed yet, so the installed server offers only the switches it already had); density and skill learning are postponed.

How phases 1 and 2 work, and why: [how-it-works.md](how-it-works.md).

The launcher is distributed publicly: a player installs it, it installs or finds the server and the client, and the game is one click away.

## What each feature needs

Features fall in three kinds, and the kind decides the order:

- **Launcher only** — processes and files: start and stop MySQL and the three servers, launch the client, show their terminals, detect
  an install, patch notes, FR/EN.
- **A server setting that already exists** — written to `game-server/config/mygs.properties`, the local overrides file, never to the
  defaults (so a server update never conflicts with the player's choices): the 30 rates of `rates.properties`, the daily Glory Point loss
  of each Abyss rank (honour points are the Glory Points), both factions on one account. A change takes effect at the next server start,
  and the launcher says so.
- **Server work first** — the setting does not exist yet and is added to the server before the launcher shows it: skill learning (only
  stigmas have an auto-learn setting), every bot setting (`playerbot.properties` only has `enable` and `populate`), the broker house, and any
  action on a character that is in game.

## Phases

| Phase | Content | Server work |
|---|---|---|
| 0. Base | Electron + TypeScript + React, FR/EN, Playwright, README | — |
| 1. Play | Detect server, client and MySQL; ordered start (MySQL, chat, login, game, each waiting for the one before); clean stop; the three terminals; launch the client | — |
| 2. Settings | Every rate by family (a family field and each rate), the daily Glory Point loss rank by rank, both factions, in `mygs.properties`, with "restart required" | world bots keep their XP pace (`BotPacing.OFFICIAL_XP_RATE`) |
| 3. Account | Sign in with account name and password, list its characters, pick the one played; several accounts; database backup and restore | — |
| 4. Admin channel | A folder `game-server/admin/` the running server answers (`reload-config`, `destinations`, `teleport`): saved settings apply at once, and the picked character can be teleported to any place of the server's teleport list (Account page) | yes (`AdminChannel`) |
| 5. Bots and broker | List of the bots by faction (read from the database, no server work); bot XP rate, PvP, chat and its language, broker settings (Bots page, from the server's bot options) | yes (`PlayerBotConfig`) |
| Postponed | The global bot density slider (to follow the living-world tests on the server first); skill learning (its rules are still to be defined) | yes |
| 6. Distribution | Public installer, updates from published releases, SQL updates, patch notes in FR and EN (each server and launcher release carries its notes in both languages, shown as "What's new" after an update in the launcher's language; test releases too, since 6 November; a beta launcher installs the server's pre-releases: the server repository's `docs/architecture/plans/release-process-plan.md`); see "Distribution and client options" below | releases |
| 6b. Client options | The client in French, several clients at once, the Vulkan renderer; see below | — |
| 7. Linux | The servers run there; the client needs Wine | — |

## Distribution and client options

Planned on 5 November, in this order. None of them touches the client's executables.

1. **Updates by difference.** A release publishes a manifest: every file of the server and client with its size and SHA-256. The launcher compares
   it with the install, downloads only what changed, backs up each file it replaces (so an update can be rolled back) and never touches the
   database, `mygs.properties` or the player's saves. SQL changes go through the server's own once-only mechanism (`schema_applied_sql`).
2. **A first download that resumes and verifies.** The full install is tens of gigabytes: downloaded in parts that survive a closed launcher or a
   lost connection, checked against the manifest's SHA-256 before anything is extracted, with a second source when the first fails.
3. **The client in French.** Built on 7 November for a pack already in `L10N`: the launcher checks the client, offers the complete packs and
   starts the client with `-lang:<code>` ([client.md](client.md)). Still to do: shipping a French pack, whose source must be settled before
   anything is distributed.
4. **Several clients at once**, each signed in to its own account: an open game no longer blocks Play. For testing groups and trades alone.
5. **The Vulkan renderer**, optional: DXVK's Direct3D 9 DLL put beside the client or removed again, the choice remembered. Often smoother on
   recent graphics cards; switched only while every client is closed.

Then, cheaper and independent of the five above:

6. **Dungeon re-entry**: `gameserver.instance.cooldown_rate` (in `instance.properties`: 1 the official wait, 3 a third of it, 0 none) on the
   Server page. For a player alone with bots, running a dungeon again without waiting changes everything. A server setting that already exists.
7. **A server dashboard**: each server's state live, and a summary of the game server's log (errors, a log gone silent, bots in the world) without
   opening the file; the logic of the server's `check-server-log.ps1`, rewritten in TypeScript.
8. **Check and repair the install**, from the manifest of point 1: every file against its hash, what is missing or changed listed and downloaded
   again.
9. **The starting level** (level 1, or straight to the level 10 Ascension, for players and their bots), once the server has the setting.
10. **A live world map, plain**: per map, the bots awake and asleep, the players, the density mode and percent, the memory guard's state;
    refreshed every few seconds from a new admin channel command (`world`), which the server answers from the director's last review. The full
    version, with each bot's place and activity, is planned in the game (the server's living world plan, lot H4); this one is for the game closed.
11. **Bring one of my characters into my group**: planned in the game first (lot H4, a button of the in-game bar and a page of the account's
    characters), where the group is. Here, a button beside each character of the Account page, once the server has the command (`//bot alt`).

The teleport of the Account page and the Bots page stay as they are; their fuller versions are planned in the game too (lot H4).
12. **GM tools**: planned in the game rather than here, as a page of the client's own browser and buttons of an interface addon (the server's
    living world plan, lot H3), where the character, its target and its place are at hand. The launcher's part is to install the addon and keep it
    in step with the server; it takes the forms itself only if the client turns out unable to open the server's pages.

## Decisions and their reasons

- **Stop the game server cleanly.** Killing the Java process loses whatever was not saved yet.
- **Updates come as published builds**, not compiled on the player's machine: compiling needs Git, JDK 25 and Maven, too much to ask of
  a player.
- **The density slider is bounded by route planning, not memory.** Measured on the server on 5 November: a bot costs about 0.15 MB, and 1894
  awake held 1.85 GB of the 2.5 GB heap; but at 100 % the route queue fell behind (fixed the same evening, to be measured again) and the server
  took 6 to 9 of 16 cores. The slider offers `AUTO`, `FIXED` and `FLOOR` with a percent up to 50 until the next measurement says otherwise.
- **The account sign-in asks for the password**, checked against the login server's database: on a LAN server another player must not act
  on your characters.
- **An action on a character in game goes through the server, never the database.** The server holds that character in memory and writes
  it back at the next save, overwriting the change. Hence the admin channel of phase 4; once it exists, each new action is one more command.
  The `bot-commands.txt` inbox the server already reads is not enough: it takes bot commands only and answers in the log.
- **Rates are set for regular accounts only**, one value per setting, which the server applies to every membership level. Premium is not
  offered: nobody is premium, the bots included.
- **Raising the players' XP must not empty the regions**: the world's bots were paced at 1% of the official rate, so the server makes a
  paced bot read the official rate whatever the players' is (one `playerbots:` line in `Rates.calcXpRate`).
- **Only the settings changed on the page are written**, so a value the page cannot show as it is (a premium rate of its own, the
  reservation mode) survives a save.
- **Language**: the switch's choice, else the system's when the launcher has it, else English.
- **Backups start with the whole database.** One character is spread over dozens of tables; a per-character backup comes later, if at all.
- **The server's PowerShell tools** (`start-server.ps1`, `apply-sql.ps1`, `sync-install.ps1`) are Windows-only: their logic is rewritten
  in TypeScript here, which is also what Linux needs.

## Open questions

- Does the 4.8 client accept anything on its command line that could pre-fill the account? If not, the launcher's sign-in only selects the
  character for the launcher's own actions.
