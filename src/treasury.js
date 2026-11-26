// The treasury: sixteen wiring puzzles, one for each character of a passcode the GM chooses.
// A puzzle is a board of wire pieces, 7 across and 9 down. Every piece can be turned. It is solved when
// current from the battery reaches every piece and no wire is left with a loose end. The pieces that
// sit on the letter then glow, and the letter can be read.
// Nothing here holds a passcode: the boards are made on the server when the GM opens the treasury.

export const W = 7, H = 9, CELLS = W * H;
export const SOURCE = 4 * W + 3; // the battery, in the middle of the board

// Letters, 7 rows of 5.
const GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"], B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"], D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"], F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"], H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"], J: ["00111", "00001", "00001", "00001", "00001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"], L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"], N: ["10001", "11001", "10101", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"], P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"], R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"], T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"], V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"], X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"], Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// A piece is four bits: a wire to the north (1), east (2), south (4) and west (8).
const DIRS = [[1, 0, -1, 4], [2, 1, 0, 8], [4, 0, 1, 1], [8, -1, 0, 2]]; // bit, dx, dy, the bit facing back
export const turn = (m) => ((m << 1) & 15) | (m >> 3); // a quarter turn clockwise
export const samePiece = (a, b) => { for (let k = 0, m = a; k < 4; k++, m = turn(m)) if (m === b) return true; return false; };

// Which squares of the board the letter covers: W * H characters, "1" on the letter.
export function mask(letter) {
  const g = GLYPHS[letter];
  if (!g) return null;
  let out = "";
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out += y >= 1 && y <= 7 && x >= 1 && x <= 5 && g[y - 1][x - 1] === "1" ? "1" : "0";
  return out;
}

// Is the board finished? Every wire end meets another, and current from the battery reaches every piece.
export function powered(cells) {
  const seen = new Uint8Array(CELLS);
  const stack = [SOURCE];
  seen[SOURCE] = 1;
  let loose = 0;
  for (let i = 0; i < CELLS; i++) {
    const x = i % W, y = (i - x) / W;
    for (const [bit, dx, dy, back] of DIRS) {
      if (!(cells[i] & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !(cells[ny * W + nx] & back)) loose += 1;
    }
  }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i - x) / W;
    for (const [bit, dx, dy, back] of DIRS) {
      if (!(cells[i] & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if ((cells[j] & back) && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
  }
  let lit = 0;
  for (let i = 0; i < CELLS; i++) lit += seen[i];
  return { lit, loose, done: lit === CELLS && loose === 0, seen };
}

// One letter as a board. The wires form a single network with no loops. They are laid so that the letter's
// squares are wired to each other first, which makes the letter stand out once it glows. Every seed gives a
// different board, so two players who hold the same letter still get different puzzles.
// Returns { sol, start, mask }: the finished board, the board as dealt (every piece turned at random), and the letter's squares.
export function board(letter, seed) {
  const m = mask(letter);
  if (!m) return null;
  const rand = rng(seed * 7919 + letter.charCodeAt(0) * 104729);
  const edges = [];
  for (let i = 0; i < CELLS; i++) {
    const x = i % W, y = (i - x) / W;
    if (x + 1 < W) edges.push([i, i + 1, 2, 8, (m[i] === m[i + 1] ? 0 : 10) + rand()]);
    if (y + 1 < H) edges.push([i, i + W, 4, 1, (m[i] === m[i + W] ? 0 : 10) + rand()]);
  }
  edges.sort((a, b) => a[4] - b[4]);
  const parent = Array.from({ length: CELLS }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const sol = new Array(CELLS).fill(0);
  for (const [a, b, ba, bb] of edges) {
    const ra = find(a), rb = find(b);
    if (ra === rb) continue;
    parent[ra] = rb;
    sol[a] |= ba; sol[b] |= bb;
  }
  let start;
  do {
    start = sol.map((p) => { let q = p; for (let k = Math.floor(rand() * 4); k > 0; k--) q = turn(q); return q; });
  } while (powered(start).lit > CELLS / 3);
  return { sol: hex(sol), start: hex(start), mask: m };
}

export const hex = (cells) => cells.map((c) => c.toString(16)).join("");
export const unhex = (text) => String(text).split("").map((c) => parseInt(c, 16));
export const isBoard = (text) => typeof text === "string" && text.length === CELLS && /^[0-9a-f]+$/.test(text);

// Solve a dealt board: a finished arrangement of the same pieces, or null. Used by the tests.
export function solve(start) {
  const pieces = unhex(start), cells = new Array(CELLS).fill(0);
  const options = pieces.map((p) => { const o = []; for (let k = 0, q = p; k < 4; k++, q = turn(q)) if (!o.includes(q)) o.push(q); return o; });
  let steps = 0;
  const go = (i) => {
    if (i === CELLS) return powered(cells).done;
    if (++steps > 4e6) return false;
    const x = i % W, y = (i - x) / W;
    for (const q of options[i]) {
      if (!!(q & 8) !== (x > 0 && !!(cells[i - 1] & 2))) continue;
      if (!!(q & 1) !== (y > 0 && !!(cells[i - W] & 4))) continue;
      if (x === W - 1 && (q & 2)) continue;
      if (y === H - 1 && (q & 4)) continue;
      cells[i] = q;
      if (go(i + 1)) return true;
    }
    cells[i] = 0;
    return false;
  };
  return go(0) ? hex(cells) : null;
}

export function letters(text) {
  return String(text || "").toUpperCase().replace(/[^A-Z]/g, "");
}
