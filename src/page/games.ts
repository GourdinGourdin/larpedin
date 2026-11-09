// Per-game: read the puzzle from the page, solve it, play the answer.
import {
  getCells, cellComponentProps, gridDims, drag, tap, key, nextFrame, dragPath, cellPropsCandidates, sleep,
} from './dom.ts';
import { solveZip, type ZipPuzzle, type WallDir } from '../solvers/zip.ts';
import { solveQueens, type QueensPuzzle } from '../solvers/queens.ts';
import { solveTango, type TangoPuzzle } from '../solvers/tango.ts';
import { solvePatches, parseShape, type PatchesPuzzle } from '../solvers/patches.ts';

export type GameId = 'zip' | 'queens' | 'tango' | 'patches';

export interface Game<P, S> {
  read(grid: HTMLElement): P;
  solve(p: P): S | null;
  play(grid: HTMLElement, p: P, s: S, opts: PlayOptions): Promise<void>;
}

export interface PlayOptions {
  /** 'mouse' (default) or 'keyboard' input for Zip */
  zipInput?: 'mouse' | 'keyboard';
  /** Zip drag: move through every cell (default, safest) or only the turns */
  zipDrag?: 'cells' | 'turns';
}

const square = (cells: unknown[]) => Math.round(Math.sqrt(cells.length));

/** Columns from layout: cells sharing the first cell's row position. */
function layoutCols(cells: HTMLElement[]): number | null {
  if (!cells.length) return null;
  const top = cells[0].getBoundingClientRect().top;
  let c = 0;
  for (const el of cells) {
    if (Math.abs(el.getBoundingClientRect().top - top) > 2) break;
    c++;
  }
  return c > 0 && cells.length % c === 0 ? c : null;
}

/**
 * How many cells the game shows as part of the drawn path, or null if neither
 * signal is readable. Reads the `path` prop through the fiber and its
 * alternate (the DOM node can point at the stale one) and counts filled cells.
 */
function zipProgress(grid: HTMLElement, cells: HTMLElement[]): number | null {
  let best: number | null = null;
  for (const p of cellPropsCandidates(cells[0])) {
    if (Array.isArray(p.path)) best = Math.max(best ?? 0, p.path.length);
  }
  const filled = grid.querySelectorAll('[data-testid="filled-cell"]').length;
  if (filled) best = Math.max(best ?? 0, filled);
  return best;
}

/** Wait until the game shows all n cells filled (or the board goes away). Returns progress, null if unknown. */
async function waitZipDone(grid: HTMLElement, cells: HTMLElement[], n: number, ms = 800): Promise<number | null> {
  const t = performance.now();
  let got: number | null = null;
  do {
    await nextFrame();
    if (!grid.isConnected) return n; // board replaced by the success screen
    got = zipProgress(grid, cells);
    if (got !== null && got >= n) return got;
  } while (performance.now() - t < ms);
  return got;
}

export const zip: Game<ZipPuzzle, number[]> = {
  read(grid) {
    const cells = getCells(grid);
    const props = cells.map(cellComponentProps);
    const dims = gridDims(grid);
    let rows: number, cols: number;
    if (dims) ({ rows, cols } = dims);
    else if (typeof props[0].gridSize === 'number' && props[0].gridSize ** 2 === cells.length) rows = cols = props[0].gridSize;
    else if (square(cells) ** 2 === cells.length) rows = cols = square(cells);
    else {
      cols = layoutCols(cells) ?? square(cells);
      rows = Math.round(cells.length / cols);
    }
    const numbers: Record<number, number> = {};
    props.forEach((p, i) => {
      if (typeof p.sequenceNo === 'number' && p.sequenceNo >= 0) numbers[p.idx ?? i] = p.sequenceNo;
    });
    const walls = (props[0].walls ?? []).map((w: any) =>
      [w.cellIdx, String(w.direction).replace('WallDirection_', '') as WallDir]);
    return { rows, cols, numbers, walls };
  },
  solve: (p) => solveZip(p, { timeoutMs: 5000 }),
  async play(grid, p, path, opts) {
    const cells = getCells(grid);
    const n = p.rows * p.cols;
    if (cells.length !== n || path.length !== n) {
      throw new Error(`zip: board has ${cells.length} cells, puzzle ${n}, path ${path.length}`);
    }
    const keyboard = () => { for (const c of path) key(cells[c], 'Enter'); };
    if (opts.zipInput === 'keyboard') keyboard();
    else dragPath(cells, path, opts.zipDrag === 'turns');

    let done = await waitZipDone(grid, cells, n);
    if (done === null) return; // can't read progress: trust the input
    if (done < n) {
      // one fallback: a per-cell drag after a turns-only drag, else the other input mode
      await sleep(50);
      if (opts.zipInput !== 'keyboard' && opts.zipDrag === 'turns') dragPath(cells, path, false);
      else if (opts.zipInput === 'keyboard') dragPath(cells, path, false);
      else keyboard();
      done = await waitZipDone(grid, cells, n);
      if (done !== null && done < n) throw new Error(`zip: input sent but the board shows ${done}/${n} cells`);
    }
  },
};

export const queens: Game<QueensPuzzle, number[]> = {
  read(grid) {
    const cells = getCells(grid);
    const props = cells.map(cellComponentProps);
    return { size: props[0].gridSize ?? square(cells), regions: props.map((p) => p.cellMeta.color) };
  },
  solve: solveQueens,
  async play(grid, p, cols) {
    const cells = getCells(grid);
    for (let r = 0; r < p.size; r++) {
      const el = cells[r * p.size + cols[r]];
      // empty -> X -> queen; stop as soon as the queen shows
      for (let i = 0; i < 3 && !el.querySelector('[data-testid="queen-svg"]'); i++) {
        tap(el);
        await nextFrame();
      }
    }
  },
};

const tangoValue = (s: string) => (s === 'LotkaCellValue_ONE' ? 1 : s === 'LotkaCellValue_ZERO' ? 0 : -1);

export const tango: Game<TangoPuzzle, number[]> = {
  read(grid) {
    const cells = getCells(grid);
    const props = cells.map(cellComponentProps);
    const given: Record<number, number> = {};
    props.forEach((p, i) => { if (p.cellData?.isLocked) given[i] = tangoValue(p.cellData.state); });
    const edges = (props[0].edges ?? []).map((e: any) =>
      [e.startIdx, e.endIdx, e.isEqual ? '=' : 'x'] as [number, number, '=' | 'x']);
    return { size: props[0].gridSize ?? square(cells), given, edges };
  },
  solve: solveTango,
  async play(grid, p, s) {
    const cells = getCells(grid);
    const shown = (el: Element) =>
      el.querySelector('[data-testid="cell-one"]') ? 1 :
      el.querySelector('[data-testid="cell-zero"]') ? 0 : -1;
    for (let c = 0; c < s.length; c++) {
      if (c in p.given) continue;
      for (let i = 0; i < 3 && shown(cells[c]) !== s[c]; i++) {
        tap(cells[c]);
        await nextFrame();
      }
    }
  },
};

export const patches: Game<PatchesPuzzle, [number, number, number, number][]> = {
  read(grid) {
    const cells = getCells(grid);
    const dims = gridDims(grid) ?? { rows: square(cells), cols: square(cells) };
    const clues = (cellComponentProps(cells[0]).clueCells ?? []).map((c: any) => ({
      cell: c.cellIdx, shape: parseShape(String(c.shapeConstraint)), size: c.numberConstraint || 0,
    }));
    return { rows: dims.rows, cols: dims.cols, clues };
  },
  solve: solvePatches,
  async play(grid, p, rects) {
    const cells = getCells(grid);
    for (const [t, l, h, w] of rects) {
      const a = cells[t * p.cols + l];
      const b = cells[(t + h - 1) * p.cols + (l + w - 1)];
      drag(a === b ? [a] : [a, b]);
      await nextFrame();
    }
  },
};

export const GAMES: Record<GameId, Game<any, any>> = { zip, queens, tango, patches };

export function currentGame(): GameId | null {
  const m = location.pathname.match(/\/games\/(zip|queens|tango|patches)/);
  return (m?.[1] as GameId) ?? null;
}
