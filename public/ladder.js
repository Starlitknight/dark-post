// Dark Post, Game 1: The Ladder. The rules, and nothing else, so the server and the game share one copy.
//
// Every player holds the same fifteen cards: 2 to 10, Jack, Queen, King, Ace, and two Jokers.
// Every player meets every other player once, and plays one card against them. A card is played once.
// The higher card scores +1, the lower -1, equal cards 0.
// The Ace is high. A Joker beats every card except a 2. A 2 beats a Joker and nothing else.
// For one coin a player may add 2 to the power of a card, at most twice in the game. A boost never
// changes what a Joker or a 2 does to each other.
// The meetings are played in stages of three, so a player sees what everyone has used between stages.
(function (root) {
  var CARDS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "X1", "X2"];
  var RULES = { perStage: 3, boost: 2, boosts: 2, boostPrice: 1, prizes: [5, 3, 1] };

  function isJoker(c) { return c === "X1" || c === "X2"; }
  function label(c) { return isJoker(c) ? "Joker" : c; }
  // 2 is 2, the Ace is 14
  function power(c) { return isJoker(c) ? 99 : CARDS.indexOf(c) + 2; }

  // +1 if a wins, -1 if b wins, 0 if they are level
  function duel(a, aBoost, b, bBoost) {
    var ja = isJoker(a), jb = isJoker(b);
    if (ja && jb) return 0;
    if (ja) return b === "2" ? -1 : 1;
    if (jb) return a === "2" ? 1 : -1;
    var pa = power(a) + (aBoost ? RULES.boost : 0), pb = power(b) + (bBoost ? RULES.boost : 0);
    return pa > pb ? 1 : pa < pb ? -1 : 0;
  }

  // Who meets whom. Every pair meets once (the circle method). With an odd number, one player rests each round.
  // Returns rounds: each a list of [a, b] pairs of player numbers.
  function rounds(players) {
    var list = players.slice();
    if (list.length % 2) list.push(0); // 0 is nobody: a rest
    var m = list.length, out = [];
    for (var r = 0; r < m - 1; r++) {
      var pairs = [];
      for (var k = 0; k < m / 2; k++) {
        var a = list[k], b = list[m - 1 - k];
        if (a && b) pairs.push([a, b]);
      }
      out.push(pairs);
      list.splice(1, 0, list.pop()); // the first stays, the rest turn
    }
    return out;
  }

  // The opponents of one player, stage by stage.
  function stagesFor(players, n) {
    var mine = [];
    rounds(players).forEach(function (pairs) {
      pairs.forEach(function (p) { if (p[0] === n) mine.push(p[1]); else if (p[1] === n) mine.push(p[0]); });
    });
    var out = [];
    for (var i = 0; i < mine.length; i += RULES.perStage) out.push(mine.slice(i, i + RULES.perStage));
    return out;
  }

  function stageCount(players) {
    var m = players.length + (players.length % 2);
    return Math.ceil((m - 1) / RULES.perStage);
  }

  // A player who sealed nothing plays their lowest unused cards, lowest first, with no boost.
  function lowest(hand, count) {
    return hand.slice().sort(function (x, y) { return power(x) - power(y); }).slice(0, count);
  }

  // The table: points, wins, losses and draws, from every duel played so far.
  // duels: [{ a, b, ca, cb, ba, bb }] with a's card ca, b's card cb, and their boosts.
  function table(players, duels) {
    var rows = {};
    players.forEach(function (n) { rows[n] = { n: n, pts: 0, w: 0, l: 0, t: 0 }; });
    duels.forEach(function (d) {
      var r = duel(d.ca, d.ba, d.cb, d.bb);
      if (!rows[d.a] || !rows[d.b]) return;
      rows[d.a].pts += r; rows[d.b].pts -= r;
      if (r > 0) { rows[d.a].w += 1; rows[d.b].l += 1; } else if (r < 0) { rows[d.a].l += 1; rows[d.b].w += 1; } else { rows[d.a].t += 1; rows[d.b].t += 1; }
    });
    return players.map(function (n) { return rows[n]; }).sort(function (x, y) { return y.pts - x.pts || y.w - x.w || x.n - y.n; });
  }

  // Who is last. Level on points: the result between the tied players decides, then the fewest wins.
  // Returns { last: [numbers tied for last on points], out: number or null when still level }.
  function lastPlace(players, duels) {
    var rows = table(players, duels);
    var low = rows[rows.length - 1].pts;
    var tied = rows.filter(function (r) { return r.pts === low; }).map(function (r) { return r.n; });
    if (tied.length === 1) return { last: tied, out: tied[0] };
    var among = table(tied, duels.filter(function (d) { return tied.indexOf(d.a) >= 0 && tied.indexOf(d.b) >= 0; }));
    var worst = among[among.length - 1], next = among[among.length - 2];
    if (worst.pts < next.pts) return { last: tied, out: worst.n };
    var wins = {};
    rows.forEach(function (r) { wins[r.n] = r.w; });
    var level = among.filter(function (r) { return r.pts === worst.pts; }).map(function (r) { return r.n; });
    var fewest = Math.min.apply(null, level.map(function (n) { return wins[n]; }));
    var down = level.filter(function (n) { return wins[n] === fewest; });
    return { last: tied, out: down.length === 1 ? down[0] : null };
  }

  root.LADDER = { CARDS: CARDS, RULES: RULES, isJoker: isJoker, label: label, power: power, duel: duel, rounds: rounds, stagesFor: stagesFor, stageCount: stageCount, lowest: lowest, table: table, lastPlace: lastPlace };
})(typeof self !== "undefined" ? self : globalThis);
