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
  for one it found running. The file is replaced at every start, and the reader starts over when it is.
- What the JVM writes before its logging starts (a wrong Java, a missing class) goes to `log/launcher-stderr.log`, and a failure shows its
  last lines.

## Stopping

- **The game server is never killed while it can stop by itself.** It saves the players from a shutdown hook that a killed process never
  runs. The launcher writes `game-server/shutdown.request`, which the server's `ShutdownRequestWatcher` picks up within half a second,
  and waits up to 15 minutes (saving every bot took up to 510 s). A request still there after 10 seconds means a server too old to read
  it: the launcher removes it, says so, and only then offers to force the stop, after a warning.
- The chat and login servers keep nothing a shutdown would save: they are ended directly.
- Order: game, login, chat; MySQL only on its own button, and never while the game server runs.
- **Closing the window while servers run** asks: stop them and quit, leave them running, or stay. Servers left running are taken over at the
  next start of the launcher, found by port and by the main class on their command line.

## MySQL

Up when its port answers. Started and stopped through its Windows service (`sc start|stop`), which needs administrator rights: Windows
shows its permission prompt each time. A public install will bring its own database run as a plain process instead (phase 6).

## Tests

`tests/e2e` drives the built launcher with Playwright against a fake installation in a temporary folder, on free ports. The launcher's own
executable, run as plain Node, plays Java (`ECHOES_FAKE_JAVA` → `tests/fixtures/fake-java.mjs`) and the client (`ECHOES_FAKE_CLIENT`):
the fakes move their log aside and write a new one, listen on their configured ports, and the game server refuses to start without the
other two and stops on `shutdown.request`. Everything else is the real code.
