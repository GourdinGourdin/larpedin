// Tango: fill an N x N grid (N even) with two symbols. Each row and column has
// N/2 of each; never three of the same in a row; '=' links need equal symbols,
// 'x' links need opposite ones.

export interface TangoPuzzle {
  size: number;
  /** pre-filled cells: index -> 0 | 1 */
  given: Record<number, number>;
  /** [cellA, cellB, '=' | 'x'] */
  edges: [number, number, '=' | 'x'][];
}

export function solveTango(p: TangoPuzzle): number[] | null {
  const N = p.size;
  const n = N * N;
  const half = N / 2;
  const g = new Int8Array(n).fill(-1);
  for (const [c, v] of Object.entries(p.given)) g[+c] = v;
  const links: [number, boolean][][] = Array.from({ length: n }, () => []);
  for (const [a, b, t] of p.edges) {
    links[a].push([b, t === '=']);
    links[b].push([a, t === '=']);
  }

  const lineOk = (cells: number[]) => {
    let c0 = 0, c1 = 0;
    for (let i = 0; i < cells.length; i++) {
      const v = g[cells[i]];
      if (v === 0) c0++; else if (v === 1) c1++;
      if (i >= 2 && v >= 0 && v === g[cells[i - 1]] && v === g[cells[i - 2]]) return false;
    }
    return c0 <= half && c1 <= half;
  };
  const row = (r: number) => Array.from({ length: N }, (_, i) => r * N + i);
  const col = (c: number) => Array.from({ length: N }, (_, i) => i * N + c);

  const ok = (c: number) => {
    for (const [o, eq] of links[c]) if (g[o] >= 0 && (g[o] === g[c]) !== eq) return false;
    return lineOk(row(Math.floor(c / N))) && lineOk(col(c % N));
  };

  // Simple propagation: fill forced cells, report contradiction.
  const propagate = (trail: number[]): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let c = 0; c < n; c++) {
        if (g[c] >= 0) continue;
        let legal = -1, count = 0;
        for (const v of [0, 1]) {
          g[c] = v;
          if (ok(c)) { legal = v; count++; }
        }
        g[c] = -1;
        if (count === 0) return false;
        if (count === 1) { g[c] = legal; trail.push(c); changed = true; }
      }
    }
    return true;
  };

  for (let c = 0; c < n; c++) if (g[c] >= 0 && !ok(c)) return null;

  const dfs = (): boolean => {
    const trail: number[] = [];
    if (!propagate(trail)) { for (const c of trail) g[c] = -1; return false; }
    const c = g.indexOf(-1);
    if (c < 0) return true;
    for (const v of [0, 1]) {
      g[c] = v;
      if (ok(c) && dfs()) return true;
    }
    g[c] = -1;
    for (const t of trail) g[t] = -1;
    return false;
  };

  return dfs() ? Array.from(g) : null;
}

export function checkTango(p: TangoPuzzle, s: number[]): boolean {
  const N = p.size;
  if (s.length !== N * N || s.some((v) => v !== 0 && v !== 1)) return false;
  for (const [c, v] of Object.entries(p.given)) if (s[+c] !== v) return false;
  for (const [a, b, t] of p.edges) if ((s[a] === s[b]) !== (t === '=')) return false;
  for (let i = 0; i < N; i++) {
    for (const line of [
      Array.from({ length: N }, (_, j) => s[i * N + j]),
      Array.from({ length: N }, (_, j) => s[j * N + i]),
    ]) {
      if (line.filter((v) => v === 1).length !== N / 2) return false;
      for (let j = 2; j < N; j++) if (line[j] === line[j - 1] && line[j] === line[j - 2]) return false;
    }
  }
  return true;
}
