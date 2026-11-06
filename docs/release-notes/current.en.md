# Release notes (English)

The English twin of [current.md](current.md): the same entries, headed by the same version tags, in the same order, written from the French
one in the same pass. Each entry names the lowest server version it works with ("Minimum server: ..."), and `tools/release.ps1` refuses a
release whose entry is missing from either file. When this file nears 200 lines, the oldest entries move to `<year>-<month>.en.md`.

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
