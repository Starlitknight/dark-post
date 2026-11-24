# Dark Post

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
