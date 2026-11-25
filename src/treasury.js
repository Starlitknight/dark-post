// The treasury: sixteen picture-logic puzzles, one for each character of a passcode the GM chooses.
// A puzzle is a 10 by 10 grid with number clues for every row and column. Solving it draws one letter.
// Nothing here holds a passcode: the grids are made on the server when the GM opens the treasury.

export const SIZE = 10;

// Letters, 8 rows tall and up to 8 wide.
const GLYPHS = {"A":["00011100","00111100","00111100","00110110","01100110","01111111","01100011","11000011"],"B":["1111110","1100110","1100110","1111110","1100110","1100111","1100110","1111110"],"C":["011111","111000","110000","110000","110000","110000","111000","011111"],"D":["11111100","11001110","11000110","11000111","11000111","11000110","11001110","11111100"],"E":["111111","110000","110000","111110","110000","110000","110000","111111"],"F":["111111","110000","110000","111110","110000","110000","110000","110000"],"G":["0011111","1110001","1100000","1100000","1100111","1100011","1110011","0111111"],"H":["1100011","1100011","1100011","1111111","1100011","1100011","1100011","1100011"],"I":["111111","001100","001100","001100","001100","001100","001100","111111"],"J":["001111","000011","000011","000011","000011","110011","110011","011110"],"K":["1100111","1101110","1111100","1111000","1111000","1101100","1100110","1100011"],"L":["110000","110000","110000","110000","110000","110000","110000","111111"],"M":["11000011","11100111","11111111","11011011","11000011","11000011","11000011","11000011"],"N":["1110011","1110011","1111011","1111011","1101111","1101111","1100111","1100011"],"O":["01111100","11100110","11000111","11000011","11000011","11000111","11100110","01111100"],"P":["1111110","1100110","1100111","1100110","1111110","1100000","1100000","1100000"],"Q":["00111100","01100110","11000011","11000011","11001011","11000110","01100110","00111011"],"R":["1111100","1100110","1100110","1100110","1111100","1100110","1100111","1100011"],"S":["011111","110001","110000","111110","011111","000011","100011","111110"],"T":["11111111","00011000","00011000","00011000","00011000","00011000","00011000","00011000"],"U":["1100011","1100011","1100011","1100011","1100011","1100011","1110111","0111110"],"V":["11000011","01100011","01100111","01100110","00110110","00111100","00111100","00011100"],"W":["10000001","10000001","10011001","10011001","10111101","11100111","11000011","10000001"],"X":["01100011","01110110","00111110","00011100","00011100","00111110","01100110","11100011"],"Y":["11100111","01100110","01111100","00111100","00011000","00011000","00011000","00011000"],"Z":["01111110","00001110","00001110","00011100","00111000","01110000","01110000","11111111"]};

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// The runs of filled squares along one line: [3, 1] means three together, a gap, then one.
export function runs(line) {
  const out = [];
  let k = 0;
  for (const c of line) { if (c) k += 1; else if (k) { out.push(k); k = 0; } }
  if (k) out.push(k);
  return out;
}

export function clues(grid) {
  const rows = grid.map((r) => runs(r));
  const cols = [];
  for (let x = 0; x < SIZE; x++) cols.push(runs(grid.map((r) => r[x])));
  return { rows, cols };
}

// Every way one line can be filled to match its clue and what is already known (1 filled, 0 empty, -1 unknown).
function fits(clue, known) {
  const n = known.length, out = [];
  const place = (i, pos, line) => {
    if (i === clue.length) {
      for (let p = pos; p < n; p++) if (known[p] === 1) return;
      out.push(line.concat(Array(n - pos).fill(0)));
      return;
    }
    const rest = clue.slice(i + 1).reduce((a, b) => a + b + 1, 0);
    for (let start = pos; start + clue[i] + rest <= n; start++) {
      let ok = true;
      for (let p = pos; p < start; p++) if (known[p] === 1) { ok = false; break; }
      if (!ok) break;
      for (let p = start; p < start + clue[i]; p++) if (known[p] === 0) { ok = false; break; }
      if (!ok) continue;
      const end = start + clue[i];
      if (end < n && known[end] === 1) continue;
      const next = line.concat(Array(start - pos).fill(0), Array(clue[i]).fill(1), end < n ? [0] : []);
      place(i + 1, Math.min(n, end + 1), next);
    }
  };
  place(0, 0, []);
  return out;
}

// Can the puzzle be finished by reasoning one line at a time, with no guessing? Returns the grid, or null.
export function lineSolve(c) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(-1));
  for (let pass = 0, moved = true; moved && pass < 60; pass++) {
    moved = false;
    for (let axis = 0; axis < 2; axis++) {
      for (let i = 0; i < SIZE; i++) {
        const known = axis ? g.map((r) => r[i]) : g[i].slice();
        const all = fits(axis ? c.cols[i] : c.rows[i], known);
        if (!all.length) return null;
        for (let p = 0; p < SIZE; p++) {
          if (known[p] !== -1) continue;
          const v = all[0][p];
          if (all.every((l) => l[p] === v)) { if (axis) g[p][i] = v; else g[i][p] = v; moved = true; }
        }
      }
    }
  }
  return g.every((r) => r.every((v) => v !== -1)) ? g : null;
}

// One letter as a puzzle. The letter sits in the middle; a broken frame around it is different for every
// seed, so two players who hold the same letter still get different puzzles. Only grids that can be solved
// by reasoning alone are kept.
export function letterGrid(letter, seed) {
  const glyph = GLYPHS[letter];
  if (!glyph) return null;
  const left = 1 + Math.floor((8 - glyph[0].length) / 2);
  for (let attempt = 0; attempt < 400; attempt++) {
    const rand = rng(seed * 7919 + attempt * 104729 + letter.charCodeAt(0));
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    glyph.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "1") g[y + 1][left + x] = 1; });
    for (let i = 0; i < SIZE; i++) {
      if (rand() < 0.45) g[0][i] = 1;
      if (rand() < 0.45) g[SIZE - 1][i] = 1;
      if (i > 0 && i < SIZE - 1) { if (rand() < 0.3 && !g[i][1]) g[i][0] = 1; if (rand() < 0.3 && !g[i][SIZE - 2]) g[i][SIZE - 1] = 1; }
    }
    const solved = lineSolve(clues(g));
    if (solved && solved.every((r, y) => r.every((v, x) => v === g[y][x]))) return g;
  }
  return null;
}

export function letters(text) {
  return String(text || "").toUpperCase().replace(/[^A-Z]/g, "");
}
