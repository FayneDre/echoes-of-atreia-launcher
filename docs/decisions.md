# Decisions and their reasons

Why the launcher works the way it does: what kind of work each feature needs, the decisions taken and why, the questions still open.
Moved from the roadmap on 7 November 2026; what is done and left is in [roadmap.md](roadmap.md).

## What each feature needs

Features fall in three kinds, and the kind decides the order:

- **Launcher only** — processes and files: start and stop MySQL and the three servers, launch the client, show their terminals, detect
  an install, patch notes, FR/EN.
- **A server setting that already exists** — written to `game-server/config/mygs.properties`, the local overrides file, except the rates,
  written to `config/main/rates.properties` itself since 2026-11-07 (from mygs.properties they did not apply in game): the 30 rates, the daily Glory Point loss
  of each Abyss rank (honour points are the Glory Points), both factions on one account. A change takes effect at the next server start,
  and the launcher says so.
- **Server work first** — the setting does not exist yet and is added to the server before the launcher shows it: skill learning (only
  stigmas have an auto-learn setting), every bot setting (`playerbot.properties` only has `enable` and `populate`), the broker house, and any
  action on a character that is in game.

## Decisions

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
- **Every player account is premium, and the page sets the premium rates** (2026-11-07, replacing "regular accounts only"): the login
  server raises every account to premium (`loginserver.accounts.minimum_membership`). In place of "Official values", two buttons put the
  premium rates at a regular or a premium account's official values: a player chooses the pace of either. The regular values in the file are
  the bots' (they have no account) and are never shown.
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
