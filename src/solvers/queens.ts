// Queens: N x N grid split into N colour regions. Place one queen per row,
// column and region; no two queens may touch, diagonals included.
//
// Solver: per-row column bitmasks of candidate cells, constraint propagation
// to a fixpoint, then DFS on the most constrained row / column / region.
// Propagation, cheapest first:
//   1. a row with one candidate holds a queen: clear its column, its region
//      and the touching cells in the rows above and below;
//      a column or region with one candidate cell holds a queen.
//   2. Hall / pigeonhole between rows, columns and regions: if k regions only
//      have cells in k rows, those rows are theirs, so every other region's
//      cells in those rows go (k = 1 is "region confined to a row"). The same
//      for regions vs columns, rows vs columns, and the duals.
//   3. a cell whose queen would leave some other row, column or region without
//      a candidate cell is eliminated.
// Supports N <= 32 (one 32-bit mask per row).

export interface QueensPuzzle {
  size: number;
  /** region id per cell, row-major */
  regions: number[];
}

interface Model {
  N: number;
  /** all N column bits */
  full: number;
  /** region index (0..N-1) per cell */
  cellRegion: Int32Array;
  /** regRow[k * N + r]: column mask of region k's cells in row r */
  regRow: Int32Array;
}

const popcount = (x: number) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};
/** index of the lowest set bit */
const ctz = (x: number) => 31 - Math.clz32(x & -x);
const single = (x: number) => x !== 0 && (x & (x - 1)) === 0;

function buildModel(p: QueensPuzzle): Model | null {
  const N = p.size;
  if (!Number.isInteger(N) || N < 1 || N > 32 || p.regions.length !== N * N) return null;
  const index = new Map<number, number>();
  for (const id of p.regions) if (!index.has(id)) index.set(id, index.size);
  // One queen per row and per region: exactly N regions are needed.
  if (index.size !== N) return null;
  const cellRegion = new Int32Array(N * N);
  const regRow = new Int32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const k = index.get(p.regions[i])!;
    cellRegion[i] = k;
    regRow[k * N + Math.floor(i / N)] |= 1 << (i % N);
  }
  return { N, full: N === 32 ? -1 : (1 << N) - 1, cellRegion, regRow };
}

/**
 * Search state: cand[r] = candidate columns of row r for r < N;
 * cand[N] = mask of rows whose single candidate has already been propagated.
 */
type State = Int32Array;

// Scratch buffers, sized for the largest N.
const unitMask = new Int32Array(32);
const remove = new Int32Array(32);
const regCells = new Int32Array(32 * 32);
const regSpan = new Int32Array(32);

/** Largest slot set built from a pair of units that hall() tries. */
const HALL_PAIR_MAX = 4;
const pairUnits = new Int32Array(32);

/**
 * Hall's theorem on a perfect matching between N units and N slots, where
 * unitMask[i] is the set of slots unit i may take. For a slot set S, the
 * units that fit in S must be at most |S|; if they are exactly |S|, no other
 * unit may use S. Tries S = each unit's mask, and the union of each pair of
 * units with 2+ slots when it has at most HALL_PAIR_MAX slots.
 * Fills remove[i] with slots to drop from unit i. Returns false on contradiction.
 */
function hall(N: number): boolean {
  remove.fill(0, 0, N);
  const tryS = (S: number, size: number) => {
    let inside = 0;
    for (let i = 0; i < N; i++) if ((unitMask[i] & ~S) === 0) inside++;
    if (inside > size) return false;
    if (inside === size) {
      for (let i = 0; i < N; i++) if ((unitMask[i] & ~S) !== 0) remove[i] |= unitMask[i] & S;
    }
    return true;
  };
  let n = 0;
  for (let i = 0; i < N; i++) {
    const a = unitMask[i], size = popcount(a);
    if (size < N && !tryS(a, size)) return false;
    if (size > 1 && size < HALL_PAIR_MAX) pairUnits[n++] = a;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = pairUnits[i], b = pairUnits[j], S = a | b;
      if (S === a || S === b) continue;
      const size = popcount(S);
      if (size <= HALL_PAIR_MAX && size < N && !tryS(S, size)) return false;
    }
  }
  return true;
}

/** Propagate to a fixpoint. Returns false if the state has no solution. */
function propagate(m: Model, s: State): boolean {
  const { N, full, regRow, cellRegion } = m;
  for (;;) {
    // ---- 1. singles ----
    let changed = false;
    for (let r = 0; r < N; r++) {
      const b = s[r];
      if (b === 0) return false;
      if ((s[N] >> r) & 1 || !single(b)) continue;
      s[N] |= 1 << r;
      const k = cellRegion[r * N + ctz(b)];
      const near = b | (b << 1) | (b >>> 1);
      for (let r2 = 0; r2 < N; r2++) {
        if (r2 === r) continue;
        const kill = (r2 === r - 1 || r2 === r + 1 ? near : b) | regRow[k * N + r2];
        const v = s[r2] & ~kill;
        if (v === 0) return false;
        if (v !== s[r2]) { s[r2] = v; changed = true; }
      }
    }
    if (changed) continue;
    // columns: rows that can still use each column
    for (let c = 0; c < N; c++) {
      let rows = 0;
      for (let r = 0; r < N; r++) if ((s[r] >>> c) & 1) rows |= 1 << r;
      if (rows === 0) return false;
      if (single(rows)) {
        const r = ctz(rows);
        if (s[r] !== 1 << c) { s[r] = 1 << c; changed = true; }
      }
      unitMask[c] = rows;
    }
    if (changed) continue;
    for (let k = 0; k < N; k++) {
      let count = 0, last = -1;
      for (let r = 0; r < N; r++) {
        const n = popcount(s[r] & regRow[k * N + r]);
        if (n) { count += n; last = r; }
      }
      if (count === 0) return false;
      if (count === 1) {
        const b = s[last] & regRow[k * N + last];
        if (s[last] !== b) { s[last] = b; changed = true; }
      }
    }
    if (changed) continue;

    // ---- 2. Hall / pigeonhole ----
    // columns -> rows (unitMask already holds each column's rows)
    if (!hall(N)) return false;
    for (let c = 0; c < N; c++) {
      const rm = remove[c];
      if (!rm) continue;
      for (let r = 0; r < N; r++) if ((rm >>> r) & 1 && (s[r] >>> c) & 1) { s[r] &= ~(1 << c); changed = true; }
    }
    if (changed) continue;
    // rows -> columns
    for (let r = 0; r < N; r++) unitMask[r] = s[r];
    if (!hall(N)) return false;
    for (let r = 0; r < N; r++) if (remove[r]) { s[r] &= ~remove[r]; changed = true; }
    if (changed) continue;
    // regions -> rows
    for (let k = 0; k < N; k++) {
      let rows = 0;
      for (let r = 0; r < N; r++) if (s[r] & regRow[k * N + r]) rows |= 1 << r;
      unitMask[k] = rows;
    }
    if (!hall(N)) return false;
    for (let k = 0; k < N; k++) {
      const rm = remove[k];
      if (!rm) continue;
      for (let r = 0; r < N; r++) {
        if ((rm >>> r) & 1) { s[r] &= ~regRow[k * N + r]; changed = true; }
      }
    }
    if (changed) continue;
    // regions -> columns
    for (let k = 0; k < N; k++) {
      let cols = 0;
      for (let r = 0; r < N; r++) cols |= s[r] & regRow[k * N + r];
      unitMask[k] = cols;
    }
    if (!hall(N)) return false;
    for (let k = 0; k < N; k++) {
      const rm = remove[k];
      if (!rm) continue;
      for (let r = 0; r < N; r++) {
        const v = s[r] & ~(rm & regRow[k * N + r]);
        if (v !== s[r]) { s[r] = v; changed = true; }
      }
    }
    if (changed) continue;
    // rows -> regions
    for (let r = 0; r < N; r++) {
      let regs = 0;
      for (let b = s[r]; b; b &= b - 1) regs |= 1 << cellRegion[r * N + ctz(b)];
      unitMask[r] = regs;
    }
    if (!hall(N)) return false;
    for (let r = 0; r < N; r++) {
      for (let rm = remove[r]; rm; rm &= rm - 1) s[r] &= ~regRow[ctz(rm) * N + r];
      if (remove[r]) changed = true;
    }
    if (changed) continue;
    // columns -> regions
    for (let c = 0; c < N; c++) unitMask[c] = 0;
    for (let r = 0; r < N; r++) {
      for (let b = s[r]; b; b &= b - 1) {
        const c = ctz(b);
        unitMask[c] |= 1 << cellRegion[r * N + c];
      }
    }
    if (!hall(N)) return false;
    for (let c = 0; c < N; c++) {
      const rm = remove[c];
      if (!rm) continue;
      for (let r = 0; r < N; r++) {
        if ((s[r] >>> c) & 1 && (rm >>> cellRegion[r * N + c]) & 1) { s[r] &= ~(1 << c); changed = true; }
      }
    }
    if (changed) continue;

    // ---- 3. cells whose queen would empty another row, column or region ----
    // Snapshot each region's cells per row; cells only ever disappear, so a
    // stale snapshot can only make a region look alive (never unsound).
    for (let k = 0; k < N; k++) {
      let span = 0;
      for (let r = 0; r < N; r++) {
        const v = s[r] & regRow[k * N + r];
        regCells[k * N + r] = v;
        if (v) span |= 1 << r;
      }
      regSpan[k] = span;
    }
    for (let r = 0; r < N; r++) {
      if ((s[N] >> r) & 1) continue;
      for (let bits = s[r]; bits; bits &= bits - 1) {
        const b = bits & -bits;
        const k0 = cellRegion[r * N + ctz(b)];
        const near = b | (b << 1) | (b >>> 1);
        let colsLeft = b, ok = true;
        // rows and columns
        for (let r2 = 0; r2 < N && ok; r2++) {
          if (r2 === r) continue;
          const kill = (r2 === r - 1 || r2 === r + 1 ? near : b) | regRow[k0 * N + r2];
          const v = s[r2] & ~kill;
          if (v === 0) ok = false;
          colsLeft |= v;
        }
        ok &&= colsLeft === full;
        // other regions: alive if they keep a cell outside row r and the attack
        for (let k = 0; k < N && ok; k++) {
          if (k === k0) continue;
          let alive = false;
          for (let sp = regSpan[k] & ~(1 << r); sp && !alive; sp &= sp - 1) {
            const r2 = ctz(sp);
            alive = (regCells[k * N + r2] & ~(r2 === r - 1 || r2 === r + 1 ? near : b)) !== 0;
          }
          ok = alive;
        }
        if (ok) continue;
        s[r] &= ~b;
        changed = true;
      }
      if (s[r] === 0) return false;
    }
    if (!changed) return true;
  }
}

/** Depth-first search; calls onSolution for each solution until it returns true. */
function search(m: Model, s: State, onSolution: (cols: number[]) => boolean): boolean {
  if (!propagate(m, s)) return false;
  const { N, regRow } = m;
  if (s[N] === m.full) {
    const cols: number[] = [];
    for (let r = 0; r < N; r++) cols.push(ctz(s[r]));
    return onSolution(cols);
  }
  // Branch on the unplaced row, column or region with the fewest cells.
  let best = 33, kind = 0, unit = -1;
  for (let r = 0; r < N; r++) {
    const n = popcount(s[r]);
    if (n > 1 && n < best) { best = n; kind = 0; unit = r; }
  }
  for (let c = 0; c < N && best > 2; c++) {
    let n = 0;
    for (let r = 0; r < N; r++) n += (s[r] >>> c) & 1;
    if (n > 1 && n < best) { best = n; kind = 1; unit = c; }
  }
  for (let k = 0; k < N && best > 2; k++) {
    let n = 0;
    for (let r = 0; r < N; r++) n += popcount(s[r] & regRow[k * N + r]);
    if (n > 1 && n < best) { best = n; kind = 2; unit = k; }
  }
  for (let r = 0; r < N; r++) {
    let bits = kind === 0 ? (r === unit ? s[r] : 0)
      : kind === 1 ? s[r] & (1 << unit)
      : s[r] & regRow[unit * N + r];
    for (; bits; bits &= bits - 1) {
      const child = s.slice();
      child[r] = bits & -bits;
      if (search(m, child, onSolution)) return true;
    }
  }
  return false;
}

function initialState(m: Model): State {
  const s = new Int32Array(m.N + 1).fill(m.full);
  s[m.N] = 0;
  return s;
}

/** Returns the queen's column for each row, or null. */
export function solveQueens(p: QueensPuzzle): number[] | null {
  const m = buildModel(p);
  if (!m) return null;
  let found: number[] | null = null;
  search(m, initialState(m), (cols) => { found = cols; return true; });
  return found;
}

/** Up to `limit` distinct solutions (2 is enough to tell a unique puzzle). */
export function solveAllQueens(p: QueensPuzzle, limit = 2): number[][] {
  const m = buildModel(p);
  if (!m) return [];
  const out: number[][] = [];
  search(m, initialState(m), (cols) => out.push(cols) >= limit);
  return out;
}

/** Counts solutions, stopping once `limit` are found. */
export const countQueens = (p: QueensPuzzle, limit = 2) => solveAllQueens(p, limit).length;

export function checkQueens(p: QueensPuzzle, cols: number[]): boolean {
  const N = p.size;
  if (cols.length !== N || new Set(cols).size !== N) return false;
  if (!cols.every((c) => Number.isInteger(c) && c >= 0 && c < N)) return false;
  if (new Set(cols.map((c, r) => p.regions[r * N + c])).size !== N) return false;
  return cols.every((c, r) => r === 0 || Math.abs(cols[r - 1] - c) > 1);
}
