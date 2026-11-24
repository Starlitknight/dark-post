# Briefs

One file for each piece of work. The GM decides what gets built. A brief says what
to build, what must not change, and how it will be checked.

Rules that hold for every brief:

1. **The preview and the real game must behave the same.** Anything a player can do
   in `?demo=` mode must be backed by the server in `src/worker.js`. If a feature
   needs a new field or route, say so in `CHANGES.md` and add it to the server, or
   ask for it. (The first revision's "Change my agent" button worked only in the
   preview because the server never sent `canEditFace`.)
2. **Do not change the rules of a game** (`src/vaults.js`, `src/puzzles.js`, the
   numbers in `src/worker.js`) unless the brief says to.
3. **Words the GM has chosen stay as chosen**: coins, Player 1 to 16, Messages,
   Ask the GM, Notice board, Broadcast. New copy on a screen is welcome. Changes to
   the invitation or the rules text go in `CHANGES.md` under their own heading so
   the GM can accept or reverse them.
4. **Keep the hooks**: element ids, `data-act` names, the public functions of
   `DP_WORLD`, `DP_ART` and the avatar module, and room coordinates.
5. **Before handing back**, on a fresh local server (`rm -rf .wrangler/state`,
   `npx wrangler dev`): `python3 tests/test_flow.py`, `node tests/test_vaults.mjs`,
   `node tests/test_puzzles.mjs`, then `tests/browser/first_visit.mjs` and
   `tests/browser/night1.mjs` (each needs its own fresh server).
6. Hand back the whole folder, with `CHANGES.md` updated and a `review/` gallery of
   the screens the brief touched, at 390 x 844 and at 1440 x 900.
