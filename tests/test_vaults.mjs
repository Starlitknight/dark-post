// Checks the Night 1 clues, the scoring and Rock Paper Scissors: node tests/test_vaults.mjs
import { CLUES, GOLD, RULES, allLayouts, knows, dealClues, shopClue, goldFor, duel, settle, validThrows } from "../src/vaults.js";

let failed = 0;
const check = (label, ok) => {
  console.log((ok ? "PASS  " : "FAIL  ") + label);
  if (!ok) failed += 1;
};
const layouts = allLayouts();
const ids = CLUES.map((c) => c.id);
function* subsets(k, start = 0, picked = []) {
  if (picked.length === k) { yield picked; return; }
  for (let i = start; i < ids.length; i++) yield* subsets(k, i + 1, [...picked, ids[i]]);
}

check("there are 120 ways to fill six vaults, and 16 different clues", layouts.length === 120 && CLUES.length === 16 && new Set(CLUES.map((c) => c.text)).size === 16);
check("every clue is true of the real vaults", CLUES.every((c) => c.fits(GOLD)));
check("no two clues say the same thing in different words", new Set(CLUES.map((c) => layouts.map((g) => (c.fits(g) ? 1 : 0)).join(""))).size === 16);

// the three hidden thresholds, by trying every combination
const reach = {};
for (let k = 1; k <= 9; k++) {
  const r = { sets: 0, empties: 0, lowest: 0, both: 0, richest: 0, all: 0, best: 0 };
  for (const s of subsets(k)) {
    const w = knows(s, layouts);
    r.sets += 1;
    if (w.empties) r.empties += 1;
    if (w.empties && w.lowest) r.both += 1;
    if (w.richest) r.richest += 1;
    if (w.best) r.best += 1;
    if (w.all) r.all += 1;
  }
  reach[k] = r;
}
check("no 3 clues tell you the three empty vaults", [1, 2, 3].every((k) => reach[k].empties === 0));
check("some sets of 4 do (" + reach[4].empties + " of " + reach[4].sets + ")", reach[4].empties > 0);
check("but 4 clues never tell you which vault holds the most", [1, 2, 3, 4].every((k) => reach[k].richest === 0));
check("no 4 clues tell you the empty vaults and where the 2 is", [1, 2, 3, 4].every((k) => reach[k].both === 0));
check("and no 4 clues let you be sure of the two richest vaults by any other route", [1, 2, 3, 4].every((k) => reach[k].best === 0));
check("some sets of 5 do (" + reach[5].both + " of " + reach[5].sets + ")", reach[5].both > 0);
check("no 5 clues tell you everything", [1, 2, 3, 4, 5].every((k) => reach[k].all === 0));
check("some sets of 6 tell you everything (" + reach[6].all + " of " + reach[6].sets + ")", reach[6].all > 0);
check("all 16 clues together leave exactly one answer", knows(ids, layouts).all);
check("no single clue names a vault as empty or as full for certain", CLUES.every((c) => {
  const left = layouts.filter((g) => c.fits(g));
  return [0, 1, 2, 3, 4, 5].every((v) => new Set(left.map((g) => g[v] === 0)).size === 2);
}));

// how far a player gets with k clues picked at random from the sixteen
const pct = (x, y) => Math.round((100 * x) / y) + "%";
console.log("      clues held:        " + [4, 5, 6, 7, 8, 9].map((k) => String(k).padStart(5)).join(""));
console.log("      know the empties:  " + [4, 5, 6, 7, 8, 9].map((k) => pct(reach[k].empties, reach[k].sets).padStart(5)).join(""));
console.log("      can be sure of 15: " + [4, 5, 6, 7, 8, 9].map((k) => pct(reach[k].best, reach[k].sets).padStart(5)).join(""));
console.log("      know everything:   " + [4, 5, 6, 7, 8, 9].map((k) => pct(reach[k].all, reach[k].sets).padStart(5)).join(""));

// dealing and the shop
let fair = true;
for (let n = 2; n <= 16; n++) {
  const numbers = Array.from({ length: n }, (_, i) => i + 1);
  const hand = dealClues(numbers);
  const got = Object.values(hand);
  if (got.length !== n || new Set(got).size !== n || !got.includes(3)) fair = false;
}
check("every player is dealt a different clue, and the shortest path to 15 is always in play", fair);
let shop = true;
for (let i = 0; i < 400; i++) { const own = 1 + (i % 16); const c = shopClue(own); if (c === own || c < 1 || c > 16) shop = false; }
check("the shop never sells a player their own clue", shop);

// gold
check("two vaults are worth what they hold", goldFor(2, 3) === 15 && goldFor(2, 5) === 12 && goldFor(1, 2) === 10 && goldFor(3, 5) === 7 && goldFor(1, 4) === 0);

// Rock Paper Scissors
const T = (s) => s.split("");
check("five throws of r, p or s are a valid hand, nothing else is", validThrows(T("rpsrp")) && !validThrows(T("rps")) && !validThrows(T("rpsxx")) && !validThrows(null));
let d = duel([4, 9], { 4: T("rrrrr"), 9: T("pprrr") });
check("two players: first to two wins stays, the other is out", d.out === 4 && d.rounds.length === 2 && d.wins[9] === 2);
d = duel([4, 9], { 4: T("rsprs"), 9: T("rppsr") });
check("a drawn throw is played again", d.rounds[0].losers.length === 0 && d.out === 9 && d.wins[4] === 2);
d = duel([4, 9], { 4: T("rpsrp"), 9: T("rpsrp") });
check("two players who sealed the same throws still get a result", d.out === 4 || d.out === 9);
d = duel([4, 9], { 4: T("rrrrr"), 9: T("rrrrr") });
check("unless neither ever changes: that is handed back", d.out === null && d.undecided.join() === "4,9");
d = duel([2, 4, 9], { 2: T("rrrrr"), 4: T("prrrr"), 9: T("prrrr") });
check("three players: the one who loses the throw is out at once", d.out === 2 && d.rounds.length === 1);
d = duel([2, 4, 9], { 2: T("rrsss"), 4: T("spppp"), 9: T("srrrr") });
check("three players: two lose the throw, then play best of three", d.rounds[0].losers.join() === "4,9" && d.rounds[1].final === true && d.out === 9);
d = duel([2, 4, 9], { 2: T("rpsrp"), 4: T("prsrp"), 9: T("sprrp") });
check("rock, paper and scissors all at once is a draw", d.rounds[0].losers.length === 0);
d = duel([4, 9], { 4: T("rpsrp"), 9: null });
check("a player who sealed nothing loses to one who did", d.out === 9 && d.forfeit === true);
d = duel([4, 9, 11], { 4: null, 9: null, 11: T("rpsrp") });
check("two who sealed nothing cannot play each other", d.out === null && d.undecided.join() === "4,9");

// the whole night
const everyone = Array.from({ length: 16 }, (_, i) => i + 1);
const plays = {};
everyone.forEach((n) => (plays[n] = { a: 2, b: 3, throws: T("rpsrp") }));
plays[5] = { a: 2, b: 5, throws: T("rpsrp") };
plays[6] = { a: 1, b: 2, throws: T("rpsrp") };
plays[7] = { a: 3, b: 5, throws: T("rpsrp") };
plays[8] = { a: 1, b: 4, throws: T("rpsrp") };
let r = settle(everyone, plays);
check("the least gold is out", r.out === 8 && r.gold[8] === 0 && r.last.join() === "8" && r.duel === null);
check("the three highest amounts are paid 5, 3 and 1, to everyone on them", r.prize[1] === 5 && r.prize[16] === 5 && r.prize[5] === 3 && r.prize[6] === 1 && r.prize[7] === 0 && r.rank[7] === 4 && r.prize[8] === 0);
delete plays[9];
r = settle(everyone, plays);
check("a player who never opened has no gold and loses the tie to one who did", r.gold[9] === 0 && r.last.join() === "8,9" && r.out === 9 && r.duel.forfeit === true);
plays[9] = { a: 4, b: 6, throws: T("ppppp") };
plays[8].throws = T("rrrrr");
r = settle(everyone, plays);
check("a tie for last is played from the sealed throws", r.last.join() === "8,9" && r.out === 8 && r.duel.rounds.length === 2);
plays[9].throws = T("rrrrr");
r = settle(everyone, plays, { 8: 4, 9: 6 });
check("a tie the throws cannot settle goes against fewer coins", r.out === 8 && r.undecided.length === 0);
r = settle(everyone, plays, { 8: 6, 9: 6 });
check("and if coins are level too, the GM decides", r.out === null && r.undecided.join() === "8,9");
const same = {};
everyone.forEach((n) => (same[n] = { a: 2, b: 3, throws: T("rpsrp".slice(n % 5) + "rpsrp".slice(0, n % 5)) }));
r = settle(everyone, same);
check("if all sixteen score the same, all are first, all are paid, and one still goes", everyone.every((n) => r.rank[n] === 1 && r.prize[n] === 5) && r.last.length === 16 && (r.out !== null || r.undecided.length > 0));
check("the empty-handed are never paid, even when few amounts were scored", (() => { const p = {}; everyone.forEach((n) => (p[n] = { a: 1, b: 4, throws: T("rpsrp") })); p[1] = { a: 2, b: 3, throws: T("rpsrp") }; const x = settle(everyone, p); return x.prize[1] === 5 && x.rank[2] === 2 && x.prize[2] === 0; })());
console.log(failed ? failed + " FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
