// Checks the rules of The Ladder: node tests/test_ladder.mjs
import "../public/ladder.js";
const L = globalThis.LADDER;
let failed = 0;
const check = (label, ok) => { console.log((ok ? "PASS  " : "FAIL  ") + label); if (!ok) failed += 1; };

check("fifteen cards: 2 to Ace and two Jokers", L.CARDS.length === 15 && L.CARDS.filter(L.isJoker).length === 2 && new Set(L.CARDS).size === 15);
check("the higher card wins, the Ace is high, equal cards are level", L.duel("9", 0, "8", 0) === 1 && L.duel("A", 0, "K", 0) === 1 && L.duel("3", 0, "J", 0) === -1 && L.duel("7", 0, "7", 0) === 0);
check("a Joker beats every card but a 2, and two Jokers are level", L.CARDS.every((c) => L.isJoker(c) || c === "2" || L.duel("X1", 0, c, 0) === 1) && L.duel("X1", 0, "2", 0) === -1 && L.duel("2", 0, "X2", 0) === 1 && L.duel("X1", 0, "X2", 0) === 0);
check("a 2 beats nothing else", L.CARDS.every((c) => L.isJoker(c) || c === "2" || L.duel("2", 0, c, 0) === -1));
check("a boost adds two: a boosted 9 beats a 10, draws with a Jack, loses to a Queen", L.duel("9", 1, "10", 0) === 1 && L.duel("9", 1, "J", 0) === 0 && L.duel("9", 1, "Q", 0) === -1);
check("a boost does not save a card from a Joker, or a Joker from a 2", L.duel("A", 1, "X1", 0) === -1 && L.duel("X1", 1, "2", 0) === -1 && L.duel("2", 0, "X1", 1) === 1);
check("the duel is the same seen from either side", L.CARDS.every((a) => L.CARDS.every((b) => [0, 1].every((x) => [0, 1].every((y) => L.duel(a, x, b, y) === -L.duel(b, y, a, x))))));

const sixteen = Array.from({ length: 16 }, (_, i) => i + 1);
const rs = L.rounds(sixteen);
const met = new Set();
let clean = rs.length === 15;
rs.forEach((pairs) => { const seen = new Set(); if (pairs.length !== 8) clean = false; pairs.forEach(([a, b]) => { if (seen.has(a) || seen.has(b)) clean = false; seen.add(a); seen.add(b); met.add(Math.min(a, b) + "-" + Math.max(a, b)); }); });
check("sixteen players: fifteen rounds of eight duels, and every pair meets exactly once", clean && met.size === 120);
check("that is five stages of three opponents, the same fifteen cards for fifteen opponents", L.stageCount(sixteen) === 5 && sixteen.every((n) => { const s = L.stagesFor(sixteen, n); return s.length === 5 && s.every((x) => x.length === 3) && new Set(s.flat()).size === 15 && !s.flat().includes(n); }));
check("opponents agree: if 3 meets 9 in a stage, 9 meets 3 in that stage", sixteen.every((n) => L.stagesFor(sixteen, n).every((opps, i) => opps.every((o) => L.stagesFor(sixteen, o)[i].includes(n)))));
const thirteen = sixteen.slice(0, 13);
check("with thirteen players everyone still meets everyone once, with a rest", thirteen.every((n) => new Set(L.stagesFor(thirteen, n).flat()).size === 12) && L.stageCount(thirteen) === 5);
check("a player who seals nothing plays their lowest cards", L.lowest(["K", "4", "X1", "2", "9"], 3).join() === "2,4,9");

// a whole game played at random: the table adds up and someone is last
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const hands = {}; sixteen.forEach((n) => { hands[n] = L.CARDS.slice().sort(() => rnd() - 0.5); });
const duels = [];
rs.forEach((pairs) => pairs.forEach(([a, b]) => duels.push({ a, b, ca: hands[a].pop(), cb: hands[b].pop(), ba: 0, bb: 0 })));
const tab = L.table(sixteen, duels);
check("every card is played once, points add up to zero, and each player has fifteen results", sixteen.every((n) => hands[n].length === 0) && tab.reduce((s, r) => s + r.pts, 0) === 0 && tab.every((r) => r.w + r.l + r.t === 15 && r.pts === r.w - r.l));
check("the table runs from most points to fewest", tab.every((r, i) => i === 0 || tab[i - 1].pts >= r.pts));
const lp = L.lastPlace(sixteen, duels);
check("someone is last", lp.last.includes(tab[15].n) && (lp.out === null || lp.last.includes(lp.out)));
const two = [{ a: 1, b: 2, ca: "K", cb: "3", ba: 0, bb: 0 }, { a: 1, b: 3, ca: "2", cb: "9", ba: 0, bb: 0 }, { a: 2, b: 3, ca: "5", cb: "5", ba: 0, bb: 0 }, { a: 3, b: 4, ca: "4", cb: "A", ba: 0, bb: 0 }, { a: 4, b: 1, ca: "6", cb: "6", ba: 0, bb: 0 }, { a: 4, b: 2, ca: "8", cb: "7", ba: 0, bb: 0 }];
const lp2 = L.lastPlace([1, 2, 3, 4], two);
check("level on points for last: the result between the tied players decides", JSON.stringify(L.table([1, 2, 3, 4], two).map((r) => r.pts)) === "[2,0,0,-2]" && lp2.out === 2);
console.log(failed ? failed + " FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
