# Dark Post: redraw the art and the UI

I'm attaching a working game called **Dark Post**. The rules, the server and the flow all work. The art and the interface are not good enough. I want you to redraw the game's art and redesign its UI and UX, on top of the code that exists, without changing how the game plays.

## What the game is

Dark Post is an invite-only elimination game in the spirit of *The Genius* and *The Devil's Plan*. I invite 16 strangers. Each gets a private link, accepts a letter, is given a number, and from then on is known only as Player 1 to Player 16. They play in a browser, mostly on phones, at different hours across time zones. I host as the GM.

Inside, each player is a small character who walks around a set of nine rooms, talks to the others in private or in public, earns and loses coins, and plays one match a night. The feeling I am after: **you are on the set of a survival show, in an escape room, with fifteen people you cannot trust.** Think *Among Us*, but on a game-show set instead of a spaceship.

## What is in the zip

- `public/` is the whole player-facing game. No framework and no build step: plain HTML, CSS and JavaScript.
  - `app.css`: every style in the game.
  - `world.js`: the nine rooms. Each room's art is an SVG built here, together with its size, where players can walk, its doors and the spots players use.
  - `avatar.js`: the characters. Portraits, full-body figures, the 24 ready-made characters and the parts they are built from.
  - `art.js`: the treasure bags, the big coin and the DARK ◆ POST wordmark.
  - `app.js`: the screens and the game logic on the player's side.
  - `host.html`, `host.js`, `host.css`: my console. Out of scope unless you have time left.
- `src/`: the server. **Do not change it.**
- `art-reference/`: 90 screenshots of everything as it is today.
  - `01` to `29`: the opening, in order, on a phone.
  - `30` to `62`: the hall, the menu, every page and every room, on a phone.
  - `63` to `76`: Night 1, from the rules to the reveal.
  - `full-room-*.jpg`: each room drawn whole.
  - `desktop-*.jpg`: what it looks like on a 1920 px screen.

To run it: `npm install`, then `npx wrangler dev`, then open `http://localhost:8787/?demo=letter`. That plays the whole thing from the invitation with nothing saved. `?demo=hall` jumps into the hall, `?demo=reveal` jumps to the night the bags open, and adding `&notype=1` skips the typed narration.

## What is wrong today

1. **The art has a ceiling.** Everything is flat vector drawn in code. The rooms have no depth, no real lighting and no sense of material. The characters are simple. It reads as a prototype.
2. **Desktop is broken in spirit.** The game was laid out as one phone-width column. On a laptop the rooms fill the screen, but the bar at the top, the menu, and every page stay about 430 px wide in the middle of a huge black screen. Everything feels small. See `desktop-*.jpg`.
3. **The UI is functional, not designed.** It is clear, but it has no craft: spacing, type scale, motion, and the way screens hand over to each other.

## The look I want

These are decided. Please keep them.

- **Pitch black, gold and white.** Colour is rare, so it hits when it appears. Each room has one accent colour, listed below.
- **Escape-room set, not a haunted house.** Concrete, steel, hazard stripes, crates, cables, stage lights, numbered floor marks. **No candles.** Nothing occult.
- **Rooms are full bleed** and intricately designed. Each should feel like a different place with its own furniture and purpose. **Only the hall has numbered circles on the floor.** The other rooms must not be circles on a floor.
- **Minimal text. One idea per screen.** Art and atmosphere come before words.
- **Narration is typed out like a Pokémon game**, at a medium pace, with **no box or border** around it. It sits on the art.
- **Clarity is of utmost importance.** A first-time player on a phone must never be confused about where they are, what is happening now, what happens next, or what they can tap.
- **The invitation is the one exception.** It is a typed letter in a case file (the "dossier" look), signed "S", and it must fit on one phone screen with Accept and Decline visible. Everything after the letter is the black and gold game.
- The two bags are **brown cloth treasure bags**. The currency is **coins**. Rules are signed **GM**. Private chats are called **Messages**.

## What to redraw

**1. The opening** (`01` to `29`). Letter, welcome, the number draw, "sixteen players", the coin, the two bags, the choice, the seal, choosing a character, the tour of the rooms. Keep the order and the words. Make each one a moment.

**2. The characters.** 24 ready-made characters, 12 men and 12 women, each cool and distinct. The men must read as clearly masculine (the first versions were too soft). Each character exists as a round portrait and as a full-body figure with the player's number on the chest. Players can change hair, colours, face, build and clothes, so characters are assembled from parts. Also needed: a black silhouette for a player who has not arrived, and the GM's mark.

**3. The nine rooms.** Sizes are in game units and should stay the same.

| Room | Size | Accent | Must contain |
|---|---|---|---|
| The hall | 1800 × 1500 | white | Numbered floor marks 1 to 16, the two bags on a vault in the middle, a wall clock, and eight exits: arena (north), puzzle room and betting room (west), broadcast room and gallery (east), dungeon stairs down, shop, observatory stairs up (south) |
| The arena | 1500 × 1300 | gold | A stage and stands. The set on the stage changes every night with the match: dust sheets when nothing is on, six vault doors on Night 1 |
| Puzzle room | 1300 × 1000 | violet `#A98BEA` | A terminal where the daily puzzle is opened |
| Betting room | 1300 × 1000 | green `#4FBF7A` | Tables for two, and a board showing the payoffs of a deal |
| Broadcast room | 1300 × 1000 | red `#E5544B` | An ON AIR sign, a desk with a microphone, a camera |
| Observatory | 1300 × 1000 | blue `#6C9BF2` | A telescope and the night sky. Upstairs |
| Dungeon | 1500 × 1000 | amber `#E0893C` | Three barred cells players can walk into, a corridor, a desk with the door log. Downstairs |
| Gallery | 1300 × 1000 | rose `#E9A3B4` | Sixteen framed portraits, one per player |
| The shop | 1300 × 1000 | teal `#35C2B0` | A counter behind a shutter. It opens on match nights and sells clues |

Players' figures stand and walk in these rooms and are sorted by depth, so the floor must read as a floor seen from above and in front.

**4. The interface.** The bar at the top (player number, coins, which room), the NOW / NEXT strip with its countdown, the MENU button, the menu sheet (six pages and nine rooms), and every page: Messages, Ask the GM, Notice board, Broadcasts, Players and the player card, How to play, the puzzle, a deal, the door log, a cell, the sky, the shop. Also buttons, inputs, message rows, the broadcast banner and the small pop-up notices.

**5. A real desktop layout.** On wide screens, use the space: bigger type, and pages that sit beside the room instead of replacing it. The phone layout stays the main one.

**6. Night 1: Six Vaults.** This is built and working in plain styling. Screenshots `63` to `76` show it.

- The arena's set is **six vault doors in a row, numbered 1 to 6**. Three are empty and three hold 10, 5 and 2 gold. Players open two.
- A **clue card**: one true sentence about the vaults, such as "Exactly one of Vault 1 and Vault 5 is empty." Each player is dealt one, and can buy a second in the shop. The bought one should look different from the dealt one.
- **Choosing two vaults**: six doors to tap, two can be chosen, then a button to open them. It is final.
- **Five Rock Paper Scissors throws**, sealed with the vaults in case of a tie for last. Each needs a clear rock, paper and scissors symbol.
- **The reveal**, in four beats: the night is over; the six vaults open and show what they held, with this player's two marked; the gold and the coin prizes; then who is out, with the Rock Paper Scissors throws played one at a time if there was a tie. "You are out" is the hardest screen in the game. It should land.
- **A player who is out**: their figure and portrait turn grey, and their star in the observatory goes dark.

## Rules you must not break

More nights are being written into `app.js` and `src/` while you work, so our changes have to merge.

1. **Put your work in `app.css`, `world.js`, `avatar.js` and `art.js`.** Avoid editing `app.js`. If you must change markup in it, list every change.
2. **Do not touch `src/`,** the rules, the numbers or the wording. If you think a line of text is unclear, list it and suggest a replacement.
3. **Keep every hook.** Every `id`, `data-act`, `data-scene`, `data-id` and `data-n` in the markup is used by the logic and by the tests. Restyle them freely. Do not rename or remove them.
4. **Keep the functions the game calls,** with the same names and the same inputs: in `world.js` `ROOMS`, `CELLS`, `svg`, `setArena` (which switches the arena's set: `""` for dust sheets, `"vaults"` for Night 1), `lightSVG`, `overlays`, `walkable`, `nearest`, `findPath`, `marker`, `doorAt`, `doorTo`, `spotAt`; in `avatar.js` `draw`, `sprite`, `shadow`, `silhouette`, `gm`, `clean`, `random`, `PRESETS`, `LIMITS` and the colour lists; in `art.js` `bag`, `bigCoin`, `wordmark`.
5. **If you move anything in a room, move its geometry too.** Each room in `world.js` lists where players can walk, where each door is and where each usable spot is. The art and those numbers must agree, or players will walk through walls. The three dungeon cells are also checked by the server, so keep their rectangles where they are.
6. **Keep the number of options for each character part,** or tell me the new counts. The server refuses a character whose parts fall outside the counts in `LIMITS` at the top of `avatar.js`.
7. **No frameworks, no build step, no outside requests.** Fonts are bundled (Barlow Condensed, Bodoni Moda, Manrope, Courier Prime). Painted or rendered images are welcome for room backgrounds and characters: export WebP or PNG at twice the room's size, keep each under about 400 KB, and put them in `public/`.
8. **It has to run on a mid-range phone.** Keep animation light. Tap targets at least 44 px. No text under 12 px.

## What to send back

1. The same folder, changed, that still runs with `npx wrangler dev`.
2. `CHANGES.md`: what you changed, any markup you had to touch in `app.js`, and any wording you suggest.
3. One whole image of each room, and phone and desktop screenshots of every screen, so I can review without running it.

## Order of work

1. The hall and the characters. If these two are right, the rest follows.
2. The interface kit and the desktop layout.
3. The other eight rooms.
4. The opening.
5. Night 1.

Show me the hall and four characters first, before doing the rest.
