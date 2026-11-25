// Dark Post: the daily puzzle. Every puzzle is made from a seed, so one player sees the same
// puzzle all day, and every player gets different numbers. A copied answer is worth nothing.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));

// The kinds take turns in this order. "sums" and "sequence" are retired: the GM found them plain arithmetic.
export const TYPES = ["code", "keys", "cipher"];

// ----- crack the code: three different digits, and clues that leave exactly one answer -----

const CODES = [];
for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) if (a !== b && b !== c && a !== c) CODES.push([a, b, c]);

function score(secret, guess) {
  let place = 0;
  let digit = 0;
  for (let i = 0; i < 3; i++) {
    if (guess[i] === secret[i]) place += 1;
    else if (secret.includes(guess[i])) digit += 1;
  }
  return [place, digit];
}

function code(r) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const secret = pick(r, CODES);
    let left = CODES;
    const clues = [];
    for (let guard = 0; guard < 300 && left.length > 1 && clues.length < 6; guard++) {
      const g = pick(r, CODES);
      const fb = score(secret, g);
      if (fb[0] === 3 || fb[0] + fb[1] === 3) continue; // never hand over all three digits in one clue
      const next = left.filter((c) => {
        const s = score(c, g);
        return s[0] === fb[0] && s[1] === fb[1];
      });
      if (next.length === left.length) continue;
      clues.push({ guess: g.join(""), place: fb[0], digit: fb[1] });
      left = next;
    }
    if (left.length === 1 && clues.length >= 3) {
      return { type: "code", title: "Crack the code", ask: "The code has three different digits, from 1 to 9. What is it?", data: { clues }, answer: secret.join("") };
    }
  }
  return { type: "code", title: "Crack the code", ask: "The code has three different digits, from 1 to 9. What is it?", data: { clues: [{ guess: "123", place: 3, digit: 0 }] }, answer: "123" };
}

// ----- the six keys: clues about the order they are used in, and exactly one order fits -----

const ORDERS = [];
(function build(done, left) {
  if (!left.length) return void ORDERS.push(done);
  left.forEach((k, i) => build(done.concat(k), left.slice(0, i).concat(left.slice(i + 1))));
})([], [1, 2, 3, 4, 5, 6]);

// Does this order of keys agree with the clue? at(k) is when key k is used, 0 for first.
export function keyClueFits(order, c) {
  const a = order.indexOf(c.a);
  const b = c.b == null ? -1 : order.indexOf(c.b);
  if (c.k === "before") return a < b;
  if (c.k === "next") return b === a + 1;
  if (c.k === "apart") return Math.abs(a - b) !== 1;
  if (c.k === "gap") return Math.abs(a - b) === c.n + 1;
  if (c.k === "ends") return a === 0 || a === 5;
  if (c.k === "mid") return a !== 0 && a !== 5;
  if (c.k === "early") return a < 3;
  if (c.k === "late") return a > 2;
  return false;
}

const COUNT = ["", "one key is", "two keys are", "three keys are"];
export function keyClueText(c) {
  if (c.k === "before") return "Key " + c.a + " is used before key " + c.b + ".";
  if (c.k === "next") return "Key " + c.b + " is used right after key " + c.a + ".";
  if (c.k === "apart") return "Keys " + c.a + " and " + c.b + " are not used one after the other.";
  if (c.k === "gap") return "Exactly " + COUNT[c.n] + " used between keys " + c.a + " and " + c.b + ".";
  if (c.k === "ends") return "Key " + c.a + " is used first or last.";
  if (c.k === "mid") return "Key " + c.a + " is not used first or last.";
  if (c.k === "early") return "Key " + c.a + " is one of the first three used.";
  return "Key " + c.a + " is one of the last three used.";
}

// No more than this many clues of each kind, so no single kind does all the work.
const KEY_LIMITS = { before: 3, next: 1, apart: 2, gap: 2, ends: 1, mid: 1, early: 1, late: 1 };
const KEYS_ASK = "Type the six numbers in the order the keys are used.";

function keysPuzzle(secret, clues) {
  const lines = clues.map(keyClueText);
  return {
    type: "keys",
    title: "The six keys",
    // the long form, with every clue in it, is what a page loaded before this kind existed can still show
    ask: "Six keys, numbered 1 to 6, open the vault only when used in the right order. " + lines.join(" ") + " " + KEYS_ASK,
    data: { clues, lines, ask: KEYS_ASK, terms: [] },
    answer: secret.join(""),
  };
}

function keys(r) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const secret = pick(r, ORDERS);
    // every true thing that could be said about this order
    const pool = [];
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        if (a === b) continue;
        pool.push({ k: "before", a, b }, { k: "next", a, b });
        if (a < b) {
          pool.push({ k: "apart", a, b });
          for (let n = 1; n <= 3; n++) pool.push({ k: "gap", a, b, n });
        }
      }
      pool.push({ k: "ends", a }, { k: "mid", a }, { k: "early", a }, { k: "late", a });
    }
    const truths = pool.filter((c) => keyClueFits(secret, c));
    for (let i = truths.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [truths[i], truths[j]] = [truths[j], truths[i]];
    }
    let left = ORDERS;
    let clues = [];
    const used = {};
    for (const c of truths) {
      if (left.length === 1 || clues.length >= 8) break;
      if ((used[c.k] || 0) >= KEY_LIMITS[c.k]) continue;
      const next = left.filter((o) => keyClueFits(o, c));
      if (next.length === left.length) continue;
      clues.push(c);
      used[c.k] = (used[c.k] || 0) + 1;
      left = next;
    }
    if (left.length !== 1) continue;
    // drop any clue the others make unnecessary: a puzzle with nothing spare is the one worth solving
    for (let i = clues.length - 1; i >= 0; i--) {
      const rest = clues.filter((_, j) => j !== i);
      if (ORDERS.filter((o) => rest.every((c) => keyClueFits(o, c))).length === 1) clues = rest;
    }
    const named = new Set();
    clues.forEach((c) => { named.add(c.a); if (c.b != null) named.add(c.b); });
    // five to seven clues; every key but at most one is named
    if (clues.length < 5 || clues.length > 7 || named.size < 5) continue;
    return keysPuzzle(secret, clues);
  }
  return keysPuzzle([2, 4, 1, 6, 3, 5], [{ k: "next", a: 2, b: 4 }, { k: "next", a: 4, b: 1 }, { k: "next", a: 1, b: 6 }, { k: "next", a: 6, b: 3 }, { k: "next", a: 3, b: 5 }]);
}

// ----- three shapes, three sums -----

function sums(r) {
  let a, b, c;
  do {
    a = int(r, 1, 9);
    b = int(r, 1, 9);
    c = int(r, 1, 9);
  } while (a === b || b === c || a === c);
  return {
    type: "sums",
    title: "Weigh the shapes",
    ask: "Each shape is a whole number. Multiply the three together. What do you get?",
    data: { rows: [{ shapes: ["a", "a", "b"], sum: 2 * a + b }, { shapes: ["b", "b", "c"], sum: 2 * b + c }, { shapes: ["c", "c", "a"], sum: 2 * c + a }] },
    answer: String(a * b * c),
  };
}

// ----- a word with every letter moved the same number of places -----

const WORDS = [
  "SHADOW", "LANTERN", "MIRROR", "SILENT", "COPPER", "TUNNEL", "HARBOR", "MARBLE", "WINTER", "SIGNAL", "VELVET", "RIDDLE",
  "MASKED", "BRIDGE", "COMPASS", "WHISPER", "FORTUNE", "SECRET", "GAMBLE", "BARGAIN", "TRAITOR", "LOYALTY", "VERDICT", "PHANTOM",
  "MIDNIGHT", "PASSAGE", "HIDDEN", "ORACLE", "CASTLE", "THRONE", "DAGGER", "GOLDEN", "SILVER", "ANCHOR", "GARDEN", "LADDER",
  "WINDOW", "BALCONY", "CURTAIN", "JOURNEY", "KINGDOM", "LIBRARY", "MONSTER", "NETWORK", "OUTLAW", "PRISON", "QUARTER", "RANSOM",
];

function cipher(r) {
  const word = pick(r, WORDS);
  const shift = int(r, 3, 23);
  const text = word.replace(/[A-Z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65));
  return { type: "cipher", title: "Break the cipher", ask: "Every letter was moved the same number of places along the alphabet. What is the word?", data: { text }, answer: word };
}

// ----- what comes next -----

function sequence(r) {
  const kind = int(r, 0, 3);
  const terms = [];
  if (kind === 0) {
    let t = int(r, 2, 9);
    let d = int(r, 1, 5);
    const e = int(r, 1, 4);
    for (let i = 0; i < 7; i++) {
      terms.push(t);
      t += d;
      d += e;
    }
  } else if (kind === 1) {
    let t = int(r, 1, 5);
    const k = int(r, 1, 6);
    for (let i = 0; i < 7; i++) {
      terms.push(t);
      t = i % 2 === 0 ? t * 2 : t + k;
    }
  } else if (kind === 2) {
    let a = int(r, 1, 6);
    let b = int(r, 1, 6);
    if (a === b) b += 1;
    for (let i = 0; i < 7; i++) {
      terms.push(a);
      [a, b] = [b, a + b];
    }
  } else {
    const k = int(r, 1, 9);
    for (let i = 1; i <= 7; i++) terms.push(i * i + k);
  }
  return { type: "sequence", title: "What comes next", ask: "One rule makes this row. What is the next number?", data: { terms: terms.slice(0, 6) }, answer: String(terms[6]) };
}

const MAKERS = { code, keys, sums, cipher, sequence };

export function makePuzzle(seedText, day) {
  const type = TYPES[((day % TYPES.length) + TYPES.length) % TYPES.length];
  return MAKERS[type](rng(seedOf(seedText)));
}

export function sameAnswer(given, answer) {
  const clean = (v) => String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean(given) !== "" && clean(given) === clean(answer);
}
