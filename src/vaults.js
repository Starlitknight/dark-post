// Dark Post, Night 1: Six Vaults.
// Three vaults are empty. The other three hold 10, 5 and 2 gold. Every player holds one true clue
// that nobody else holds, may buy one more in the shop, and opens two vaults before the night ends.
// The least gold is eliminated; a tie for last is settled by Rock Paper Scissors, best of three.

// What is in each vault, 1 to 6. Gold is not coins: it only counts for this night.
export const GOLD = [0, 10, 5, 0, 2, 0];

export const RULES = { vaults: 6, open: 2, amounts: [10, 5, 2], cluePrice: 1, prizes: [5, 3, 1], throws: 5 };

const empty = (g, v) => g[v - 1] === 0;
const emptyCount = (g, list) => list.filter((v) => empty(g, v)).length;
const oneOf = (a, b) => ({ kind: "empty", text: `Exactly one of Vault ${a} and Vault ${b} is empty.`, fits: (g) => empty(g, a) !== empty(g, b) });
const alike = (a, b) => ({ kind: "empty", text: `Vault ${a} and Vault ${b} are alike: both are empty, or both hold gold.`, fits: (g) => empty(g, a) === empty(g, b) });
const count = (k, a, b, c) => ({
  kind: "empty",
  text: `Exactly ${k === 1 ? "one" : "two"} of Vaults ${a}, ${b} and ${c} ${k === 1 ? "is" : "are"} empty.`,
  fits: (g) => emptyCount(g, [a, b, c]) === k,
});
// the three amounts in the order of their vault numbers, lowest vault first
const held = (g) => g.filter((x) => x > 0);
const before = (x, y) => ({ kind: "order", text: `The vault with ${x} gold has a lower number than the vault with ${y} gold.`, fits: (g) => g.indexOf(x) < g.indexOf(y) });

// The sixteen clues. Eleven say something about which vaults are empty and nothing about the amounts.
// Five say something about the order of the amounts and nothing about which vaults are empty.
// They are built so that (and tests/test_vaults.mjs checks every combination):
//   no 3 clues tell you the three empty vaults; some sets of 4 do, and 4 clues never tell you which vault is richest;
//   no 4 clues tell you the empty vaults and where the 2 is, or let you be sure of the two richest vaults; some sets of 5 do;
//   no 5 clues tell you everything; some sets of 6 do.
export const CLUES = [
  count(2, 1, 3, 6),
  oneOf(2, 6),
  { kind: "order", text: "Of the three vaults that hold gold, the one with the highest number holds the least.", fits: (g) => held(g)[2] === 2 },
  alike(1, 4),
  oneOf(1, 5),
  before(10, 5),
  count(1, 1, 3, 5),
  oneOf(3, 6),
  count(2, 1, 2, 6),
  { kind: "order", text: "Of the three vaults that hold gold, the middle one by number holds the middle amount.", fits: (g) => held(g)[1] === 5 },
  oneOf(2, 4),
  before(5, 2),
  count(1, 1, 2, 5),
  alike(2, 3),
  before(10, 2),
  oneOf(5, 6),
].map((c, i) => ({ id: i + 1, ...c }));

export const clueText = (id) => (CLUES[id - 1] ? CLUES[id - 1].text : "");

// Every way the six vaults could be filled: 120 of them.
export function allLayouts() {
  const out = [];
  const amounts = RULES.amounts;
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) {
    if (a === b || b === c || a === c) continue;
    const g = [0, 0, 0, 0, 0, 0];
    g[a] = amounts[0];
    g[b] = amounts[1];
    g[c] = amounts[2];
    out.push(g);
  }
  return out;
}

// What a player holding these clues can be sure of.
export function knows(ids, layouts = allLayouts()) {
  const left = layouts.filter((g) => ids.every((id) => CLUES[id - 1].fits(g)));
  const same = (pick) => new Set(left.map(pick)).size === 1;
  return {
    left: left.length,
    empties: same((g) => g.map((x) => (x === 0 ? 1 : 0)).join("")),
    lowest: same((g) => g.indexOf(2)),
    richest: same((g) => g.indexOf(10)),
    // the two richest vaults, whichever way round: enough to be sure of the most gold
    best: same((g) => [g.indexOf(10), g.indexOf(5)].sort().join("")),
    all: left.length === 1,
  };
}

// Hand one clue to each player. With fewer than sixteen players the clues that matter most are dealt first;
// the rest can still be bought in the shop.
const FIRST = [3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
export function dealClues(numbers, random = Math.random) {
  const ids = FIRST.slice(0, numbers.length);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const out = {};
  numbers.forEach((n, i) => (out[n] = ids[i]));
  return out;
}

// A clue for a player who walks in after the night has begun: the first one nobody holds yet.
export function spareClue(taken) {
  return FIRST.find((id) => !taken.includes(id)) || 0;
}

// The clue the shop sells a player: one they have not seen, picked at random.
export function shopClue(own, random = Math.random) {
  const rest = CLUES.map((c) => c.id).filter((id) => id !== own);
  return rest[Math.floor(random() * rest.length)];
}

export const goldFor = (a, b) => (GOLD[a - 1] || 0) + (GOLD[b - 1] || 0);

// ----- Rock Paper Scissors -----

const BEATS = { r: "s", s: "p", p: "r" };
export const validThrows = (t) => Array.isArray(t) && t.length === RULES.throws && t.every((x) => x === "r" || x === "p" || x === "s");

// Settle a tie for last from the throws each player sealed.
// Two players: best of three. More than two: everyone throws, whoever loses the throw stays in danger,
// and that repeats until two are left, who then play best of three.
// A player who sealed nothing has no throws and loses to anyone who has.
export function duel(tied, throws) {
  const list = tied.slice().sort((a, b) => a - b);
  const none = list.filter((n) => !validThrows(throws[n]));
  if (none.length === 1) return { rounds: [], out: none[0], forfeit: true, undecided: [] };
  if (none.length > 1) return { rounds: [], out: null, forfeit: true, undecided: none };
  // each time a player runs out of throws they start again, one step further along, so two players
  // who sealed the same five throws do not draw for ever
  const hand = (n, i) => {
    const t = throws[n];
    return t[(i + Math.floor(i / t.length) * list.indexOf(n)) % t.length];
  };
  const rounds = [];
  let alive = list.slice();
  let i = 0;
  while (alive.length > 2 && i < 60) {
    const hands = {};
    alive.forEach((n) => (hands[n] = hand(n, i)));
    const kinds = [...new Set(Object.values(hands))];
    let losers = [];
    if (kinds.length === 2) {
      const losing = BEATS[kinds[0]] === kinds[1] ? kinds[1] : kinds[0];
      losers = alive.filter((n) => hands[n] === losing);
    }
    rounds.push({ hands, losers });
    if (losers.length) alive = losers;
    i += 1;
  }
  if (alive.length === 1) return { rounds, out: alive[0], forfeit: false, undecided: [] };
  if (alive.length > 2) return { rounds, out: null, forfeit: false, undecided: alive };
  const [a, b] = alive;
  const wins = { [a]: 0, [b]: 0 };
  while (wins[a] < 2 && wins[b] < 2 && i < 120) {
    const hands = { [a]: hand(a, i), [b]: hand(b, i) };
    let losers = [];
    if (hands[a] !== hands[b]) {
      const winner = BEATS[hands[a]] === hands[b] ? a : b;
      wins[winner] += 1;
      losers = [winner === a ? b : a];
    }
    rounds.push({ hands, losers, final: true });
    i += 1;
  }
  if (wins[a] === wins[b]) return { rounds, out: null, forfeit: false, undecided: [a, b] };
  return { rounds, out: wins[a] > wins[b] ? b : a, forfeit: false, undecided: [], wins };
}

// End the night.
//   players: the numbers of everyone still in the game.
//   plays: { number: { a, b, throws } } for everyone who opened two vaults.
//   coins: { number: coins held }, used only when Rock Paper Scissors cannot settle a tie.
export function settle(players, plays, coins = {}) {
  const gold = {};
  for (const n of players) gold[n] = plays[n] ? goldFor(plays[n].a, plays[n].b) : 0;
  const amounts = [...new Set(players.map((n) => gold[n]))].sort((x, y) => y - x);
  const rank = {};
  const prize = {};
  for (const n of players) {
    rank[n] = amounts.indexOf(gold[n]) + 1;
    // the three highest amounts are paid; an empty-handed player is paid nothing
    prize[n] = gold[n] > 0 ? RULES.prizes[rank[n] - 1] || 0 : 0;
  }
  const least = amounts[amounts.length - 1];
  const last = players.filter((n) => gold[n] === least).sort((x, y) => x - y);
  let out = null;
  let match = null;
  let undecided = [];
  if (last.length === 1) out = last[0];
  else {
    const throws = {};
    for (const n of last) throws[n] = plays[n] ? plays[n].throws : null;
    match = duel(last, throws);
    out = match.out;
    undecided = match.undecided;
    if (out == null && undecided.length) {
      // still level: fewer coins goes; if that is level too, the GM decides
      const low = Math.min(...undecided.map((n) => coins[n] || 0));
      const poorest = undecided.filter((n) => (coins[n] || 0) === low);
      if (poorest.length === 1) {
        out = poorest[0];
        undecided = [];
      }
    }
  }
  return { layout: GOLD.slice(), gold, rank, prize, last, duel: match, out, undecided };
}
