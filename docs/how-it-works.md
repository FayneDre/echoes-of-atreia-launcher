# How the launcher runs the servers

What is true of the code today. The reasons are the point: each one is a trap the server's own scripts already hit.
The server's own update (download, check, install, return) is in [server-update.md](server-update.md).
The home page (banner, news, what each fact reads) is in [home-page.md](home-page.md); the taskbar, the notification area, the options
that touch Windows and the problem report in [desktop.md](desktop.md); the client's check and the game language in [client.md](client.md).

## Finding the installation

- **Server folder**: the one chosen in the launcher, else `AION_SERVER_HOME`. It is an installation when `chat-server`, `login-server` and
  `game-server` each hold a `start.bat` with a `JAVA` line (`src/main/server/installation.ts`).
- **Client folder**: the one chosen, else a sibling of the server folder holding `bin64/aion.bin`; its files and language packs are checked
  ([client.md](client.md)).
- **Ports** come from each server's configuration, read the way the server merges it: every `config/**/*.properties`, then the
  `config/my*.properties` overrides (`mygs.properties`), which win. Nothing is hard-coded but the servers' own defaults.
- The choices are saved in `settings.json` in the launcher's profile folder.

## Starting

MySQL first (through its Windows service, or as a program with the person's my.ini, when it is down), then chat, login and game, each waiting for the one before: the game server
connects to the other two while it starts.

- **Each server runs as a bare JVM** with the arguments of its `start.bat`'s `JAVA` line. The batch file is not run: it reopens itself in
  Windows Terminal and ends on a `PAUSE`, so its window would outlive the server.
- **Detached, hidden, no console.** Closing the launcher can leave the servers running, and there is no console to click into: a console
  in selection mode freezes the whole server.
- **Ready means the port answers a connection.** The system's table of listening sockets was not reliable on the development PC (wrong
  states on a French Windows, MySQL missing from it). Probing stops at the first yes: the game server rejects a source that opens 20
  connections in 10 seconds.
- **The game server is ready only once its log says `Connected to login server`**, minutes after its port opens: until then a client sees
  the server as down.
- **The terminals follow each server's `log/server_console.log`**, not its output: the same view for a server the launcher started and
  for one it found running. The file is replaced at every start and rolls over at 100 MB, and the reader starts over when it is; of a
  server found running only the last 256 KB are shown, and whether it has registered is searched in chunks through its console log and
  the ones it rolled over.
- **A stop may interrupt a start**: the game server takes minutes to load. Each server gives up its start at its next step. A stop asked
  during a one-server restart wins too: the request is cleared only when an activity begins, never after one of its waits.
- **One server alone**: each row starts its server, or stops and starts it again, after starting whatever it needs that is down (MySQL, the
  servers before it); the others are left running, the game server reconnecting to a chat or login server that came back.
- **A start whose main thread died is given up at once.** A handler that does not compile ends the game server's main thread with
  `Critical Error - Thread [main] terminated abnormally`, but the JVM stays up on the threads it started and never opens its port: the
  launcher used to wait the two minutes of the port. It now reads that line in the log, ends the JVM (it holds nothing yet), and shows the
  first error the start logged.
- What the JVM writes before its logging starts (a wrong Java, a missing class) goes to `log/launcher-stderr.log`, and a failure shows its
  last lines, folded under "Details"; the terminals, a drawer at the foot of the home page, open by themselves on the failed server.

## Stopping

- **The game server is never killed once it can stop by itself.** It saves the players from a shutdown hook that a killed process never
  runs. The launcher writes `game-server/shutdown.request`, which the server's `ShutdownRequestWatcher` picks up within half a second,
  and waits up to 15 minutes (saving every bot took up to 510 s). A request still there after 10 seconds means a server too old to read
  it: the launcher removes it, says so, and only then offers to force the stop, after a warning.
- **Before its port opens, the game server is ended instead.** `GameServer.java` opens the port, then installs the hook and starts the
  watch, then loads the bots: before the port, there is neither a player nor a bot to save, nor anything that would read the request.
- **Whether a server is gone** is asked of its process when the launcher knows it, else of its port every 5 seconds only: each answer is a
  connection the game server counts against its flood limit.
- The chat and login servers keep nothing a shutdown would save: they are ended directly.
- Order: game, login, chat; MySQL only on its own button, and never while a server runs.
- **Closing the window while servers run** asks: stop them and quit, keep them in the background (the launcher stays in the notification
  area, see [desktop.md](desktop.md)), leave them running, or stay. Servers left running are taken over at the
  next start of the launcher, found by port and by the main class on their command line. The command line does not say which install a
  server runs from (`-cp "libs/*"` is relative): when two processes name the class (another install, a server started by hand), none is
  taken for this one. The game server still stops through its request in its own folder; a chat or login server is not killed on a guess,
  and the launcher says to stop it in its window. The tests' fake servers use their own class names for that reason.
- **The launcher updates itself** (`src/main/update/updater.ts`, `electron-updater`) from its GitHub releases: `build.publish` in
  `package.json` puts an `app-update.yml` in the build, and each release carries `latest.yml` and the installer's `.blockmap`
  (`tools/release.ps1` refuses a build without them). A version with a pre-release part (`-beta.N`) follows the pre-releases, a stable one
  only `Latest`: no setting. Checked once, at start (the start is what finds an update; never in the developer mode, see [home-page.md](home-page.md)); a newer version downloads in the background, is shown with the release's
  `notes.<language>.md`, and installs when the launcher closes. "Restart and install" closes the window the usual way, so the question about
  running servers comes first, and the installer starts only once the launcher has quit (`quitAndInstall` would start it before). Never
  offered while servers start or stop. The portable build cannot replace itself: it links to the release. A development run does not
  update; the tests give a local feed (`ECHOES_UPDATE_FEED`, `ECHOES_UPDATE_CONFIG`).
- **One launcher at a time**: a second one only brings the first to the front, since both would believe they own the servers.

## Server settings

`src/main/server/serverSettings.ts`. The rates are written to the default file that defines them (`config/main/rates.properties`):
set in `mygs.properties` they did not apply in game (2026-11-07, two people testing on the live server). Its version from before the first
change is kept as `rates.properties.before-launcher` and holds the official values the page compares with; a rate back to its official
value gets its official line back, and a rate an earlier launcher left in `mygs.properties` moves to the file at the next save. Every other
setting goes to `config/mygs.properties`, the overrides the server reads on top of its default files.

- **The catalog** (`src/shared/settingsCatalog.ts`) lists every setting offered, by family: the 30 rates of `rates.properties` (all read
  by the server: 26 in its core, the four arena rates in `data/handlers/instance/pvparenas/`), the daily Glory Point loss of the 9 officer
  ranks, and both factions. A setting the server's files lack is not offered. Labels are `group.<id>` and `setting.<id>` in each
  dictionary, checked by a unit test.
- **Premium accounts.** A rate holds one value per membership level (`1.0, 2.0`: regular, premium). Every player account is premium (the
  server's `loginserver.accounts.minimum_membership`), so the page sets the premium value and writes the line with the regular one, the
  bots', as the server has it (`3.0` is read as both, `3.0, 5.0` once premium is changed); a line whose every level is official is removed.
  In place of "Official values", a group with rates and the save bar have "Regular values" and "Premium values": every rate to that account
  level's official value (`ServerSettings.regular` and `official`), the other settings to their one official value; a button is greyed
  while the values already match. Groups without rates and the bots page keep "Official values".
- **A family's field** sets all of its settings to one value, or, for the Glory Point loss, to a share of their official values (rounded
  to whole points, read back from the rank that loses the most, the only one that keeps the share exact). It reads "mixed" when they
  differ. The AP lost on a PvP death is a family of its own, so raising every gain never raises the penalty.
- **Only what was changed on the page is written.** A setting the page cannot show as it is (a premium rate of its own, the character
  reservation mode 2) stays as the file has it until the person changes it. Changes not saved survive going to another page.
- **What a rate does not cover**, said on the page: siege Glory Points and some instance rewards are fixed by the server, and the world's
  bots keep their own XP pace (`BotPacing.OFFICIAL_XP_RATE` on the server side).
- A value back to the default is **removed** from the file rather than written, and the launcher's header with it once nothing is left
  under it. Every other line is kept byte for byte (blank lines at the very end aside): the file is read and written as ISO-8859-1, as
  Java reads it, replaced in one step, and its version from before the launcher's first change is kept beside it as
  `mygs.properties.before-launcher`.
- Settings saved while the game server runs are applied at once through the admin channel (`reload-config`); a server that cannot be
  asked applies them at its next start, and the launcher says so until it stops or starts again. A setting marked `startOnly` (the broker
  house and its buyer turned on or off, the buyer's daily ceiling) asks for that restart whatever the reload does, and a later save does not
  take the notice away.
- **The bot options** (`gameserver.playerbot.*`, the server's `playerbot.properties`) are groups of the same catalog with `page: 'bots'`,
  set on the Bots page above the list: a world bot's XP as a percent of the official rate (1 at least), PvP and its temperament shares and
  level band, the chat and its language, the broker. They add three kinds: `flag` (written `true`/`false`), `count` (a whole number in the
  definition's own bounds, with a unit) and `choice` (an index into `options`, written as the option). A server older than an option does
  not have it in its files, so it is not offered.

## Accounts and characters

`src/main/accounts/`. The launcher reads the server's two databases, with the credentials each server uses (its `config`, overrides
included), and never writes to them: the login server's `account_data` for the accounts, the game server's `players` for the characters.
A connection is opened for each question and closed after it.

- **The password is checked as the login server checks it**: SHA-1 of its UTF-8 bytes, in Base64 (`AccountUtils.encodePassword`).
- **It is kept encrypted by Windows** (Electron `safeStorage`, DPAPI): unreadable on another computer or by another Windows user, never in
  clear in `settings.json`. It is checked again at every start, so a password changed on the server asks for the new one.
- **Several accounts** can be kept; one is active, and each remembers the character played with. Accounts are not created from the
  launcher: the login server creates one at its first sign-in from the client.
- **The level** is not in the database: it is computed from the experience with the server's `player_experience_table.xml`, as
  `PlayerExperienceTable.getLevelForExp` does. **The map** name comes from `world_maps.xml`.
- The world's bots live on reserved accounts (900000 and up) and are never listed: only the signed-in account's characters are.
- The end-to-end tests read a JSON file instead of the databases (`ECHOES_FAKE_DB`).

## Backups

`src/main/backup/backupService.ts`. `mysqldump` copies both databases, each with the credentials its server uses, into
`<server>/backups/<date>/`: one `.sql` per database, then `backup.json` last (a folder without it is a backup that did not finish, and is
not offered). `mysql` reads one back. Both come from the folder of the MySQL service's `mysqld.exe`, else the PATH.

- **Credentials go through an option file** (`--defaults-extra-file`, first on the line), removed once the tool is done: never on a command
  line, where any program can read it, nor in `MYSQL_PWD`, which recent MySQL no longer reads.
- **The servers' user has rights on its databases only.** So `--no-tablespaces` (else PROCESS is asked), and, read from the tool's own
  help because an option it does not know makes it fail: `--set-gtid-purged=OFF` (GTIDs are on, and `--single-transaction` then flushes
  the tables, which asks for RELOAD) and `--skip-masking-policies` (recent MySQL reads a system table for them). Found on the development
  PC's MySQL 26.7, whose first real backup failed without them.
- **A backup can be made while the servers run** (`--single-transaction` reads one instant without locking them out; what the game server
  has not saved yet is not in it). **A restore needs them stopped** — a running game server would write its characters back over the
  restored ones — and first backs up what is there (kind `before-restore`), so a restore can itself be undone.
- A backup's id is its folder name, checked against the date pattern before anything is read or removed.
- The end-to-end tests play both tools with `tests/fixtures/mysql-tools/` (`ECHOES_FAKE_MYSQL_TOOLS`).

## MySQL

Up when its port answers. Started and stopped through its Windows service (`sc start|stop`), a running one first when there are several,
which needs administrator rights: Windows shows its permission prompt each time. `sc start` answering 0 only means Windows took the
request: a service that stops at once (a tester's, whose working my.ini was not the one the service reads) is reported with its state, its
`--defaults-file` and the last `[ERROR]` lines of the log that file places.

The person can instead run MySQL as a program with their own my.ini (`mysqlOptionsFile` in the launcher's settings, chosen while MySQL is
down): `mysqld.exe --defaults-file=<it> --port=<the servers' port>`, detached and needing no permission, the program found in the file's
`basedir`, a `bin` beside it, or the service's. It is stopped with `mysqladmin shutdown` under the game server's database account, which
needs the SHUTDOWN privilege; a refusal is shown as MySQL words it, and MySQL is never killed (verified on MySQL 26.7: the monitor and
its child both end, "Shutdown complete"). The same shutdown stops a MySQL started by the person's own script while the service is down.
Windows' `MYSQLShutdown<pid>` event, which would need no account, could not be opened from outside on 26.7. A public install will bring its
own database run this way (phase 6). Each probe is a connection MySQL sees close before its handshake; MySQL leaves loopback connections out of
the count that blocks a host, but a database on another machine would count them.

## Tests

`tests/e2e` drives the built launcher with Playwright against a fake installation in a temporary folder, on free ports. The launcher's own
executable, run as plain Node, plays Java (`ECHOES_FAKE_JAVA` → `tests/fixtures/fake-java.mjs`) and the client (`ECHOES_FAKE_CLIENT`):
the fakes move their log aside and write a new one, listen on their configured ports, and the game server refuses to start without the
other two and stops on `shutdown.request`. Everything else is the real code.

## The admin channel (phase 4)

The launcher asks the running game server through files, as it asks it to stop (`shutdown.request`): it writes `game-server/admin/<id>.tmp`,
renames it `<id>.request` (one line: the command and its words), and waits for `<id>.response`, whose first line is `ok` or `error <why>`
and the rest data. The server reads the folder twice a second. No port and no key: whoever can write in the server's folder can already replace
the jar. A server without the channel never answers; the launcher gives up after a few seconds.

- `version`: asked each time the game server becomes ready; the answer is `version`, `revision` and `api` lines. A server that does not
  know it (or has no channel) is level 0. While the game server is stopped, the same comes from the install's `manifest.json`, which the
  server's deploy script writes; with neither, nothing is known and nothing is said. Below `MIN_SERVER_API_LEVEL` (`src/shared/types.ts`),
  the Account, Bots and Settings pages say which server version to install (`MIN_SERVER_VERSION`). Both are raised by a release that needs
  a newer server, and its notes say so.
- `reload-config`: sent after a save when the game server is ready; the rates are read at each gain, so they apply at once. If it is not
  answered, the "restart needed" banner shows as before.
- `destinations`: the server's teleport list (location, map, x y z, name); the interface offers each name once.
- `teleport <character id> <map> <x> <y> <z>`: for the character picked on the Account page; the server refuses one that is not in game.
  It goes through the server because it holds the character in memory and would write it back over a change made in the database.
