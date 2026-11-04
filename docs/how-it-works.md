# How the launcher runs the servers

What is true of the code today. The reasons are the point: each one is a trap the server's own scripts already hit.

## Finding the installation

- **Server folder**: the one chosen in the launcher, else `AION_SERVER_HOME`. It is an installation when `chat-server`, `login-server` and
  `game-server` each hold a `start.bat` with a `JAVA` line (`src/main/server/installation.ts`).
- **Client folder**: the one chosen, else a sibling of the server folder holding `bin64/aion.bin`.
- **Ports** come from each server's configuration, read the way the server merges it: every `config/**/*.properties`, then the
  `config/my*.properties` overrides (`mygs.properties`), which win. Nothing is hard-coded but the servers' own defaults.
- The choices are saved in `settings.json` in the launcher's profile folder.

## Starting

MySQL first (through its Windows service when it is down), then chat, login and game, each waiting for the one before: the game server
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
- **A stop may interrupt a start**: the game server takes minutes to load. Each server gives up its start at its next step.
- What the JVM writes before its logging starts (a wrong Java, a missing class) goes to `log/launcher-stderr.log`, and a failure shows its
  last lines.

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
- **Closing the window while servers run** asks: stop them and quit, leave them running, or stay. Servers left running are taken over at the
  next start of the launcher, found by port and by the main class on their command line.
- **One launcher at a time**: a second one only brings the first to the front, since both would believe they own the servers.

## Server settings

`src/main/server/serverSettings.ts`. The launcher writes only the game server's `config/mygs.properties`, the overrides the server reads
on top of its default files (`Config.java`: `new Properties(defaults)`, so an override also wins for the per-rank keys read by pattern).
Updating the server therefore never conflicts with the player's settings.

- **The catalog** (`src/shared/settingsCatalog.ts`) lists every setting offered, by family: the 30 rates of `rates.properties` (all read
  by the server: 26 in its core, the four arena rates in `data/handlers/instance/pvparenas/`), the daily Glory Point loss of the 9 officer
  ranks, and both factions. A setting the server's files lack is not offered. Labels are `group.<id>` and `setting.<id>` in each
  dictionary, checked by a unit test.
- **Regular accounts only.** A rate holds one value per membership level (`1.0, 2.0`: regular, premium); the launcher writes the regular
  value alone (`3.0`), which `Rates.get` then applies to every level.
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
- Settings saved while the game server runs apply at its next start; the launcher says so until it stops or starts again.

## MySQL

Up when its port answers. Started and stopped through its Windows service (`sc start|stop`), a running one first when there are several,
which needs administrator rights: Windows shows its permission prompt each time. A public install will bring its own database run as a
plain process instead (phase 6). Each probe is a connection MySQL sees close before its handshake; MySQL leaves loopback connections out of
the count that blocks a host, but a database on another machine would count them.

## Tests

`tests/e2e` drives the built launcher with Playwright against a fake installation in a temporary folder, on free ports. The launcher's own
executable, run as plain Node, plays Java (`ECHOES_FAKE_JAVA` → `tests/fixtures/fake-java.mjs`) and the client (`ECHOES_FAKE_CLIENT`):
the fakes move their log aside and write a new one, listen on their configured ports, and the game server refuses to start without the
other two and stops on `shutdown.request`. Everything else is the real code.
