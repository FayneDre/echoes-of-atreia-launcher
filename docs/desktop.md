# The launcher on the desktop

What is true of the code today: what the launcher shows outside its window, what it keeps in the background, the options that touch Windows,
the problem report, and the two views made for whoever watches the servers (coloured terminals, the bots' last hour).

## The taskbar

`src/main/taskbar.ts`. The stack's state comes from `stackPhase()` (`src/shared/types.ts`), the same function the home's banner reads, so the
two never disagree.

- **A dot over the icon**: green once the game server is ready, red when a server failed, amber for anything between (a start, a stop,
  servers partly up, a server update), none when everything is stopped. The dots are drawn in code as raw pixels (`dotPixels`): no image
  file to ship, sharp at the 16 points Windows draws an overlay at.
- **The progress bar**: filled with a server update's share while it downloads or installs; moving without a share during a backup, a
  restore, or an update step that does not count.
- The overlay and the menu are rebuilt only when what they show changes: the state is published far more often than it changes.

## The notification area

An icon by the clock from the start (`TaskbarPresence`): a click shows the window; its menu opens the launcher, plays, starts or stops the
servers, and quits. Its tooltip says the stack's state. The menu speaks the interface's language, which the page sends at each change
(`launcher:set-language`).

**Closing the window while servers run** offers a fourth answer beside stop, leave and stay: **keep them in the background**. The window
hides and the launcher keeps the servers exactly as when it shows: their logs followed, a stop still asked for in the proper way. Quitting
from the tray's menu shows the window and closes it as its own button would, so the same question is asked. A second launcher started
while one is in the background shows the hidden window instead.

## Options in the Installation window

- **Start the servers when the launcher opens** (`startServersOnLaunch` in `settings.json`): after the detection, whatever is down starts;
  servers found running are taken over as at any start.
- **Start the launcher with Windows**: Windows' own login items (`app.setLoginItemSettings`), read back from Windows each time the window
  opens, since the person may change it there. The portable build is started through `PORTABLE_EXECUTABLE_FILE`, its own file, not the
  copy it unpacks.
- **Shortcut on the desktop**: `Echoes of Atreia.lnk`, the name the installer gives its own, so unticking removes that one too.
- Run from its sources, the launcher is `electron.exe`: the two Windows options are shown disabled ("for the installed launcher only").
  The end-to-end tests give a folder for the shortcut (`ECHOES_DESKTOP_DIR`), which offers it there too.
- **Clean up old logs and reports at each start** (`autoCleanup`; `src/main/system/cleanup.ts`): to the **recycle bin**, the three
  servers' archived logs (`log/archived/*.zip`) past 30 days, then the oldest while they hold more than 1 GB together, and the reports past
  the 10 newest. Unset, it is on, except in the developer mode, where old archives are read back for a tester's notes (`isAutoCleanup`):
  its first run on the development server took 54 chat and login archives a month old, deleted for good before the recycle bin. Measured on the development server: about 160 MB of archives for ten days of tests, nearly all the game server's. Never
  touched: the current logs, the backups, `log/bot-measures`, the server update's files. A file still open somewhere waits for the next
  start. The option says what this start removed; a tester's `//bot note` older than a month is gone with its archive.
- **Developer mode**: see [home-page.md](home-page.md).

## Reporting a problem

`src/main/report.ts`, opened from "Report a problem" at the foot of every page. It makes `reports/report-<date>.zip` in the server's folder
(the profile folder when there is none) holding:

- `summary.txt`: launcher and server versions, Windows, Java, both folders, MySQL and each server with its problem, the bots in the world,
  the character played;
- for each server, the last 8 MB of `log/server_console.log` (a log rolls over at 100 MB; what led to a problem is in its last minutes)
  and its `log/launcher-stderr.log`;
- `bot-notes.txt`: every `//bot note` line (`BOT NOTE`) of the game server's current log, searched line by line through the whole file.

Wherever a path names the person's profile folder (and so their Windows account), it is written `~`: a report is meant for a public
issue. Nothing is sent. The dialog then shows the file in Explorer, or opens a new issue on the server's repository, its text in the person's
language with the versions and the file's name to drag onto the page (a URL cannot carry a file). The page may only ask for the last
report made: it never names a path to show.

## Terminals

The error lines of a log (`ERROR`, an exception, its `Caused by:` and `at` lines) show in red, the `WARN` ones in amber; "Errors only"
keeps both. Each line stays one text node, so a copied selection is the log as written. "Open the folder" opens the server's `log` folder.

## The bots' last hour

`src/main/bots/botHistory.ts`. While the game server is ready, the launcher counts the bots in the world by faction once a minute (the same
count as the home's banner) and keeps an hour of points, in memory only: a launcher started again starts a new curve. A count that cannot
be read adds no point, and two points more than three minutes apart are not joined, so a server that was down shows as a gap rather than a
line across it.

The Bots page draws it (`BotHistoryChart.tsx`): one 2-pixel line a faction, labelled at its end, with a legend, a crosshair and the two
counts on hover, and a hidden table for screen readers. The faction colours are checked for colour blindness against the panels' surface;
the interface's light Elyos blue was too light for a line there, so the chart uses a deeper one. The page asks for the points every 20
seconds while it shows; the tests ask the launcher for a point every few hundred milliseconds (`ECHOES_BOT_SAMPLE_MS`).
