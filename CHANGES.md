# Dark Post

## Six keys, who is online, no puzzle shortcut, 25 Nov 2026 (the GM's instructions, done outside this agent)

- **A new kind of puzzle, the six keys** (`keys` in `src/puzzles.js`): six numbered keys, five to seven clues about the order they are used in, exactly one order fits, and no clue is spare. The answer is the six numbers in order. `keyClueFits` and `keyClueText` are exported for the tests.
- **The plain arithmetic kinds are retired.** `TYPES` is now `["code", "keys", "cipher"]`. `sums` and `sequence` stay in the file but are not in the rotation. The GM found them too easy.
- **The second puzzle was replaced while in play**, quietly. A one-time rule in the constructor hands back tries spent on the old one. `no` in the puzzle view is now a mark of the puzzle's content (`puzzleMark`), so an answer from a page still showing a replaced puzzle is refused without spending a try. `day` carries the puzzle's day.
- A keys puzzle also carries `terms: []` and the full clues in `ask`. That is only so a page loaded before this kind existed still shows something. The game shows `data.ask` and `data.lines`.
- **The puzzle cannot be opened from the bell or the pop-up.** The to-do row says "Walk to the puzzle room to solve it." and has no button (`walk` in `todoList`).
- **Who is online**: a count in the top bar (`#top-online`, `drawOnline`), a list in the overlay (`onlineHTML`, with each player's room and a Message button), and a green dot on the Players and Messages pages. No server change: it uses the presence the game already had (`hall.online` and the live `on`/`off` messages). The overlay now holds three panels (`OPENERS`, `panelHTML`, `redrawMenu`).

## Holding the puzzle, 24 Nov 2026, late (the GM's instructions, done outside this agent)

- **The puzzle has its own day** (`puzzleDay` in `src/worker.js`), separate from the calendar day that deals use. While the GM holds it (`puzzle_hold` = "1", `puzzle_held_day`), it does not change at midnight EST. Released, it changes at each midnight from wherever it was (`puzzle_lag`), so the kinds still take turns in order.
- **`POST /api/host/puzzle`**: `{hold: true}`, `{hold: false}` or `{next: true}` (one puzzle forward, now). The console has the switch and the button at the top of Rooms.
- **A game that already had players when this code first ran starts held.** That is a one-time rule in the constructor, because the GM asked that the first puzzle stays until he says so. A new game starts with the daily change.
- Players see "Next puzzle: TBD" on the puzzle page while it is held (`held` and `resetAt: 0` in the puzzle view).
- An answer carries the number of the puzzle it was for (`no`). If the puzzle has changed under the page, the answer is refused without spending a try and the new puzzle is shown.

## The bell, 24 Nov 2026, night (the GM's instructions, done outside this agent)

- **A solved puzzle is news for every other player.** `puzzleAnswer` in `src/worker.js` writes a row to the new `notices` table. `hall()` sends the last thirty (`notices`, newest first, never the player's own), how far the player has read (`noticeMark`, kept in `reads` under the key `notices`) and the player's own standing on today's puzzle (`puzzle`). `POST /api/notices/seen` moves the mark. Removing or resetting a player deletes the news about them.
- **The bell** sits beside Menu in the hall (`#bell-btn`). It opens in the same overlay as the menu (`setMenu(true, "bell")`, `bellHTML` in `public/app.js`): "To do now" (`todoList`: tonight's match, today's puzzle, unread messages, GM notices, broadcasts, deals, each with a button that goes there) and "News". The number on the bell is the things to do plus the unread news.
- **A pop-up** (`showNotice`, `#note`) names the solver when the news arrives, and once for a player who arrives later. Players who can still solve today's puzzle are told "You haven't yet. Try it now." and a tap opens the puzzle. On pages other than the hall it is a plain line of text. It waits while the first-visit question, the narrator's line or a panel is on screen.
- These are notifications inside the game. Nothing is sent to a phone when the game is closed.
- Styles are at the end of `public/play.css`. In the preview, `DP_PREVIEW.solve()` makes another player solve.

## The wall board, 24 Nov 2026, night (the GM's instructions, done outside this agent)

- **The board on the hall's back wall says what is happening now** before the bags open: "Current / Player onboarding" (`drawStatus` in `public/app.js`, `.world-clock b.words` in `public/app.css`). After the bags open it goes back to "Next" and a countdown.
- **No countdown to the bag reveal unless the bags open by themselves.** `hall()` in `src/worker.js` now sends `autoOpen`. With it off, the GM opens the bags by hand, so players see "Next: Bag choice reveal, TBD" (`nowNext`). With it on, they see the countdown to the opening time.
- **The number on a figure's chest is mirrored back with an SVG attribute** (`setWalking`), not CSS. Safari on iPhone drew the CSS mirror of SVG text beside the figure when it faced left. Do not put `transform-box` or a CSS `transform` on `.sprite .num` again.
- The phone top bar has room under the clock.

## Play or resign, 24 Nov 2026, night (the GM's instructions, done outside this agent)

- **The first time a player stands in the hall they are asked once**: "Will you play?" with "Confirm. I'll play." and "Resign my spot and spectate instead" (`drawCommit` in `public/app.js`, `commit` in `src/worker.js`, `needsCommit` on the hall). Resigning asks once more before it is final.
- **A resigned player is a spectator**: `out` is -1. They keep their figure, greyed, and can walk and read; they cannot message players, broadcast, solve or play. They take no bag money and are left out of the Bag 2 split.
- The console marks each player Confirmed, Not confirmed yet, or Resigned. Removing a resigned invitation frees the place and the number.

## One address and a word for each player, 24 Nov 2026, night (the GM's instructions, done outside this agent)

- **Personal links are gone.** Everyone opens the same address. The front page (`none` scene) asks for the player's word: five random letters, made by the server (`newWord`, `claim` in `src/worker.js`). A right word sets the seat cookie on that device.
- `/i/<token>` now only redirects to the front page and sets nothing.
- **Guess limits**: five wrong words from one address lock that address for fifteen minutes; forty wrong words from everywhere in one hour shut the door for the rest of that hour. The console shows the count.
- **The console** lists each player's word, copies a ready invitation (address plus word), and can give a player a new word, which also signs them out everywhere.
- `/?switch=1` shows the front page on a device that already holds a seat. `/?demo=word` previews the front page.
- Existing invitations were each given a word when this version started.

## One puzzle for all, result screens, game clock, 24 Nov 2026, night (the GM's instructions, done outside this agent)

- **Every player gets the same puzzle each day.** The kinds take turns from the first day: code, sums, cipher, sequence (`puzzleFor` in `src/worker.js`). One puzzle a day, three tries; the server refuses anything more.
- **The game's day runs midnight to midnight EST** (`GAME_DAY_STARTS_UTC_MS`), no longer from the bag-opening time of day.
- **Puzzle solved / Puzzle failed** screens (`pzResult` in `public/app.js`, styles at the end of `app.css`). The coin is in the balance at once.
- **A game clock on Eastern time** sits at the top right of the room view (`#top-clock`, `gameTime`).
- **The status ribbon** reads Current / Next: "Player onboarding", then "Bag choice reveal" with a countdown, or TBD when no time is set.
- **The live board shows all sixteen places**: faces for players in the house (faded when away), silhouettes on the hall's marks for places not yet taken.

## Live board and hardening, 24 Nov 2026, night (done outside this agent)

- **The GM's live board** is the first panel of the host console: every room from above with each player's face where they stand, gold ring if connected. Data comes from `/api/host/activity` (`board`), host only. `host.html` now loads `world.js` for the room sizes.
- **Security headers**: a Content-Security-Policy that allows scripts only from the site itself, plus no-sniff, no-frame and no-referrer. In `public/_headers` for static files and `SECURITY_HEADERS` in `src/worker.js` for invitation links. **No inline `<script>` and no `on...=` attributes may be added to any page**: they will not run.
- **Wrong passphrases lock out the address they came from** for fifteen minutes after five tries, not the whole console.
- **The preview's vault contents and clues are sample data** and differ from the real ones. The real vault contents were in `public/app.js` as preview data before this change. Never put real answers in anything under `public/`.

## House staff and closed rooms, 24 Nov 2026, evening (the GM's instructions, done outside this agent)

- **House staff** stand in four rooms: a dealer (betting room), an attendant (puzzle room), an attendant (arena) and a shopkeeper (shop). Same avatar art as players, but no number, an ivory name plate, and they never move (`STAFF`, `staffHTML` in `public/app.js`). They speak in a card at the bottom of the screen when a player walks in, and again when tapped.
- **The arena, the shop and the betting room are closed.** No floor mark, no action button; the member of staff says why (`roomOpen`). The arena and shop open by themselves when a night is running. The betting room opens only when the GM ticks the box in the console (`bettingOpen` in `src/worker.js`; the server refuses deals while it is shut).
- **The puzzle attendant** says whether today's puzzle is done and offers it if not.
- **Night 1 is shelved while its art is redrawn.** Its panel in the host console is hidden; `/host?night=1` shows it. Nothing on the player's side names Night 1: the round after the bags is "The first game" until the GM names it.
- **The code puzzle says in words how close each guess was** ("1 digit is right and in the right place") in place of two numbered circles.
- **The preview's host moves left the player's menu.** `window.DP_PREVIEW.openBags()`, `.betting(true)`, `.startNight()` and `.endNight()` do them in preview mode. Real players never had these controls.

## Opening pictures, 24 Nov 2026, later (the GM's instructions, done outside this agent)

- **The number draw is the ring again**: sixteen numbered discs with one large number in the middle that runs with the light and lands on the player's number. The badge picture is no longer used.
- **The sixteen players are silhouettes again** (hatted figures in two rows). Yours turns gold, five fade for elimination, then only yours is left. The card-file picture and the door picture are no longer used.
- "Mr. Crane has set multiple tests" has its own picture: a card with a question mark and a clock, in bold gold line. The identity line shows a ring of sixteen around a question mark.
- **Every opening picture is larger**: `--brief-art` is raised, the envelope is drawn closer in, coin and bags take more of the width. The rules are at the end of `briefing.css`.
- `briefs/002-night1-assets.md` asks the art agent for Night 1 picture files.

## Opening rewrite, 24 Nov 2026 (the GM's instructions, done outside this agent)

- **An unopened envelope is the first screen.** A tap opens the letter (`envelope` scene, styles at the end of `briefing.css`).
- **New letter**: A. Crane's will, signed "—GM". It is the default in `src/worker.js` and `public/shared.js`; both earlier stock letters map to it.
- **The door screen after Accept is gone.** Accept goes straight to the welcome.
- New words: the identity line, the Crane tests after the number draw, "take" a bag (not "seal"), "disguise" (not "agent"), and "Welcome to the Crane Estate" before the tour.
- **Bag 2's slider is gone.** Two lines explain it.
- **The observatory and the dungeon are closed.** The hall has six doors. Their two doorways in the hall plate are painted over in `world.js` (`hallWall`). The rooms' code and the server's routes are still there, unreachable.
- **The now/next ribbon hides after three seconds** and comes back when the state changes. The menu always shows it.
- The preview has no sample messages, broadcasts or notices.
- **The bags open in order**: Bag 1 and its takers, then Bag 2 and its takers, then your coins, then a board of every player's face ranked from most coins to fewest (`takenHTML`, `payoutsHTML`).
- **Night 1 is explained in eight pictures** (`vbrief` scene, `vbTiles`). The Tonight page shows the clock and the clue first, the same pictures small below.
- **Messages and puzzle answers no longer use a form**, so they send inside a sandboxed frame. Send works by button and by Enter.
- The host console no longer shows the dungeon.
- `public/four-wings.html` is removed: it was a sample of the shelved match and players could have opened it on the live site.

## Merge, 24 Nov 2026 (done outside this agent)

This revision's `public/` was merged with the Night 1 work built in parallel. What was added on top of it:

- **Night 1 is Six Vaults, not Four Wings.** `src/vaults.js` holds the rules. `src/worker.js` runs the night: `/api/night`, `/api/night/buy`, `/api/night/open`, `/api/night/seen`, and the host's start, end and reset. Players can be eliminated (`out`).
- `public/app.js`: the `tonight` and `vreveal` scenes, the arena and shop pages for a match night, the match on top of the menu, the clock's night state, "Out" on cards, tiles, figures and stars, and the preview's Night 1 (`Preview: start Night 1`, `Preview: end the night` in the menu). Search for `Six Vaults`.
- `public/world.js`: `setArena(kind)` and `setShop(open)`. `vaultSet()` draws six placeholder doors over the stage. The shop's sign reads Open during a match.
- `public/app.css`: the Night 1 styles are one block at the end of the file.
- `public/host.html`, `public/host.js`, `public/host.css`: the Night 1 panel, the Rooms panel, the coin tool and the send-home button. The invitation editor keeps this revision's `displayLetter` and `briefing.css`.
- The server now sends `canEditFace` with the hall, so "Change my agent" works in the real game and not only in the preview. It is false once the bags open.
- Fixed: the "Sixteen people have a seat in the house" picture rendered as a speck at the left edge (it is also that way in `review/phone/07-sixteen-end.jpg`). `.crowd` was still an eight-column grid. One rule in `public/briefing.css` gives the picture the whole slot.
- `window.DP_PREVIEW = { go, enter }` exists in preview mode only, for review scripts.
- `review/` was left out of the merged folder. It shows Four Wings as Night 1 and predates the merge.

All 203 server checks, the vault and puzzle checks, and three browser walkthroughs (`tests/browser/`) pass on the merged folder.

## Play and review

Run `npm install` followed by `npx wrangler dev`. Open the local address printed by Wrangler. Private invitation links and the GM console at `/host` use the included multiplayer server. The hosted web preview runs the built-in simulation.

| Open | Experience |
| --- | --- |
| `/?demo=letter` | Accept the invitation, draw a number, choose a bag and agent, and tour the house. |
| `/?demo=hall` | Walk the house, open the six menu pages and play a daily puzzle. |
| `/?demo=reveal` | Open the bags, learn your payout and view the ledger. |
| `/?demo=hall&revealed=1` | Open the menu and choose "Preview: start Night 1" to play Six Vaults. |
| `review/index.html` | Browse the nine whole rooms, all agents and 135 paired screen states offline. |
| `art-reference/` | Reference images from the original project. |

## What changed in this revision

- A single ivory letter sits on a dark background. The new letter is addressed to the guest, explains the commitment and stakes, and is signed Gamemaster S. The response deadline and opening time sit beside a prominent gold Accept button. The paper can scroll independently when the GM writes a longer letter.
- The seven-part opening uses a matching set of illustrated spy props. A numbered field badge reveals your identity. A watch, a case file, two cloth bags and a brass coin explain play. The letter, briefing, room tour and rules use new, shorter copy.
- Each of the 24 agents has an original portrait and matching walking figure. All original appearance selections and saved characters work. Before the bags open, a player can change their agent from their own player card.
- The nine rooms have new 2× art with open floors, clear doorway signs and one central activity. All plates are below 150,000 bytes each. Each doorway and its sign identify the exit in the same coordinate system as the walkable ground. The three dungeon cells remain aligned with the server rectangles.
- The menu contains Messages, Ask the GM, Players, Broadcast, Standings and How to play, in that order. GM notices are available inside Broadcast. The Standings page respects the GM's decision about publishing other players' balances and gives tied totals the same rank.
- The HUD, menu and page headers show your balance. A solved puzzle counts immediately. The bag payout stays secret until the bags open. At reveal, the displayed balance combines it with the amount already earned.
- Click or tap the floor, or use arrow keys or WASD to walk. Crossing a door enters the adjoining room. A tap on a sign walks to that actual door. Scenes use a short opacity change, the camera starts already positioned, and adjacent room art begins loading as you approach. There is no destination ripple.
- Artwork, captions and action buttons occupy fixed slots during the briefing. The narrator lays out the whole line once and reveals its characters in place. A visible Continue button can finish a line early. Reduced-motion users receive the full line immediately.

## Files and integration

| Files | Scope |
| --- | --- |
| `public/app.js` | New opening art, action controls and copy, immediate scene mounting, fixed-width narration, the six-item menu, the Standings page, personal wallet and physical room travel. Menu travel, its automated routes and the walking ripple were removed. |
| `public/shared.js` | Invitation template and markup, localized times, and a per-field mapping from former stock defaults. The GM's custom text is retained. |
| `public/avatar.js` | Original modular spies, portraits, full-body walking art, vacant seats and GM mark. Existing part counts, palette values, preset mappings and public function signatures are preserved. |
| `public/art.js`, `public/art/` | Revised letter and briefing art, bags, coins, Four Wings pieces, room plates and local backgrounds. |
| `public/world.js` | Set illustrations, architectural signs and the side-by-side desktop room view, including Standings. Existing walk bounds, obstacles, doors, interactions and game-coordinate values are retained. |
| `public/index.html`, `public/app.css`, `public/briefing.css`, `public/play.css` | Typography, paper, art slots, six-item menu, coin chips, room layouts, focus states and motion. |
| `public/host.js`, `public/host.html` | The editable invitation and its preview use the updated default. |
| `public/card.png`, `public/favicon.svg` | Link-preview invitation and folded-bird mark. |

The Four Wings route uses a sample house, clues and outcomes. The artwork and interface accept match data through `DP_ART.fourWings`. The main game's original Cloudflare server, gameplay rules, stakes, scoring and invitation APIs are preserved.

## Verification

All 166 original multiplayer server checks passed against a fresh local season. All 640 generated puzzle cases passed. Interface regressions cover all eight exits in both directions by floor tap, physical sign tap and keyboard. They also cover the six menu destinations, live wallet updates, coin privacy, shared ranks, banked puzzle coins and delayed room art.

The invitation and the animated welcome and number draw were measured at 320 × 568, 390 × 844, 768 × 1024 and 1920 × 1080. Both invitation decisions fit at every size. Artwork, caption and action slots shifted by zero measured pixels across the welcome and draw. The downloadable gallery includes one 390 × 844 and one 1920 × 1080 browser capture for each of its 135 states.
