# Release notes (English)

The English twin of [current.md](current.md): the same entries, headed by the same version tags, in the same order, written from the French
one in the same pass. Each entry names the lowest server version it works with ("Minimum server: ..."), and `tools/release.ps1` refuses a
release whose entry is missing from either file. When this file nears 200 lines, the oldest entries move to `<year>-<month>.en.md`.

---

## v0.3.0-beta.14 — 2026-11-16

**Offered by the launcher** if you have v0.3.0-beta.13: "Update" on the line at the top of the window. Otherwise, install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.14.exe`.

**Minimum server: v0.1.0-beta.1.** Installing from nothing needs server v0.1.0-beta.6; the administration panel, a server newer than
v0.1.0-beta.6; the PC RAM mark, server v0.1.0-beta.8.

**What changes**
- **Installing the server: this PC is checked before the download.** The folder, PowerShell (blocked or restricted by a company), the port
  listing; then MySQL and Java, started right after their download, before the 2 GB of the server and the maps. What blocks is said at once,
  instead of an install that hangs.
- **Installing the server: making the database says what it does**, line by line under the step, and writes it to `setup.log` in the
  server's folder. A "Report a problem" made during or after the install takes that log and MySQL's. After 15 minutes the install stops
  instead of waiting forever.
- **With no server installed**, only the home page opens, and the terminals do not show.
- **The terminals open over the home page**, without resizing its panels, and stay greyed out while every server is stopped.
- **No scroll bar**: the Bots page has two tabs, "Bot settings" and "Bot list"; each faction reads in pages ("Previous", "Next") of as many
  bots as the window holds; the daily loss of honour points is on two columns.
- **News**: the version you have is marked "installed".
- "1 bot", "1 file" in the singular; a setting's official value stays on one line.

---

## v0.3.0-beta.13 — 2026-11-15

**Offered by the launcher** if you have v0.3.0-beta.12: "Update" on the line at the top of the window. Otherwise, install it by hand with
`Echoes-of-Atreia-Setup-0.3.0-beta.13.exe`.

**Minimum server: v0.1.0-beta.1.** Installing from nothing needs server v0.1.0-beta.6; the administration panel, a server newer than
v0.1.0-beta.6; the PC RAM mark, server v0.1.0-beta.8.

**What changes**
- **No scroll bar on the home page while no server is installed**: beside the news, the "Install the server" panel pushed the page 15 pixels
  too far. Its sentence and its button are now on the same line.

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
