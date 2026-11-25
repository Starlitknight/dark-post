// Checks the daily puzzle maker: node tests/test_puzzles.mjs
// Every puzzle must be repeatable, must have one answer, and must differ between players.
import { makePuzzle, sameAnswer, TYPES, keyClueFits, keyClueText } from "../src/puzzles.js";

let failed = 0;
const check = (label, ok) => {
  console.log((ok ? "PASS  " : "FAIL  ") + label);
  if (!ok) failed += 1;
};

const codes = [];
for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) if (a !== b && b !== c && a !== c) codes.push("" + a + b + c);
const score = (secret, guess) => {
  let place = 0;
  let digit = 0;
  for (let i = 0; i < 3; i++) {
    if (guess[i] === secret[i]) place += 1;
    else if (secret.includes(guess[i])) digit += 1;
  }
  return place + "," + digit;
};

const orders = [];
(function build(done, left) {
  if (!left.length) return void orders.push(done);
  left.forEach((k, i) => build(done.concat(k), left.slice(0, i).concat(left.slice(i + 1))));
})([], [1, 2, 3, 4, 5, 6]);

let repeatable = true;
let oneAnswer = true;
let fair = true;
let count = 0;
const perDay = [];
for (let day = 0; day < 40; day++) {
  const answers = new Set();
  for (let n = 1; n <= 16; n++) {
    const seed = "salt:" + day + ":" + n;
    const p = makePuzzle(seed, day);
    count += 1;
    if (JSON.stringify(p) !== JSON.stringify(makePuzzle(seed, day))) repeatable = false;
    if (p.type !== TYPES[day % TYPES.length]) fair = false;
    answers.add(p.answer);
    if (p.type === "code") {
      const fits = codes.filter((c) => p.data.clues.every((k) => score(c, k.guess) === k.place + "," + k.digit));
      if (fits.length !== 1 || fits[0] !== p.answer) oneAnswer = false;
      if (p.data.clues.length < 3 || p.data.clues.length > 6) fair = false;
    } else if (p.type === "keys") {
      const fits = orders.filter((o) => p.data.clues.every((c) => keyClueFits(o, c)));
      if (fits.length !== 1 || fits[0].join("") !== p.answer) oneAnswer = false;
      if (p.data.clues.length < 5 || p.data.clues.length > 7 || p.data.clues.every((c) => c.k === "next")) fair = false;
      if (p.data.lines.join("|") !== p.data.clues.map(keyClueText).join("|") || !p.data.lines.every((line) => p.ask.includes(line))) fair = false;
    } else if (p.type === "sums") {
      const fits = [];
      for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) {
        if (2 * a + b === p.data.rows[0].sum && 2 * b + c === p.data.rows[1].sum && 2 * c + a === p.data.rows[2].sum) fits.push(String(a * b * c));
      }
      if (fits.length !== 1 || fits[0] !== p.answer) oneAnswer = false;
    } else if (p.type === "cipher") {
      if (p.data.text === p.answer || p.data.text.length !== p.answer.length) oneAnswer = false;
    } else if (p.data.terms.length !== 6 || !/^\d+$/.test(p.answer)) oneAnswer = false;
  }
  perDay.push(answers.size);
}
check(count + " puzzles: the same seed always makes the same puzzle", repeatable);
check("every code and every order of keys has exactly one answer", oneAnswer);
check("the kind of puzzle follows the day; codes give three to six clues, keys five to seven with none spare", fair);
check("the plain arithmetic kinds are retired", !TYPES.includes("sums") && !TYPES.includes("sequence") && TYPES[0] === "code" && TYPES[1] === "keys");
check("on any day, players hold many different answers (fewest: " + Math.min(...perDay) + " of 16)", Math.min(...perDay) >= 8);
check("answers ignore case, spaces and punctuation", sameAnswer(" mar-ble ", "MARBLE") && sameAnswer("1 2 0", "120") && !sameAnswer("", "") && !sameAnswer("121", "120"));
console.log(failed ? failed + " FAILED" : "ALL PASSED");
process.exit(failed ? 1 : 0);
