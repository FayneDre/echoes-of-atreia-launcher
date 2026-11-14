# Release notes (English)

The English twin of [current.md](current.md): the same entries, headed by the same version tags, in the same order, written from the French
one in the same pass. Each entry names the lowest server version it works with ("Minimum server: ..."), and `tools/release.ps1` refuses a
release whose entry is missing from either file. When this file nears 200 lines, the oldest entries move to `<year>-<month>.en.md`.

---

## v0.3.0-beta.12 — 2026-11-15

**Offered by the launcher** if you have v0.3.0-beta.11: "Update" on the line at the top of the window. Otherwise, install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.12.exe`.

**Minimum server: v0.1.0-beta.1.** Installing from nothing needs server v0.1.0-beta.6; the administration panel, a server newer than
v0.1.0-beta.6; the PC RAM mark, server v0.1.0-beta.8 (without it, its settings do not show).

**What changes**
- **Account: the Administration panel fits the page**: one line a mode, in two columns, and what each mode does in a dialog ("What each
  mode does") or in a box's tooltip. It overflowed its frame.
- **Invulnerable, Invisible, Left alone and See hidden are kept for the next logins**: the server turned them on again at every login of an
  administrator character. No cooldowns and Fly anywhere still last until the character leaves.
- **Bots, Population: stop bot arrivals when the PC's RAM is full**, at the mark of your choice (90 % by default); bots come again 5 points
  under it. The "Population now" box shows the PC RAM in use.
- **A server setting is saved even while the server reads its file at that moment**: Windows refused to replace it, and the box stayed stuck.

---

## v0.3.0-beta.11 — 2026-11-14

**Offered by the launcher** if you have v0.3.0-beta.10: "Update" on the line at the top of the window. Otherwise install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.11.exe`.

**Minimum server: v0.1.0-beta.1.** The install from nothing needs server v0.1.0-beta.6; the administration panel, a server newer than
v0.1.0-beta.6 (it says so otherwise).

**What changes**
- **No terminal window when MySQL starts**: MySQL started a second process that opened its own console.
- **Notices lie over the page** ("Restart the servers…", update, server too old): they no longer push the home page's panels down, and a
  cross closes them.
- **Server settings**: the panel takes the whole window, its list scrolls inside, and the "Save" bar no longer hides any row.
- **Bots**: the "Bots in the world, last hour" curve is gone.
- **Account: an Administration panel for an administrator account**, beside the teleport, while the character is in game: Invulnerable,
  Invisible, Left alone, See hidden, No cooldowns, Fly anywhere, and whether the »Admin« tag shows. Each box does what the game master
  command typed in game does.

---

## v0.3.0-beta.10 — 2026-11-14

**Offered by the launcher** if you have v0.3.0-beta.9: "Update" on the line at the top of the window. Otherwise install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.10.exe`.

**Minimum server: v0.1.0-beta.1.** The install from nothing needs server v0.1.0-beta.6.

**What changes**
- **MySQL is no longer shown "Ready" while it is stopped**: after a failed stop, the MySQL row stayed green and its button said "Stop"
  instead of "Start", so a click stopped the MySQL just started, and a backup failed. Stopping a MySQL already stopped just says it is
  stopped.
- **"What's new" wraps**: the sentences of the notes were cut at the window's edge.
- **The quit window, with the servers running, is clearer**: three choices each shown with what it does, the clean stop set apart, and
  "Cancel" on its own.

---

## v0.3.0-beta.9 — 2026-11-14

**Offered by the launcher** if you have v0.3.0-beta.8: "Update" on the line at the top of the window. Otherwise install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.9.exe`.

**Minimum server: v0.1.0-beta.1.** The install from nothing needs server v0.1.0-beta.6.

**What changes**
- **No false failure on the first start**: the game server is no longer marked failed while it writes to its terminal (the first start
  prepares its maps and bots for long minutes). It is only after five minutes without a line.
- **A server error no longer breaks the home page**: the server's row keeps its place, with a "Why?" button that opens the problem and what
  the server wrote in a window, from which "Show the log" opens its terminal. A failure no longer opens the terminals by itself.
- **The server install fits on one line**: the explanations, the folder choice, the download steps, a failure and "Try again" are in a
  window.
- **The home page fills the window**: both columns end on the same line, and the "What's new" block keeps the same height on both tabs.
- **The bot population explained**: each mode says what it does under its name ("By the players", "Constant", "With a minimum"), the
  percent is greyed out when the mode does not use it, and "Population now" speaks of bots present and in reserve.
- **Uninstalling ends with a window** saying where the last backup of your accounts and characters is kept. The uninstall text is no longer
  cut.
- The options of the Installation window are evenly spaced.

---

## v0.3.0-beta.8 — 2026-11-14

**Offered by the launcher** if you have v0.3.0-beta.7: "Update" on the line at the top of the window. Otherwise install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.8.exe`.

**Minimum server: v0.1.0-beta.1.** The install from nothing needs server v0.1.0-beta.6 (beta.5's database does not start on a fresh
Windows).

**What changes**
- **Uninstall the server**: a server the launcher installed itself is uninstalled from the Installation window ("Change…" on the home page),
  and the launcher's uninstaller offers to remove it too. The servers are stopped, a backup of your accounts and characters is kept in
  `Documents\Echoes of Atreia\backups`, then the server's folder is deleted. A server you installed yourself is never offered, nor one
  installed by an earlier launcher.
- **No scroll bar in a small window**: when the window is smaller than its first size (a small screen, or Windows opening it a little
  smaller), the page shrinks with it.

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
