# Brief 002: art assets for Night 1 (Six Vaults)

You are making picture files only. Do not change any code, CSS or HTML. The
programmer will wire the files in. Hand back a zip that keeps the paths below, plus
one contact sheet (`night1-contact-sheet.png`) showing every asset on the game's
dark background.

## The game, in one paragraph

Dark Post is set in the Crane Estate. A. Crane has died and left his fortune to
whichever of sixteen anonymous players passes his tests. Night 1 is Six Vaults: six
numbered vaults, three empty, three holding 10, 5 and 2 gold. Each player holds one
true clue, can buy one more in the shop for 1 coin, and can trade clues with other
players, who may lie. Each player opens two vaults. The least gold is eliminated.
The three highest amounts win 5, 3 and 1 coins. Gold and coins are different things:
gold only counts tonight, coins last the whole game.

## Style

Match your own rooms and props already in `public/art/`: the same painted finish,
dark teal and charcoal surroundings, brass and aged-gold metal, ivory paper, soft
light from the upper left, soft contact shadows. Old money, private bank, 1930s.
Bold shapes that read at phone size. Crane's monogram is a serif "C" and may appear
on metal and wax. No other words or letters in any picture unless listed below.
The gamemaster dislikes small, timid pictures: fill the frame.

**Gold must not look like the game's coin.** Coins are the brass coin with the bird
you already drew. Gold is ingots: stamped bars.

## Files

All WebP. Sprites and pictures have transparent backgrounds. Room plates are opaque.

### A. Room plates (same camera, size and geometry as the existing plate)

| Path | Size | What |
| --- | --- | --- |
| `public/art/rooms/arena-vaults.webp` | 3000 x 2600 | The arena as in `arena.webp`, but the dust-sheeted set on the stage is replaced by a vault wall with six closed vault doors numbered 1 to 6. Under 150 KB. |
| `public/art/rooms/shop-open.webp` | 2600 x 2000 | The shop as in `shop.webp`, open for business: shutter up, a lamp on, sealed clue envelopes on the counter. Leave the sign plate blank; the game writes on it. Under 150 KB. |
| `public/art/rooms/hall.webp` | 3600 x 3000 | The hall as now, with the left and right doorways in the bottom wall removed (plain wall). Keep the middle bottom doorway and everything else exactly where it is. Under 150 KB. |

Arena geometry, in plate pixels: the stage occupies x 780 to 2220, y 940 to 1732.
Nothing new may cover the floor outside that box, because players walk there.
A phone shows only about 880 plate pixels across, centred on x 1500. **All six doors
must sit inside x 1080 to 1920**, so a phone shows them all at once. Two rows of
three (1 2 3 above 4 5 6) is preferred. The numerals must be readable when the plate
is shown at 40% size.

### B. Vault sprites (the buttons players press, and the reveal)

Each 480 x 600, the same door seen straight on. Leave a blank brass number plate at
the top centre, about 150 x 110, with nothing on it: the game writes the number.

| Path | What |
| --- | --- |
| `public/art/night1/vault-closed.webp` | Closed and locked. |
| `public/art/night1/vault-open-empty.webp` | Door swung open, dark and empty inside. |
| `public/art/night1/vault-open-2.webp` | Open, a small stack of gold bars. |
| `public/art/night1/vault-open-5.webp` | Open, a medium stack. |
| `public/art/night1/vault-open-10.webp` | Open, a large gleaming stack. |

The three stacks must be obviously different in size at a glance, at 100 px wide.

### C. Small pieces

| Path | Size | What |
| --- | --- | --- |
| `public/art/night1/gold.webp` | 256 x 256 | One gold bar, the icon for "gold" next to a number. |
| `public/art/night1/rock.webp`, `paper.webp`, `scissors.webp` | 256 x 256 each | A gloved hand throwing each. Same glove, same angle. |
| `public/art/night1/clue-dealt.webp` | 1200 x 520 | A typed card on ivory stock with a brass paper clip and a small wax "C". The middle 1000 x 300 must be blank and flat: the game types the clue there. |
| `public/art/night1/clue-shop.webp` | 1200 x 520 | A different object from the dealt clue: a teal-edged shop slip or tag, as if bought over a counter. Same blank middle. |
| `public/art/night1/stamp-out.webp` | 720 x 300 | A red rubber stamp impression reading OUT, slightly rotated. |
| `public/art/night1/out-car.webp` | 1080 x 600 | A dark car waiting at the estate gate at dusk, rear door open. Shown to the player who is eliminated. |

### D. The briefing: eight pictures, one idea each

Each 1080 x 600. These explain the match the way a game show does: the player
should understand the picture before reading the caption under it. No words in the
pictures. Numerals only where listed.

| Path | The idea | In the picture |
| --- | --- | --- |
| `public/art/night1/brief-1.webp` | Six vaults. | Six closed doors numbered 1 to 6. |
| `brief-2.webp` | Three are empty. Three hold 10, 5 and 2 gold. | Three open empty vaults beside three open vaults with stacks marked 10, 5 and 2. No door numbers: nobody knows which is which. |
| `brief-3.webp` | Open any two. | A gloved hand on one handle, a second door already ajar, four untouched. No door numbers. |
| `brief-4.webp` | You hold one true clue. | The dealt clue card held in a hand, blank face, wax "C". |
| `brief-5.webp` | The shop sells one more for 1 coin. | One brass coin sliding across a counter towards a shop slip. |
| `brief-6.webp` | Other players hold other clues. They may lie. | Three hatted silhouettes each holding a card; one hides a different card behind his back. |
| `brief-7.webp` | The least gold is out. | Five stacks of gold from tall to nothing; the figure beside the empty place is being shown the door. |
| `brief-8.webp` | The three highest amounts win 5, 3 and 1 coins. | A three-step podium with brass coins marked 5, 3 and 1. |

Keep sprites and pictures under 60 KB each.

## Checks before you hand back

1. Every file is at its path, at its exact size, with a transparent background where
   asked.
2. `arena-vaults.webp` laid over `arena.webp` at 50% opacity: walls, floor and door
   line up exactly; only the stage differs.
3. At 390 px wide, every numeral and every picture's idea is still readable.
