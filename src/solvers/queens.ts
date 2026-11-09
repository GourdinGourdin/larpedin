// Queens: N x N grid split into N colour regions. Place one queen per row,
// column and region; no two queens may touch, diagonals included.

export interface QueensPuzzle {
  size: number;
  /** region id per cell, row-major */
  regions: number[];
}

/** Returns the queen's column for each row, or null. */
export function solveQueens(p: QueensPuzzle): number[] | null {
  const N = p.size;
  const ids = [...new Set(p.regions)];
  const regionOf = p.regions.map((r) => ids.indexOf(r));
  const colUsed = new Uint8Array(N);
  const regUsed = new Uint8Array(ids.length);
  const cols = new Int32Array(N).fill(-1);

  // Branch on rows in order of fewest candidate cells first.
  const rowOrder = [...Array(N).keys()];
  const placed = new Uint8Array(N);

  const canPlace = (r: number, c: number) => {
    if (colUsed[c] || regUsed[regionOf[r * N + c]]) return false;
    for (const dr of [-1, 1]) {
      const rr = r + dr;
      if (rr >= 0 && rr < N && placed[rr] && Math.abs(cols[rr] - c) <= 1) return false;
    }
    return true;
  };

  // Every unused region must still have at least one legal cell.
  const regionsAlive = () => {
    const ok = new Uint8Array(ids.length);
    for (let r = 0; r < N; r++) {
      if (placed[r]) continue;
      for (let c = 0; c < N; c++) if (canPlace(r, c)) ok[regionOf[r * N + c]] = 1;
    }
    for (let i = 0; i < ids.length; i++) if (!regUsed[i] && !ok[i]) return false;
    return true;
  };

  const dfs = (depth: number): boolean => {
    if (depth === N) return true;
    let best = -1, bestCount = N + 1;
    for (const r of rowOrder) {
      if (placed[r]) continue;
      let count = 0;
      for (let c = 0; c < N; c++) if (canPlace(r, c)) count++;
      if (count < bestCount) { best = r; bestCount = count; }
    }
    if (bestCount === 0) return false;
    const r = best;
    for (let c = 0; c < N; c++) {
      if (!canPlace(r, c)) continue;
      placed[r] = 1; cols[r] = c; colUsed[c] = 1; regUsed[regionOf[r * N + c]] = 1;
      if (regionsAlive() && dfs(depth + 1)) return true;
      placed[r] = 0; cols[r] = -1; colUsed[c] = 0; regUsed[regionOf[r * N + c]] = 0;
    }
    return false;
  };

  return dfs(0) ? Array.from(cols) : null;
}

export function checkQueens(p: QueensPuzzle, cols: number[]): boolean {
  const N = p.size;
  if (cols.length !== N || new Set(cols).size !== N) return false;
  if (new Set(cols.map((c, r) => p.regions[r * N + c])).size !== N) return false;
  return cols.every((c, r) => r === 0 || Math.abs(cols[r - 1] - c) > 1);
}
