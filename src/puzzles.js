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

export const TYPES = ["code", "sums", "cipher", "sequence"];

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

const MAKERS = { code, sums, cipher, sequence };

export function makePuzzle(seedText, day) {
  const type = TYPES[((day % TYPES.length) + TYPES.length) % TYPES.length];
  return MAKERS[type](rng(seedOf(seedText)));
}

export function sameAnswer(given, answer) {
  const clean = (v) => String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean(given) !== "" && clean(given) === clean(answer);
}
