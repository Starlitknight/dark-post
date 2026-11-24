// Dark Post, Night 1: Four Wings.
// The players sleep in four wings and nobody knows their own. Every player holds two cards.
// A card is a true fact about two OTHER players: they share a wing, or they do not.
// Each fact is printed twice and dealt to two different players. All the facts together,
// with the size of each wing, leave exactly one way to split the house.

import { seedOf } from "./puzzles.js";

export const WING_NAMES = ["North", "East", "South", "West"];
// How many of the facts say "these two share a wing". More of them makes an easier night.
export const LEVELS = { easy: 0.69, normal: 0.6, hard: 0.5 };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(r, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const key = (a, b) => (a < b ? a + "-" + b : b + "-" + a);

// Wing sizes for a house of n players: as even as they can be, biggest first.
export function wingSizes(n) {
  const base = Math.floor(n / 4);
  const extra = n % 4;
  return [0, 1, 2, 3].map((i) => base + (i < extra ? 1 : 0));
}

// Every way to split the house that agrees with the facts, counted up to `limit`.
// Players joined by "share" facts move as one block; blocks are then packed into wings.
// Returns the splits found, each as a map from player to wing index.
export function solutions(players, sizes, facts, limit = 2) {
  const parent = new Map(players.map((p) => [p, p]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (const f of facts) if (f.same) parent.set(find(f.a), find(f.b));
  const members = new Map();
  for (const p of players) {
    const root = find(p);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(p);
  }
  const blocks = [...members.values()].sort((x, y) => y.length - x.length);
  const blockOf = new Map();
  blocks.forEach((b, i) => b.forEach((p) => blockOf.set(p, i)));
  const apart = blocks.map(() => new Set());
  for (const f of facts) {
    if (f.same) continue;
    const x = blockOf.get(f.a);
    const y = blockOf.get(f.b);
    if (x === y) return []; // the facts contradict each other
    apart[x].add(y);
    apart[y].add(x);
  }
  const room = sizes.slice();
  const held = sizes.map(() => []);
  const found = [];
  const place = (i) => {
    if (found.length >= limit) return;
    if (i === blocks.length) {
      const split = new Map();
      held.forEach((list, w) => list.forEach((b) => blocks[b].forEach((p) => split.set(p, w))));
      found.push(split);
      return;
    }
    const size = blocks[i].length;
    const triedEmpty = new Set(); // empty wings of the same size are interchangeable
    for (let w = 0; w < sizes.length; w++) {
      if (room[w] < size) continue;
      if (held[w].length === 0) {
        if (triedEmpty.has(sizes[w])) continue;
        triedEmpty.add(sizes[w]);
      }
      if (held[w].some((b) => apart[i].has(b))) continue;
      held[w].push(i);
      room[w] -= size;
      place(i + 1);
      room[w] += size;
      held[w].pop();
    }
  };
  place(0);
  return found;
}

// Two splits are the same if they put the same players together, whatever the wings are called.
function sameSplit(players, one, two) {
  const pair = new Map();
  for (const p of players) {
    const a = one.get(p);
    const b = two.get(p);
    if (pair.has(a) && pair.get(a) !== b) return false;
    pair.set(a, b);
  }
  return new Set(pair.values()).size === pair.size;
}

function tryDeal(r, players, level) {
  const n = players.length;
  const sizes = wingSizes(n);
  const order = shuffle(r, players);
  const wings = [];
  let at = 0;
  for (const s of sizes) {
    wings.push(order.slice(at, at + s).sort((a, b) => a - b));
    at += s;
  }
  const truth = new Map();
  wings.forEach((list, w) => list.forEach((p) => truth.set(p, w)));

  // "share" facts: inside each wing, links that never close a loop, so none is wasted
  // always leave at least one player loose, so the night never solves itself by reading cards alone
  const wantSame = Math.min(n - 5, Math.max(4, Math.round(n * (LEVELS[level] || LEVELS.normal))));
  const links = wings.map(() => 1);
  let left = wantSame - 4;
  while (left > 0) {
    const open = wings.map((w, i) => i).filter((i) => links[i] < wings[i].length - 1);
    if (!open.length) break;
    links[open[Math.floor(r() * open.length)]] += 1;
    left -= 1;
  }
  const facts = [];
  const used = new Set();
  const add = (a, b, same) => {
    used.add(key(a, b));
    facts.push({ a: Math.min(a, b), b: Math.max(a, b), same });
  };
  wings.forEach((list, w) => {
    const mixed = shuffle(r, list);
    const joined = [mixed[0]];
    // grow a tree for as many links as this wing was given; the rest stay loose
    for (let k = 1; k <= links[w] && k < mixed.length; k++) {
      add(joined[Math.floor(r() * joined.length)], mixed[k], true);
      joined.push(mixed[k]);
    }
  });

  // "different" facts: each one is chosen to rule out a wrong split that still fits
  const budget = n - facts.length;
  let spent = 0;
  for (;;) {
    const fits = solutions(players, sizes, facts, 2);
    const wrong = fits.find((s) => !sameSplit(players, s, truth));
    if (!wrong) break;
    if (spent >= budget) return null;
    const pairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = players[i];
        const b = players[j];
        if (wrong.get(a) === wrong.get(b) && truth.get(a) !== truth.get(b) && !used.has(key(a, b))) pairs.push([a, b]);
      }
    }
    if (!pairs.length) return null;
    const pick = pairs[Math.floor(r() * pairs.length)];
    add(pick[0], pick[1], false);
    spent += 1;
  }

  // the rest of the cards: more "different" facts, about the players named least so far
  const named = new Map(players.map((p) => [p, 0]));
  for (const f of facts) {
    named.set(f.a, named.get(f.a) + 1);
    named.set(f.b, named.get(f.b) + 1);
  }
  let guard = 0;
  while (facts.length < n && guard++ < 400) {
    const quiet = shuffle(r, players).sort((x, y) => named.get(x) - named.get(y));
    const a = quiet[0];
    const others = quiet.filter((p) => truth.get(p) !== truth.get(a) && !used.has(key(a, p)));
    if (!others.length) continue;
    const b = others[0];
    add(a, b, false);
    named.set(a, named.get(a) + 1);
    named.set(b, named.get(b) + 1);
  }
  if (facts.length !== n) return null;
  if ([...named.values()].some((count) => count === 0)) return null;

  // deal: two cards each, never about yourself, never the same fact twice in one hand
  const mixedFacts = shuffle(r, facts);
  mixedFacts.forEach((f, i) => (f.id = i + 1));
  for (let attempt = 0; attempt < 60; attempt++) {
    const copies = new Map(mixedFacts.map((f) => [f.id, 2]));
    const hands = new Map();
    let ok = true;
    for (const p of shuffle(r, players)) {
      const can = shuffle(r, mixedFacts.filter((f) => copies.get(f.id) > 0 && f.a !== p && f.b !== p)).sort((x, y) => copies.get(y.id) - copies.get(x.id));
      if (can.length < 2) {
        ok = false;
        break;
      }
      hands.set(p, [can[0].id, can[1].id].sort((x, y) => x - y));
      copies.set(can[0].id, copies.get(can[0].id) - 1);
      copies.set(can[1].id, copies.get(can[1].id) - 1);
    }
    if (ok && [...copies.values()].every((c) => c === 0)) {
      return { sizes, wings, facts: mixedFacts.sort((x, y) => x.id - y.id), hands: Object.fromEntries(hands) };
    }
  }
  return null;
}

// Deal a night. `players` are the numbers of everyone still in the game (12 to 16 of them).
// The same seed always deals the same night.
export function deal(seedText, players, level = "easy") {
  const list = [...new Set(players)].sort((a, b) => a - b);
  if (list.length < 12 || list.length > 16) throw new Error("Four Wings needs 12 to 16 players.");
  const r = rng(seedOf(String(seedText)));
  for (let attempt = 0; attempt < 200; attempt++) {
    const night = tryDeal(r, list, level);
    if (night) return night;
  }
  throw new Error("Could not deal the cards.");
}

// The words on a card.
export function cardText(fact) {
  return fact.same ? `Player ${fact.a} and Player ${fact.b} share a wing.` : `Player ${fact.a} and Player ${fact.b} are in different wings.`;
}

// Score the night.
//   wings: the true split, as dealt.   seals: { number: [the players they named] }.   coins: { number: coins held }.
// One point for each wing-mate named. A wing is judged by the share of its names that were right, so wings of
// three and four can be compared. The lowest wing loses, and in it the lowest player is out.
// Ties go against fewer coins. A tie that coins cannot break is handed back in `tiedWings` or `tiedPlayers`.
export function judge(wings, seals, coins) {
  const wingOf = new Map();
  wings.forEach((list, w) => list.forEach((p) => wingOf.set(p, w)));
  const players = {};
  const table = wings.map((list, w) => {
    let score = 0;
    let max = 0;
    let purse = 0;
    for (const p of list) {
      const named = [...new Set((seals[p] || []).map(Number))].filter((x) => x !== p).slice(0, list.length - 1);
      const right = named.filter((x) => wingOf.get(x) === w).length;
      players[p] = { wing: w, score: right, max: list.length - 1, sealed: !!seals[p] };
      score += right;
      max += list.length - 1;
      purse += coins[p] || 0;
    }
    return { wing: w, name: WING_NAMES[w], score, max, share: max ? score / max : 0, coins: purse, perfect: score === max };
  });
  const lowShare = Math.min(...table.map((t) => t.share));
  let losing = table.filter((t) => Math.abs(t.share - lowShare) < 1e-9);
  const lowPurse = Math.min(...losing.map((t) => t.coins));
  losing = losing.filter((t) => t.coins === lowPurse);
  const out = { players, wings: table, loser: null, tiedWings: [], out: null, tiedPlayers: [] };
  if (losing.length > 1) {
    out.tiedWings = losing.map((t) => t.wing);
    return out;
  }
  out.loser = losing[0].wing;
  const inside = wings[out.loser];
  const lowScore = Math.min(...inside.map((p) => players[p].score));
  let last = inside.filter((p) => players[p].score === lowScore);
  const lowCoins = Math.min(...last.map((p) => coins[p] || 0));
  last = last.filter((p) => (coins[p] || 0) === lowCoins);
  if (last.length > 1) out.tiedPlayers = last;
  else out.out = last[0];
  return out;
}
