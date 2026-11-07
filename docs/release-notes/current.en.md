# Release notes (English)

The English twin of [current.md](current.md): the same entries, headed by the same version tags, in the same order, written from the French
one in the same pass. Each entry names the lowest server version it works with ("Minimum server: ..."), and `tools/release.ps1` refuses a
release whose entry is missing from either file. When this file nears 200 lines, the oldest entries move to `<year>-<month>.en.md`.

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

---

## v0.3.0-beta.3 — 2026-11-06

**It arrives by itself if you have v0.3.0-beta.2 installed** (with the installer): the first update the launcher makes on its own. Otherwise
install it by hand with `Echoes-of-Atreia-Setup-0.3.0-beta.3.exe`.

**Minimum server: v0.1.0-beta.1.** To install the server from the launcher, server v0.1.0-beta.2 is needed, the first shipped built.

**What changes**
- **The launcher installs the server**: a "Server version" panel on the home page shows the version installed and offers the newest server
  pre-release, with its notes. "Update the server" downloads and checks everything while the servers run (the server, then the navmesh maps
  that changed: 1.8 GB the first time), then shows what will happen: the settings files you edited, which stay as they are (the new version
  is put beside them as `.new-<version>`), and your database if it has never been through the server's SQL script. "Install" stops the
  servers cleanly, replaces the files keeping a copy of each, updates the database (after a backup of it) and starts the servers again.
- **Going back**: "Return to..." puts the previous version's files back. The database keeps the update's changes; its backup is in the
  server's `backups` folder.
- **A JDK 25 is needed** (not only Java): the launcher checks it before installing and says what to do when it is missing.
- **A development server** (installed by the server's deploy script) is never replaced by a published version.

**Not fixed yet** (known, no need to report it)
- **Installing the server** was checked in tests and on a trial bundle only, not on a real tester's install yet.
- **The client's language** is forced to English: a client that only has French shows Korean.

**Requirements**: Windows, a JDK 25 or later, MySQL, the Aion 4.8 client.

---

## v0.3.0-beta.2 — 2026-11-06

**Install it once by hand, with the installer** (`Echoes-of-Atreia-Setup-0.3.0-beta.2.exe`, not the portable build): it is the first version
that updates itself, and the next ones come through the launcher.

**Minimum server: v0.1.0-beta.1.** The launcher now checks it by itself.

**What changes**
- **Self-update**: the launcher looks for its versions on GitHub at start, then every 4 hours (a beta follows the pre-releases, a stable
  version only the stable ones). A newer version downloads in the background, a banner says when it is ready, with its notes in your language,
  and it installs when the launcher closes. "Restart and install" installs it at once: if servers run, closing asks what to do with them as
  usual, and nothing is offered during a start or a stop. The portable copy cannot replace itself: it only says a version is out and where to
  download it.
- **Server version**: the launcher asks the game server for its version once it is ready, and reads it from the install's `manifest.json`
  when it is stopped. A server too old for this launcher shows a banner that says which version to install.
- **Servers already running**: the launcher takes over a server started outside it only when there is just one of its kind on the computer.
  When there are several, it no longer guesses which is yours, and asks you to stop it yourself in its window rather than stop another one.

**Not fixed yet** (known, no need to report it)
- **Updating from GitHub** was checked against a local test server only: the real check is the move to beta.3.
- **The client's language** is forced to English: a client that only has French shows Korean.

**Requirements**: Windows, Java 25 or later, MySQL, the Aion 4.8 client.

---

## v0.3.0-beta.1 — 2026-11-06

The launcher's first pre-release: it is made from the `develop` branch, and the stable version (`Latest`) stays v0.2.0.

**Minimum server: v0.1.0-beta.1**, the server's first pre-release (it has the admin channel and the bot settings the Bots, Teleport and Settings
pages need). The launcher does not check the server's version by itself yet: that comes in a later version.

**What changes**
- **MySQL stopping at once**: when Windows starts the MySQL service but MySQL stops right after, the launcher says why (the service's state,
  the configuration file it reads and the last errors of its log) instead of waiting for nothing.
- **MySQL with your own my.ini**: "Start with my own my.ini…" runs MySQL as a program with your file, without the service and without asking
  for administrator rights. "Use the Windows service" goes back to the service. The launcher stops it with `mysqladmin shutdown`, never by
  killing it: the game server's database account needs the SHUTDOWN privilege, or the launcher shows MySQL's refusal.

**Not fixed yet** (known, no need to report it)
- **The client's language** is forced to English: a client that only has French shows Korean.
- **The "my own my.ini" mode** was checked on a throwaway MySQL install, not on yours yet.

**Requirements**: Windows, Java 25 or later, MySQL, the Aion 4.8 client.

---
