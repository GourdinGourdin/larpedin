// Patches: split the grid into rectangles. Each rectangle holds exactly one
// clue cell and matches its shape (square, tall, wide or any) and, when the
// clue has a number, its area.

export type PatchShape = 'SQUARE' | 'VERTICAL' | 'HORIZONTAL' | 'ANY';

export interface PatchesClue {
  cell: number;
  shape: PatchShape;
  /** required area, 0 = any */
  size: number;
}

export interface PatchesPuzzle {
  rows: number;
  cols: number;
  clues: PatchesClue[];
}

/** Rectangle as [top, left, height, width]. */
export type Rect = [number, number, number, number];

export function parseShape(raw: string): PatchShape {
  const s = raw.toUpperCase();
  if (s.includes('SQUARE')) return 'SQUARE';
  if (s.includes('VERTICAL') || s.includes('TALL')) return 'VERTICAL';
  if (s.includes('HORIZONTAL') || s.includes('WIDE')) return 'HORIZONTAL';
  return 'ANY';
}

function shapeOk(shape: PatchShape, h: number, w: number) {
  switch (shape) {
    case 'SQUARE': return h === w;
    case 'VERTICAL': return h > w;
    case 'HORIZONTAL': return w > h;
    default: return true;
  }
}

export function solvePatches(p: PatchesPuzzle): Rect[] | null {
  const { rows, cols, clues } = p;
  const n = rows * cols;
  const clueAt = new Int32Array(n).fill(-1);
  clues.forEach((c, i) => (clueAt[c.cell] = i));

  // Candidate rectangles per clue, as cell lists.
  const cands: { rect: Rect; cells: number[] }[][] = clues.map((clue, ci) => {
    const cr = Math.floor(clue.cell / cols), cc = clue.cell % cols;
    const out: { rect: Rect; cells: number[] }[] = [];
    for (let t = 0; t <= cr; t++)
      for (let l = 0; l <= cc; l++)
        for (let b = cr; b < rows; b++)
          for (let r = cc; r < cols; r++) {
            const h = b - t + 1, w = r - l + 1;
            if (!shapeOk(clue.shape, h, w)) continue;
            if (clue.size && h * w !== clue.size) continue;
            const cells: number[] = [];
            let clean = true;
            for (let y = t; y <= b && clean; y++)
              for (let x = l; x <= r; x++) {
                const c = y * cols + x;
                if (clueAt[c] >= 0 && clueAt[c] !== ci) { clean = false; break; }
                cells.push(c);
              }
            if (clean) out.push({ rect: [t, l, h, w], cells });
          }
    return out;
  });

  const owner = new Int32Array(n).fill(-1);
  const chosen: (Rect | null)[] = clues.map(() => null);
  const fits = (cells: number[]) => cells.every((c) => owner[c] < 0);

  // Exact cover: take the first uncovered cell, try every unused clue's
  // rectangle that covers it.
  const dfs = (): boolean => {
    const cell = owner.indexOf(-1);
    if (cell < 0) return true;
    for (let ci = 0; ci < clues.length; ci++) {
      if (chosen[ci]) continue;
      for (const cand of cands[ci]) {
        if (!cand.cells.includes(cell) || !fits(cand.cells)) continue;
        for (const c of cand.cells) owner[c] = ci;
        chosen[ci] = cand.rect;
        if (cluesAlive() && dfs()) return true;
        for (const c of cand.cells) owner[c] = -1;
        chosen[ci] = null;
      }
    }
    return false;
  };

  // Each unused clue must still have a rectangle that fits.
  const cluesAlive = () =>
    clues.every((_, ci) => chosen[ci] || cands[ci].some((c) => fits(c.cells)));

  return dfs() ? (chosen as Rect[]) : null;
}

export function checkPatches(p: PatchesPuzzle, rects: Rect[]): boolean {
  const n = p.rows * p.cols;
  const owner = new Int32Array(n).fill(-1);
  for (let i = 0; i < rects.length; i++) {
    const [t, l, h, w] = rects[i];
    const clue = p.clues[i];
    if (!shapeOk(clue.shape, h, w) || (clue.size && h * w !== clue.size)) return false;
    for (let y = t; y < t + h; y++)
      for (let x = l; x < l + w; x++) {
        const c = y * p.cols + x;
        if (owner[c] >= 0) return false;
        owner[c] = i;
      }
    if (owner[clue.cell] !== i) return false;
  }
  return owner.every((o) => o >= 0);
}
