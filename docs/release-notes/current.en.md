# Release notes (English)

The English twin of [current.md](current.md): the same entries, headed by the same version tags, in the same order, written from the French
one in the same pass. Each entry names the lowest server version it works with ("Minimum server: ..."), and `tools/release.ps1` refuses a
release whose entry is missing from either file. When this file nears 200 lines, the oldest entries move to `<year>-<month>.en.md`.

---

## v0.3.0-beta.7 — 2026-11-14

**It arrives by itself if you have a v0.3.0 beta installed with the installer** (for the last time: from this one on, an update is offered,
never installed without you). Otherwise install it by hand with `Echoes-of-Atreia-Setup-0.3.0-beta.7.exe`.

**Minimum server: v0.1.0-beta.1.** The install from nothing needs server v0.1.0-beta.5.

**What changes**
- **Updates happen when you decide**: a new launcher version is offered on one line at the top of the window, with "What's new", "Update"
  and "Later". Nothing is downloaded before "Update", nothing installed before "Restart and install", and closing the launcher no longer
  installs anything. A download that fails says so and offers "Try again".
- **"What's new" opens in a window**, for the launcher and the server alike: the page no longer moves.
- **The home page fits the window** with no scroll bar:
  - the database (MySQL) takes one line like the servers; how it is run (your my.ini or the Windows service) opens from the "…" button
    beside its name;
  - with neither a service nor a my.ini, "Start with my own my.ini…" is on the row itself;
  - What's new and Installation are no longer stretched with empty room.
- **A window no longer closes** on a click in its margin; only on a click beside it.

---

## v0.3.0-beta.6 — 2026-11-14

**It arrives by itself if you have a v0.3.0 beta installed with the installer.** Otherwise install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.6.exe`.

**Minimum server: v0.1.0-beta.1.** The install from nothing, the bot density and the server's population need server v0.1.0-beta.5.

**What changes**
- **Install the server from nothing**: on a computer that has nothing but the game client, the home page offers "Install the server". You
  pick a folder (an empty one, or one an `echoes-server` folder is made in); the launcher checks the room on the drive, downloads and checks the
  server, its Java, its MySQL database and the bots' maps (about 2.1 GB), makes the database on a free port and takes that folder as its server.
  Nothing is installed on Windows. A download that stops is taken up where it was; if the database could not be made, "Try again" starts at
  that step.
- **The install's own Java and MySQL**: a server that carries its own (`runtime` and `mysql` folders) is started with them, and the backups use
  its tools; otherwise nothing changes.
- **The bot density** on the Bots page: the mode and the percentage, and the running server's population (the bots awake out of those wanted,
  those asleep, and whether the server holds arrivals for want of memory or of route planning).
- **The game server's memory fitted to the computer**: 1 GB under 6 GB of memory, 1.5 GB under 10 GB, 2 GB under 14 GB, the server's own value
  above.

**System requirements**: Windows and the Aion 4.8 client. A JDK 25 and MySQL only for a server installed some other way than by the launcher.

---

## v0.3.0-beta.5 — 2026-11-07

**It arrives by itself if you have a v0.3.0 beta installed with the installer.** Otherwise install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.5.exe`.

**Minimum server: v0.1.0-beta.1.** The premium rates need server v0.1.0-beta.3, which makes every player account premium: install it from
the "Server version" panel.

**What changes**
- **The rates are the premium accounts'**: every player account is premium (server v0.1.0-beta.3), so the Settings page sets the premium
  rates. The regular rates stay the bots' and are not shown. In place of "Official values", two buttons put the rates at a regular or a
  premium account's official values: you choose the pace of either.
- **The rates really apply in game**: written to `mygs.properties`, they were not taken into account. They are now written to
  `config/main/rates.properties` (the original is kept beside it, `rates.properties.before-launcher`). A rate set by an earlier launcher moves
  there at the next save.
- **A maximized or full screen window**: the whole page grows with the window instead of leaving empty margins (up to 160 %).
- **F11** puts the launcher in full screen and takes it out; a "Leave full screen" button replaces Windows' buttons, and Escape leaves it too.

**Requirements**: Windows, a JDK 25 or later, MySQL, the Aion 4.8 client.

---

## v0.3.0-beta.4 — 2026-11-07

**It arrives by itself if you have a v0.3.0 beta installed with the installer.** Otherwise install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.4.exe`.

**Minimum server: v0.1.0-beta.1.**

**What changes**
- **The game language**: the client was started with a language code it does not know, hence Korean on a client that holds French alone. The
  launcher now checks the client's folder before starting the game (the engine's files, the language packs of `L10N`) and offers, in
  Installation → "Game language", the languages whose pack is complete; by default, the launcher's own. A missing file or pack is named, and
  Play refuses rather than start a game that will not run.
- **A real icon** for the launcher, its title bar, the installer and the desktop shortcut. If Windows keeps the old one on the shortcut, it
  changes at the next restart.
- **Keep the servers in the background**: closing the window while the servers run offers a new answer that leaves them running under the
  launcher, which stays by the clock. Its icon opens the window again; its menu plays, starts or stops the servers, or quits.
- **The taskbar** shows the servers' state with a dot, and the progress of a backup or an update.
- **Options** in Installation: start the servers when the launcher opens, start the launcher with Windows, a desktop shortcut, and old files
  cleaned up at each start (to the recycle bin: the servers' archived logs past 30 days or 1 GB, the reports past the 10 newest; backups are
  never touched).
- **Report a problem** (at the bottom of the window): makes a zip of the servers' and the launcher's logs, the bots' notes and a summary,
  without your Windows account name, and opens the page to report it on GitHub.
- **A new home page**: the servers' state as a banner, the character, the bots in the world, the game server's memory and the last backup;
  the launcher's and the server's news; free space, backups and the database's size. The layout is the same in French and English.
- **Bots page**: the last hour's curve of the bots in the world, by faction.
- **Terminals**: in a drawer at the bottom, errors in red, warnings in yellow, a button that opens the logs' folder.
- **Less memory**: the launcher no longer uses the graphics card (110 to 190 MB less, left to the game), and its window is closed in the
  background (70 MB less).

**Not fixed yet** (known, no need to report it)
- **The French pack** going around comes from another build of the game: it lacks three files of the English pack (the 4.8 intro and two
  cutscene sound archives), and some 4.8 texts may be missing from it. The launcher says so in Installation.
- **Installing the server** from the launcher has not been checked on a real tester's install yet.

**Requirements**: Windows, a JDK 25 or newer, MySQL, the Aion 4.8 client.
