# Brief 001: Night 1 is Six Vaults. Give it your art.

Night 1 changed after your first revision. It is now **Six Vaults**. Four Wings is
shelved. The game logic, the screens and the host tools for Six Vaults are in this
folder and tested. They work, but they were not drawn by you and it shows.

Play it first: open `/?demo=hall&revealed=1`, open the menu, choose
"Preview: start Night 1". Walk to the shop (bottom of the hall) and buy a clue. Walk
to the arena (top of the hall) and open two vaults. Open the menu and choose
"Preview: end the night". The rules are in `README.md` under "Night 1: Six Vaults".

**Read the top section of `CHANGES.md` first.** The opening was rewritten on the GM's
instructions after this brief was written: an envelope screen, a new letter, new
words, two rooms closed, a picture briefing for Night 1. Those screens need your art
too: the envelope, the eight briefing pictures (`vbTiles` in `public/app.js`), the
ranked payout board, and the two painted-over doorways in the hall plate.

## What to build

1. **The arena's vault set.** `vaultSet()` in `public/world.js` draws six plain
   doors over the stage of your arena plate. Replace it with a set in your style:
   six numbered vault doors, 1 to 6, readable at phone size. Either paint a second
   plate or draw over the existing one. `DP_WORLD.setArena("vaults")` switches it on
   and `setArena("")` returns to the covered stage. Keep both, and keep the room's
   walkable area and its stage block where they are.
   On a 390 px wide phone the camera follows the player and Vaults 1 and 6 are cut
   off. All six should be visible when a player stands at the stage.
2. **The Night 1 screens.** Their styles are one block at the end of
   `public/app.css`, marked "the night's match: Six Vaults". Bring them in line with
   your pages. The screens are:
   - **Tonight** (menu, top item): rules, clock, this player's clues.
   - **The arena page**: the six vault buttons, the five Rock Paper Scissors throws,
     the "Open them?" confirmation, and the sealed state.
   - **The shop page**: one clue for 1 coin, then the bought clue.
   - **The result** (`vreveal`), four steps: a gate, the six vaults opened, the gold
     table with prizes, and who is out with each throw shown.
   - **Out**: the "Out" mark on a player's tile and card, and the grey figure in the
     rooms.
   A clue must look like a document the player was handed, and a clue from the shop
   must look different from the clue they were dealt.
3. **The shop's sign.** It reads Open during a match and Closed otherwise
   (`DP_WORLD.setShop`). Make the open shop look open, not only relabelled.
4. **Remove Four Wings from what players can reach**: `public/four-wings.html` and
   its row in the review gallery. Keep `DP_ART.fourWings` if you want, unused.

## Found while testing your revision. Please fix.

- On arriving in a room, the player's figure stands on top of the "Hall" exit sign
  and hides part of the word (puzzle room, betting room, broadcast room, gallery,
  dungeon).
- The hall's opening hint ("Tap the floor to walk...") runs into floor mark 13 on a
  1440 px wide screen.
- Already fixed in the merge, for your information: the "Sixteen people have a seat"
  picture was a speck at the left edge. See `CHANGES.md`.

## Do not change

- Anything in `src/`. The clue texts in `src/vaults.js` are exact: their wording
  decides how many clues a player needs.
- The numbers: 6 vaults, open 2, gold 10, 5 and 2, a clue costs 1 coin, prizes 5, 3
  and 1.
- A player's vault contents stay hidden until the night ends. Nothing on the sealed
  screen may hint at them.

## How it will be checked

`tests/browser/night1.mjs` and `tests/browser/preview_night.mjs` must pass unchanged,
on a phone-sized and a desktop-sized screen. Then the GM looks at your `review/`
captures of every state listed under 2.
