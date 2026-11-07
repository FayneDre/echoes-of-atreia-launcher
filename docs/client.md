# The game client: its check and its language

What the launcher checks in the client folder before Play, and how it chooses the language the game starts in
(`src/main/clientCheck.ts`, `src/main/client.ts`). Nothing in the client is written or changed.

## What the 4.8 client reads

- `bin64/aion.bin` takes `-lang:<code>` among `RUS CHS JPN CHT TRK PLK ESN ITA FRA DEU ENG ENU KOR` (the strings of `aion.bin` and
  `crysystem.dll`). For that code it reads the folder `L10N/<code>`, which holds `<code>.pak` (`L10N/enu/enu.pak`, `L10N/FRA/FRA.pak`)
  and `Data/Data.pak`, the game's texts, and the localized cutscenes and voices.
- `EN`, which the start scripts passed until now (`-lang:EN`), is not in that list: a tester's client holding the French pack alone showed
  Korean with it (launcher v0.3.0-beta.3). The launcher passes only a code of the list, for a pack it found complete.
- Not checked either: whether a pack of another build than 4.8 shows every text the 4.8 data asks for. Its files are there; what it holds
  is only seen in game.
- Windows is case-insensitive and the packs are not consistent (`data/data.pak` in the English one, `Data/Data.pak` in a French one): every
  name is compared in lower case.

## The check

- **Required**: `bin64/aion.bin`, `crysystem.dll`, `Cry3DEngine.dll`, `XRenderD3D9.dll` and the `Data` folder. Checked by name only: a damaged
  file is beyond what a launcher can tell. What is missing is listed in Installation and Play refuses (`client-incomplete`).
- **Packs**: every folder of `L10N` named after a known code. A pack is **complete** with its `<code>.pak` and its `Data/Data.pak`; only
  complete packs are offered. An incomplete one is named in Installation ("not offered") and never passed to the client.
- **Against the English pack** (`ENU`, else `ENG`), the files each other pack lacks are counted. A French pack taken from another build of
  the game lacks the 4.8 intro (`aion_4.8_intro.bik`) and two cutscene sound archives (`df5.pak`, `lf5.pak`): it starts, those cutscenes are
  silent or shown without their video. The count is a note, not a refusal.
- Run at each detection, by "Check" in Installation, and again at each Play: a pack may have gone since the start.

## The language

- Installation → **Game language**: a list of the complete packs, by their own names (Français, English (US), Deutsch…). The choice is
  saved (`settings.clientLanguage`).
- Not chosen yet, or chosen and no longer complete: the interface's language (French → `FRA`, English → `ENU` then `ENG`), else the first
  complete pack. No complete pack: Play refuses (`client-language-missing`).
- The client starts with `-ip:127.0.0.1 -port:<login client port> -loginex -lang:<code>`.

## Not done

- No pack is distributed or built by the launcher: where a French pack may come from is to be settled before anything is shipped (roadmap,
  client options, point 3).
- The game server's own language (the bots' chat) is a server option, on the Bots page, and does not follow this choice.
