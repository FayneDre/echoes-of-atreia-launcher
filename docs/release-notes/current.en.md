# Release notes (English)

The English twin of [current.md](current.md): the same entries, headed by the same version tags, in the same order, written from the French
one in the same pass. Each entry names the lowest server version it works with ("Minimum server: ..."), and `tools/release.ps1` refuses a
release whose entry is missing from either file. When this file nears 200 lines, the oldest entries move to `<year>-<month>.en.md`.

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
