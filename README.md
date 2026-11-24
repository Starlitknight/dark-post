# Dark Post

The website for Dark Post: the invitation, the player's number, the opening-night
choice between two bags, a hall with nine rooms to walk through, the reveal, and the
host console.

## Who builds what

This folder is the one copy of the game. It was merged on 24 Nov 2026 from two
versions: the art agent's screens (everything in `public/` except the host console)
and the game rules and server (`src/`, the host console, `tests/`).

From here on one agent writes the code. Each piece of work starts as a short brief
in `briefs/`. `CHANGES.md` is that agent's own account of what it changed.

## Put it online without a terminal

1. Put this folder in a private GitHub repository named `dark-post`.
2. In the Cloudflare dashboard: Workers & Pages, Create application, Import a
   repository. Pick the repository. Keep the name `dark-post` (it must match `name`
   in `wrangler.jsonc`) and the deploy command `npx wrangler deploy`. Save and Deploy.
3. Cloudflare gives the game an address ending in `workers.dev`. The host console is
   at that address plus `/host`. The first passphrase typed there becomes the
   gamemaster's passphrase, so open it before anyone else has the address.

Every later push to the repository goes live by itself. The terminal route below does
the same thing by hand.

## Put it online (about 10 minutes, free)

You need a free Cloudflare account and Node.js (https://nodejs.org, the LTS version).

1. Unzip this folder and open a terminal inside it.
2. `npm install`
3. `npx wrangler login` (a browser window opens; sign in or create the free account)
4. `npx wrangler deploy`
   The first time, it asks you to pick a `workers.dev` name. It then prints your
   address, for example `https://dark-post.yourname.workers.dev`.
5. Open `https://your-address/host` straight away and set your host passphrase.
   Whoever opens `/host` first owns the console, and the passphrase cannot be recovered.

To change the site later, edit the files and run `npx wrangler deploy` again.
Your players and their choices are kept. Do not change the `name` in
`wrangler.jsonc` after the first deploy, or you start with an empty game.

## Before you send the invitations

In the host console:

1. Set the dates (section 2), in your own time zone: when the bags open, the
   answer-by date, and the name and time of the round after the bags.
2. Read the letter (section 3) and change anything you want. Keep it about the
   length it is: it is laid out to fit one phone screen, with Accept and Decline
   always visible below it. A longer letter scrolls inside the sheet.
3. Open each preview in section 5 on your phone.
4. Create one invitation named "Test", open its link in a private window, and play
   it through. Then press Remove on it, which frees the seat and the number.
5. Add your guests' names and send each person their own link.

## What a guest goes through

1. **The letter.** One screen. Accept or Decline.
2. **Welcome.** Four short lines on what Dark Post is.
3. **The draw.** A light runs round sixteen numbers and stops on theirs. The
   number is a random free one from 1 to 16, given by the server. Only 16 can accept.
4. **The sixteen.** Sixteen players, you are one, win to stay in, outlast the others.
5. **The coin, then the two bags.** Bag 1 is 5 coins, guaranteed. Bag 2 is 40 coins
   split equally among everyone who takes it, rounded down. The choice is secret and final.
6. **A character.** 24 ready-made, on one screen. "Change the look" opens a second
   screen for hair, colours, face, build and clothes.
7. **The tour.** Each of the nine rooms, full screen, with one line on what it is
   for, then the menu.
8. **The hall.** Free to walk and talk.

Seven small bars along the top show how far through the opening they are.

A player who has accepted but not sealed a bag when the bags open receives nothing.
You open the bags from the console, or tick the box to have them open by themselves
at the opening time. Each player then sees the result behind a "Show me" screen,
and afterwards a ledger.

## Two kinds of thing: pages and rooms

**Pages open from the menu, anywhere. Nobody walks to them.** One MENU button sits at
the bottom of every room.

- **Messages:** private, between two players. Tapping another figure also opens one.
- **Ask the GM:** a private line from one player to you.
- **Players:** all sixteen, who has arrived, and what each holds once the bags are
  open. Tap a player for their card. Until the bags open, a player can change their
  character from their own card.
- **Broadcast:** everything players have said to everyone. Read-only here. Your
  notices are behind a "GM notices" link on this page: only you write them.
- **Standings:** every player ranked by coins, once you publish balances.
- **How to play:** the goal, the nights, elimination, coins, talking and the GM.

On a match night the menu also carries **tonight's match** on top: the rules, the
clock and this player's clues.

**Rooms are places. A player walks there** by tapping the floor or a door sign
(arrow keys or WASD on a computer). There is no travel from the menu. Each room is a
painted plate that fills the screen.

- **The hall** (white): where everyone gathers. Numbered marks on the floor, the two
  bags in the middle, and a strip that says what is happening NOW, what is NEXT with a
  countdown, and what this player should do.
- **The arena** (gold): where each night's match is played. Its set changes with the
  match: six vault doors on Night 1, dust sheets when nothing is on.
- **The puzzle room** (violet): one puzzle a day, three tries, 1 coin.
- **The betting room** (green): a deal between two players.
- **The broadcast room** (red): the only place a player can speak to everyone.
- **The gallery** (rose): a portrait of every player. A portrait opens that player's card.
- **The shop** (teal): open on match nights. On Night 1 it sells one clue for 1 coin.

Every player who has arrived is a figure with their number on it. Places nobody has
taken yet are black shadows on the hall's numbered marks. Players who are connected
right now move live. Players who are away stay where they last stood, dimmed.

### Night 1: Six Vaults

Start it from the host console once the bags are open, and give it a closing time.

- Six vaults. Vaults 1, 4 and 6 are empty. Vault 2 holds 10 gold, Vault 3 holds 5,
  Vault 5 holds 2. Players are told only that three are empty and the others hold
  10, 5 and 2.
- Each player is dealt one true clue that nobody else is dealt. In the shop they can
  buy one more for 1 coin: a random clue they have not seen. Everything other players
  tell them may be true or false, and nothing proves it.
- Each player opens any two vaults, in the arena. It is sealed and final. Nobody is
  shown what was inside until the night ends, so there is nothing to gain by waiting
  to hear what others found.
- With their vaults, each player seals five Rock Paper Scissors throws.
- When the vaults close: the least gold is out. A tie for last is played from the
  sealed throws, best of three. With more than two tied, everyone throws, whoever
  loses the throw stays in danger, and the last two play best of three. A player who
  opened nothing has no throws and loses the tie. If the throws cannot separate two
  players, fewer coins goes; if that is level too, the console asks you to choose.
- The three highest amounts of gold are paid 5, 3 and 1 coins, to every player on
  them. A player with no gold is paid nothing.
- Gold is not coins. It only counts for the night.

The sixteen clues are in `src/vaults.js`. Eleven are about which vaults are empty and
five are about the order of the amounts. `tests/test_vaults.mjs` tries every
combination and checks that:

- no 3 clues tell a player the three empty vaults (some sets of 4 do);
- no 4 clues tell them the empty vaults and where the 2 is, or let them be sure of
  the two richest vaults by any other route (some sets of 5 do);
- no 5 clues tell them everything (some sets of 6 do).

A player who gathers clues honestly at random is sure of the maximum, 15, about 3%
of the time with 5 clues, 39% with 7 and 77% with 9.

A player who is out can still walk the house, read everything they could read
before, and ask the GM. They cannot broadcast, message, deal, solve the puzzle or
play. Their figure and portrait turn grey and their star goes dark.

From the console you can close the vaults early, undo the night (for testing), and
send a player home or bring one back by hand.

### The day

The puzzle and the deals work by the day. A day turns over at the hour the bags
open, so if the bags open at 9 pm, every later day starts at 9 pm, for every player
in every time zone. Changing the opening hour moves that moment.

### The puzzle of the day

Four kinds, in turn: crack a three-digit code, weigh three shapes, break a cipher,
find the next number. Every player gets different numbers, so an answer cannot be
passed on. Three tries. A solved puzzle pays 1 coin. Before the bags open the coin is
held, and it is added when they open.

### A deal

Open once the bags are open. A player picks another player, stakes 2 coins, and
secretly seals Cooperate or Betray. The other player comes to the betting room and
seals theirs, or declines.

| | They cooperate | They betray |
|---|---|---|
| **You cooperate** | +1 | −2 |
| **You betray** | +2 | −1 |

One deal a day for each player. An offer nobody answers by the end of the day is
returned. Only the two players are told the result, but everyone can see everyone's
coins on the Players page, so a careful player can work out who gained and who lost.
The numbers are at the top of `src/worker.js` (`DEAL_STAKE`, `DEAL_PAY`).

### Broadcasts

A player goes to the broadcast room to speak to everyone. Every player in the hall
sees it appear on screen, and anyone can read it later under Broadcasts in the menu.

### The dungeon

What is said in a cell is heard only by the players standing in that cell at that
moment. Walk in later and you have not heard what came before. Walk out and the
cell closes behind you. The door log, which every player can read, lists who went
into which cell and when, never what was said. You hear everything.

### A player's card

Number, in the game or not, coins once the bags are open, when they joined, when
they were last seen, puzzles solved, deals made, and a button to message them.

### The clock

Before the bags open, NEXT is "The bags open" and counts down to the opening time.
After, NEXT is the round you named in section 2 of the console, counting down to
the time you gave it. With no time set it says "To be announced". Change both
after each round.

## The host console

Only players who have sealed a bag can enter the hall, so nobody can talk before choosing.

- **Messages:** reply to private questions, post notices, broadcast as the GM, read
  every private message and every dungeon cell (with who heard each line), and remove
  any message. Players are told on screen that the GM can read everything.
- **Rooms:** today's puzzle with every player's own answer, every deal with both
  choices, who is in each cell, and the door log. Below it you can give coins to a
  player or take them away, for a prize, a penalty, or a night you ran yourself.
- **Invitations:** once the bags are open, each row shows the player's total and how
  much came from the bag.

Live movement uses a WebSocket to the same Durable Object. If it cannot connect, a
player still sees everyone, a few seconds behind.

## What is in the folder

- `src/worker.js`: the server. One Durable Object with a small SQLite database.
- `src/puzzles.js`: the daily puzzle maker.
- `src/vaults.js`: Night 1, Six Vaults: the vaults, the sixteen clues, the scoring and
  Rock Paper Scissors.
- `public/`: the guest site (`index.html`, `app.js`, `art.js`, `avatar.js`, `world.js`,
  `shared.js`, `app.css`, `play.css`, `briefing.css`, and the painted art in `art/`)
  and the host console (`host.html`, `host.js`, `host.css`). Fonts are bundled.
  `world.js` holds the nine rooms.
- `briefs/`: one short file for each piece of work asked of the building agent.
- `CHANGES.md`: the building agent's notes on what it changed.
- `tests/test_flow.py`: an end-to-end check of the server. Run `npx wrangler dev` in
  one terminal and `python3 tests/test_flow.py` in another, against a fresh local
  database (delete `.wrangler/state` first).
- `tests/test_puzzles.mjs`: checks the puzzle maker. `node tests/test_puzzles.mjs`.
- `tests/test_vaults.mjs`: checks the Night 1 clues against every combination, and
  the scoring. `node tests/test_vaults.mjs`.
- `tests/browser/`: three walkthroughs in a real browser. They need Chrome and
  `npm install --no-save puppeteer-core`, and a fresh local server for the first two.
  `first_visit.mjs` takes a new player from the letter to the hall, through every menu
  page and every room. `night1.mjs` plays a whole Night 1 with the host console.
  `preview_night.mjs` plays Night 1 in the built-in preview on a phone and a desktop
  screen. Set `CHROME` to the browser's path and `SHOTS` to a folder for screenshots.

## Not built yet

- **Night 2 and every later night.** After Night 1 the clock counts down to the round
  you name, but there is no game behind it. Until one is built, you would run a night
  yourself and settle it with the coin tool and the send-home button in the console.
  `src/wings.js` is a second match, Four Wings, with its dealer and scoring written
  and tested but no screens.
- **The arena's vault set is a placeholder.** Six plain doors are drawn over the
  painted stage until the art agent paints a set (brief 001).
- **Spectators.** A player who is out sees what any player sees, not everything.
- **Notifications.** Nobody is told when a message arrives. Players and you see new
  messages only when the site is open.
- The server checks that a player stands in a cell before they can speak in it. It
  does not check that a player is in the broadcast room, the puzzle room or the
  betting room: the site only offers those there, but someone who knows how to call
  the server directly could use them from anywhere.
