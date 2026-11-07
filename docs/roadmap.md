# Roadmap: what is done and what is left, by theme

Rewritten on 7 November 2026 as one page by theme, in the same form as the server's own roadmap. The themes are in priority order; inside a theme,
**Done** says what works and where it is explained, **Left** is in the order to do it. Why the launcher works the way it does, and what kind of work
each feature needs (launcher only, a server setting that exists, server work first): [decisions.md](decisions.md).

Words used for a state: **validated** (checked by the tester on the real servers or database), **built, unverified** (the code and its tests are
there, nobody has checked it on a real install), **not started**. Published: v0.2.0 (stable, 5 November) and v0.3.0-beta.5 (7 November, with
server v0.1.0-beta.3).

## The themes at a glance

| # | Theme | Where it stands | First thing left |
|---|---|---|---|
| 1 | Play: servers and client | validated; the client's check and game language built 7 November | check in game that `-lang:FRA` starts French |
| 2 | Distribution and updates | installer and v0.2.0 validated; self-update and server bundles built, unverified | a tester's install going to a pre-release and back |
| 3 | Server settings | rates validated in game (premium, 7 November) | dungeon re-entry |
| 4 | Account and backups | validated (sign-in, characters, backup, restore) | check the teleport in game |
| 5 | Bots page | list validated; settings and curve built, unverified | check the bot settings in game |
| 6 | Desktop and window | published in v0.3.0-beta.4 and beta.5 | tests that fail under load |
| 7 | Look and sound | not started | an Elyos and an Asmodian theme |
| 8 | Client options | not started | several clients at once |
| 9 | Tools for the server | not started | a server dashboard |
| 10 | Playing together | not started, later | hosting for a friend |
| 11 | Linux | not started | after the rest |

## 1. Play: servers and client

**Done**: the server, the client and MySQL found; MySQL, chat, login and game started in order, each waiting for the one before; a clean stop (the
game server saves its players); servers left running taken over at the next start; the three terminals; the client launched on the login server's
port. Validated by the tester on the real servers on 4 November ([how-it-works.md](how-it-works.md)). Built on 7 November: the client's folder checked
before Play (engine files, language packs) and the game language chosen among the complete packs, passed as `-lang:<code>` instead of the start
scripts' `-lang:EN` ([client.md](client.md)).

**Left**:
1. **Check in game that `-lang:FRA` starts the client in French**, with every text there: the pack in use comes from another build than 4.8.
2. **Shipping a French pack** with the install: where it may come from is settled before anything is distributed.
3. **Pre-filling the account** in the client, if its command line takes one (an open question in [decisions.md](decisions.md)).
4. **A protected stop**: closing the launcher or Windows while the servers run offers the clean stop, never leaves them orphaned.

## 2. Distribution and updates

**Done**: the public installer and portable executable; v0.2.0 released (phases 1 to 5); patch notes in French and English shown as "What's new" after
an update; pre-releases on `develop` in both repositories (the server's release process plan, milestones 1 to 4). Built, unverified: the launcher
updating itself from GitHub (milestone 5), and a beta launcher installing the server's pre-releases from their bundle and manifest, with the SQL
updates and an undo (milestone 6, [server-update.md](server-update.md)).

**Left**:
1. **A tester's install going to a published pre-release and back**: verifies milestones 5 and 6 together.
2. **The first stable pair** (milestone 7): `develop` merged into `main` in both repositories once a pair is validated in game.
3. **Updates by difference**: only what changed downloaded, each replaced file backed up, the database and the person's files never touched.
4. **A first download that resumes and verifies**: tens of gigabytes in parts that survive a closed launcher, checked against the manifest.
5. **Check and repair the install** from the manifest: every file against its hash, what is missing or changed downloaded again.
6. **Back to the previous version**: the previous bundle kept, so a beta patch that breaks something is undone in one click.
7. **A first-launch assistant**: Java, MySQL, memory and disk space checked, what can be fixed fixed in one click.

## 3. Server settings

**Done**: every rate by family, the daily Glory Point loss rank by rank and both factions on one account, written to `mygs.properties` with "restart
required"; saved settings applied at once through the admin channel when the server runs (`reload-config`). Validated in game on 7 November: the
premium rates taking effect (server v0.1.0-beta.3 makes every player account premium).

**Left**:
1. **Dungeon re-entry** (`gameserver.instance.cooldown_rate`): a setting that already exists; for a player alone with bots it changes everything.
2. **The starting level** (1, or the level 10 Ascension) once the server has it (the server's `group-options-plan.md`).
3. **Skill learning**: postponed, its rules are still to be defined.

## 4. Account and backups

**Done**: sign-in with the account's password, several accounts, the characters and the one played with; a backup and a restore of the whole database
(validated on 4 November on the real database); the picked character teleported to any place of the server's list (built, unverified in game).

**Left**:
1. **Check the teleport in game.**
2. **Bring one of my characters into my group**: a button beside each character once the server has the command (`//bot alt`); planned in the game first.
3. **Automatic database backups**: at each clean stop or each day, kept in rotation, restored in one click.
4. **A character sheet**: level, class, time played, last login, and experience per day, from the database.
5. **Game accounts managed here**: created, password and membership, without touching the database.
6. **A backup per character**: later, if at all (one character is spread over dozens of tables).

## 5. Bots page

**Done**: the bots listed by faction from the database (validated); their settings (XP, PvP, chat and its language, the broker), from the server's bot
options, and the last hour of bots in the world as a curve (built, unverified in game).

**Left**:
1. **Check the bot settings in game** against a server that has their options.
2. **The density setting**: the mode as a list and the percent as a slider, bounded by what the server's memory work measures first (the server's
   living world plan, A3).
3. **A live world map, plain**: per map the bots awake and asleep, the players, the density; from an admin channel command (`world`) still to write.
4. **Population by region**, with the memory it is expected to take shown beside it: chosen by the person on 7 November as the setting to have.
5. **A companion bot called from here**: class and level chosen, it appears beside the character.

## 6. Desktop and window

**Done**, built on 6 and 7 November, published in v0.3.0-beta.4, and in beta.5 the page growing with a maximized or full
screen window and F11: the launcher's own icon; the taskbar's dot and progress; the icon in the notification area with
its menu; closing to the background, which now closes the window (73 MB less); starting the servers with the launcher, the launcher with Windows, a
desktop shortcut; the old logs and reports cleaned up to the recycle bin; the problem report; coloured terminals; drawing without the graphics card
(110 to 190 MB less); the same layout in every language as in French, checked by a test ([desktop.md](desktop.md), [home-page.md](home-page.md)).

**Left**:
1. **Tests that fail under load**: the news and client tests now have 90 s; a test that opens the launcher twice or starts the servers
   may still need the same when the whole suite runs with little memory free (the MySQL test failed so once on 7 November).
2. **A richer problem report**: the logs, the version, the character's position and a screenshot joined by themselves.
3. **The patch notes inside the launcher**, with a "new" badge after an update, and the beta or stable channel chosen in the options.
4. **A screenshot gallery** of the client's folder, each one shareable or joined to a report.

## 7. Look and sound

**Not started**, chosen on 7 November. **Left**:
1. **An Elyos and an Asmodian theme**, beside today's, chosen in the options (the colours are already tokens in `theme.css`).
2. **Background music**, quiet by default and cut in one click, paused while the client plays; where the tracks may come from is settled before
   anything is distributed, as for the French pack.
3. **Keyboard shortcuts** listed in the launcher, and **accessibility**: text size and contrast.

## 8. Client options

**Not started.** **Left**: 1. **several clients at once**, each on its own account, for testing groups and trades alone; 2. **the Vulkan renderer**,
optional (DXVK's Direct3D 9 DLL put beside the client or removed), switched only while every client is closed.

## 9. Tools for the server

**Not started.** **Left**:
1. **A server dashboard**: each server's state and a summary of the game server's log (errors, a log gone silent, bots in the world), the logic of the
   server's `check-server-log.ps1` rewritten here.
2. **GM tools**: planned in the game rather than here (the server's living world plan, lot H3); the launcher installs the interface addon and keeps it
   in step with the server, and takes the forms itself only if the client cannot open the server's pages.

## 10. Playing together

**Not started, later** (7 November). **Left**: 1. **hosting for a friend**: the address to give, the port checked from outside, the friend's client
configuration written; 2. **the players online**, live, with an announcement sent in game.

## 11. Linux

**Not started.** The servers run there; the client needs Wine. What the server's PowerShell tools do is rewritten in TypeScript here as the launcher needs it
([decisions.md](decisions.md)), which is also what Linux needs.
