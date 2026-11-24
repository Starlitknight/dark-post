// Checks the Night 1 card dealer and the scoring: node tests/test_wings.mjs
import { deal, judge, solutions, wingSizes, cardText, LEVELS } from "../src/wings.js";

let failed = 0;
const check = (label, ok) => {
  console.log((ok ? "PASS  " : "FAIL  ") + label);
  if (!ok) failed += 1;
};

// A second, slower way to count the splits that fit, written differently on purpose:
// take the first player without a wing, try every set of wing-mates for them, and go on.
function countByHand(players, sizes, facts, limit) {
  const want = sizes.slice().sort((a, b) => b - a).join(",");
  let count = 0;
  const groups = [];
  const fits = () => {
    const at = new Map();
    groups.forEach((g, i) => g.forEach((p) => at.set(p, i)));
    return facts.every((f) => (at.get(f.a) === at.get(f.b)) === f.same);
  };
  const go = (rest) => {
    if (count >= limit) return;
    if (!rest.length) {
      if (groups.map((g) => g.length).sort((a, b) => b - a).join(",") === want && fits()) count += 1;
      return;
    }
    const first = rest[0];
    const others = rest.slice(1);
    for (const size of new Set(sizes)) {
      const pick = (start, chosen) => {
        if (chosen.length === size - 1) {
          groups.push([first, ...chosen]);
          go(others.filter((p) => !chosen.includes(p)));
          groups.pop();
          return;
        }
        for (let i = start; i < others.length; i++) pick(i + 1, [...chosen, others[i]]);
      };
      pick(0, []);
    }
  };
  go(players);
  return count;
}

const all = (n) => Array.from({ length: n }, (_, i) => i + 1);
let shape = true, truthful = true, oneAnswer = true, hands = true, everyoneNamed = true, repeatable = true, aloneStuck = true, needsCounting = true;
let slowest = 0, deals = 0;
const sameCounts = {};
for (const level of Object.keys(LEVELS)) {
  for (let n = 12; n <= 16; n++) {
    for (let seed = 0; seed < 60; seed++) {
      const players = n === 14 ? all(16).filter((p) => p !== 5 && p !== 12) : all(n); // 14: two empty seats, numbers still run to 16
      const t0 = performance.now();
      const night = deal("test:" + level + ":" + n + ":" + seed, players, level);
      slowest = Math.max(slowest, performance.now() - t0);
      deals += 1;
      if (JSON.stringify(night) !== JSON.stringify(deal("test:" + level + ":" + n + ":" + seed, players, level))) repeatable = false;
      const wingOf = new Map();
      night.wings.forEach((list, w) => list.forEach((p) => wingOf.set(p, w)));
      if (night.wings.map((w) => w.length).join() !== wingSizes(n).join() || wingOf.size !== n || night.facts.length !== n) shape = false;
      const seen = new Set();
      for (const f of night.facts) {
        if (f.a === f.b || (wingOf.get(f.a) === wingOf.get(f.b)) !== f.same || seen.has(f.a + "-" + f.b)) truthful = false;
        seen.add(f.a + "-" + f.b);
      }
      if (solutions(players, night.sizes, night.facts, 3).length !== 1) oneAnswer = false;
      const holders = new Map(night.facts.map((f) => [f.id, []]));
      for (const p of players) {
        const mine = night.hands[p] || [];
        if (mine.length !== 2 || mine[0] === mine[1]) hands = false;
        for (const id of mine) {
          const f = night.facts.find((x) => x.id === id);
          if (!f || f.a === p || f.b === p) hands = false;
          else holders.get(id).push(p);
        }
        const own = mine.map((id) => night.facts.find((x) => x.id === id));
        if (solutions(players, night.sizes, own, 2).length < 2) aloneStuck = false;
      }
      if ([...holders.values()].some((h) => h.length !== 2 || h[0] === h[1])) hands = false;
      if (players.some((p) => !night.facts.some((f) => f.a === p || f.b === p))) everyoneNamed = false;
      const same = night.facts.filter((f) => f.same).length;
      if (same >= n - 4) needsCounting = false; // n - 4 "share" cards would spell out every wing
      (sameCounts[level + n] = sameCounts[level + n] || new Set()).add(same);
    }
  }
}
check(deals + " nights dealt: the same seed always deals the same night", repeatable);
check("wings are as even as they can be, and there is one fact per player", shape);
check("every card is true, and no fact is printed as two different cards", truthful);
check("all the cards together leave exactly one way to split the house", oneAnswer);
check("every player holds two different cards, none about themselves, and every fact has two holders", hands);
check("every player is named on at least one card", everyoneNamed);
check("no player can solve the night from their own two cards", aloneStuck);
check("the cards never spell out every wing: someone always has to be placed by counting", needsCounting);
check("dealing is quick enough for the server (slowest: " + slowest.toFixed(1) + " ms)", slowest < 50);
console.log("      'share' cards out of 16: easy " + [...sameCounts.easy16] + ", normal " + [...sameCounts.normal16] + ", hard " + [...sameCounts.hard16]);

// the fast counter against the slow one
let agree = true;
for (let seed = 0; seed < 40; seed++) {
  const night = deal("slow:" + seed, all(12), seed % 2 ? "hard" : "normal");
  const fewer = night.facts.slice(0, 6 + (seed % 6)); // drop some cards, so there is more than one answer to count
  const fast = solutions(all(12), night.sizes, fewer, 500).length;
  if (fast !== countByHand(all(12), night.sizes, fewer, 500) || countByHand(all(12), night.sizes, night.facts, 5) !== 1) agree = false;
}
for (let seed = 0; seed < 3; seed++) {
  const night = deal("slow16:" + seed, all(16), "hard");
  if (countByHand(all(16), night.sizes, night.facts, 3) !== 1) agree = false;
}
check("a slower count, written a different way, finds the same number of answers", agree);

// scoring
const wings = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];
const perfect = {};
wings.forEach((w) => w.forEach((p) => (perfect[p] = w.filter((x) => x !== p))));
const coins = Object.fromEntries(all(16).map((p) => [p, 6]));
let r = judge(wings, perfect, { ...coins, 9: 5, 10: 4 });
check("when every wing is perfect, the poorest wing loses and its poorest player is out", r.wings.every((w) => w.perfect) && r.loser === 2 && r.out === 10 && !r.tiedWings.length);
r = judge(wings, { ...perfect, 6: undefined }, { ...coins, 9: 1 });
check("a player who never seals scores nothing, sinks their wing, and is the one who goes", r.players[6].score === 0 && r.players[6].sealed === false && r.loser === 1 && r.out === 6);
r = judge(wings, { ...perfect, 13: [14, 1, 2], 16: [13, 14, 9] }, coins);
check("wrong names earn nothing: the wing with the most mistakes loses", r.players[13].score === 1 && r.players[16].score === 2 && r.wings[3].score === 9 && r.loser === 3 && r.out === 13);
r = judge(wings, { ...perfect, 13: [14, 15, 16, 1, 2, 3, 13, 14] }, coins);
check("only the first three different names count, and naming yourself counts for nothing", r.players[13].score === 3);
r = judge(wings, perfect, coins);
check("a tie that coins cannot break is handed back for a decider", r.loser === null && r.tiedWings.length === 4 && r.out === null);
r = judge(wings, { ...perfect, 1: [2, 3, 9], 2: [1, 3, 9] }, coins);
check("so is a tie between two players in the losing wing", r.loser === 0 && r.out === null && r.tiedPlayers.join() === "1,2");
r = judge([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11], [12, 13, 14]], { ...Object.fromEntries(all(14).map((p) => [p, []])), 9: [10, 11], 10: [9, 11], 11: [9, 10], 1: [2, 3, 4], 2: [1, 3, 4], 3: [1, 2, 4], 4: [1, 2, 3], 5: [6, 7, 8], 6: [5, 7, 8], 7: [5, 6, 8], 8: [5, 6, 7], 12: [13, 14], 13: [12, 14], 14: [12, 1] }, coins);
check("wings of three and four are compared by share: one slip in a wing of three loses to perfect wings", r.wings[2].perfect && r.wings[3].score === 5 && r.loser === 3 && r.out === 14);
check("a card reads as a plain sentence", cardText({ a: 4, b: 9, same: true }) === "Player 4 and Player 9 share a wing." && cardText({ a: 2, b: 13, same: false }) === "Player 2 and Player 13 are in different wings.");
console.log(failed ? failed + " FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
