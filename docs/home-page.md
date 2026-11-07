# The home page and what it reads

What is true of the code today: what the home page shows, where each piece comes from, and why it believes it.

## The banner

`src/renderer/src/components/HomeHero.tsx`. One phrase for where the stack stands (stopped, starting with how many servers are ready,
ready with the time since, stopping, a server failed), the Start, Stop and Play buttons, the problem of the last action, and four facts:

- **Character**: the one played on the active account (Account page).
- **Bots in the world**, per faction: the `players` rows of the bot accounts flagged online. **Only while the game server is ready**: the
  flag stays set after a crash or a kill, so a stopped server shows a dash rather than what its last run left behind. The Account page
  follows the same rule for the person's own characters.
- **Game server memory**: the working set of its JVM, from `tasklist /FO CSV` for the process the launcher started or took over
  (`src/main/system/memory.ts`).
- **Last backup**, with a button that makes one now; the result comes as a toast.

The time since ready is `readyAt`, set by the main process when the game server becomes ready (not for one found already running, whose
start is unknown) and removed on any other status. The facts are read again every minute while the page shows, and on each change of the
game server's status or of the activity (`home:get-info`, `useHomeInfo`).

## The news

`src/main/news.ts`. The GitHub releases of the launcher and of the server, four of each, newest first, in two tabs. A release's text is its
`notes.<language>.md` asset in the person's language (English as the fallback), else the body above its `<details>` block. Read at start
and every four hours; a source that cannot be read is left out, and the panel says so when neither could be. The tests point it at a local feed (`ECHOES_NEWS_FEED`, `/launcher.json`
and `/server.json`).

A tab shows its newest release alone, with its summary (the first paragraph of its notes, above their headings and lists, cut to
four lines, and the room of four kept when it is shorter or missing), so the panel keeps its height from one tab to the other and however many releases come out and the home page's columns end together. "Read the notes"
opens the whole notes in a dialog (a native `<dialog>`: Escape, its button or a click beside it closes it); "Previous versions (n)"
opens the same dialog on the release before, with every release of the tab listed on its left.

**GitHub's 60 questions an hour.** Without an account, GitHub's API answers 60 questions an hour to an address, then refuses until the
hour is over; the launcher asks 3 at each start (the two news listings and the server's releases) and every four hours. `github/cachedJson.ts`
keeps each answer in the profile folder (`github-cache/`): younger than ten minutes it is used without asking, so relaunching costs
nothing; older, the question carries its ETag, which spares the download when nothing changed (a 304 still counts without an account:
checked on GitHub on 2026-11-07); refused, the kept answer is shown instead of an error. The server version panel reads its releases the
same way. Tests set the ten minutes with `ECHOES_GITHUB_FRESH_MS`.

A tab shows a "new" badge until it has been opened with that release at its top; what was seen is kept in the renderer's local storage
(`news-seen`), a convenience only: losing it only shows the badge again.

## The rest of the page

- **Servers**: one row each, with its own Start or Restart (see [how-it-works.md](how-it-works.md), "One server alone").
- **Installation**: one line of checks, whatever passes or fails, with "Change…" ("Fix…" while something is missing); the folders and
  Java are in a dialog that line opens, so nothing on the page moves.
  Below the line, in the room it leaves (the block keeps its height): the free space of the server's drive (`statfs`, red under 5 GB,
  since a server update downloads close to 2 GB), the backups kept and their size (a link to the Backups page), and the game server's
  database size with MySQL's version (`information_schema`, asked only while MySQL answers).
- **Server version** ([server-update.md](server-update.md)) sits above the news, so both columns fit the default window (1180×780).
- **Terminals**: the drawer at the foot, with a search, an "errors only" filter (ERROR and WARN lines, exceptions and their causes) and a
  copy of what the filter shows.
- **The footer** gives the launcher's version and the server's, as the server answers it or as the install's manifest says.

## The window

The system title bar is replaced by a themed one (`titleBarStyle: 'hidden'` with a `titleBarOverlay` in the theme's colours) that holds
the title and the tagline: Windows still draws the minimise, maximise and close buttons over its right end, and the bar is the drag area.
Below it, one row of one height: the character played, the pages, the languages. Nothing in either wraps down to the minimum width (960). A short message after an action
(saved, backup made) is a toast in a corner for four seconds; the same message again replaces the one shown.

Every page is as wide as the home page (at most 1280 px, the same margins), the scrollbar's place kept on the right only.
