// Per-game: read the puzzle from the page, solve it, play the answer.
import { getCells, cellComponentProps, gridDims, drag, tap, key, nextFrame } from './dom.ts';
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
}

const square = (cells: unknown[]) => Math.round(Math.sqrt(cells.length));

export const zip: Game<ZipPuzzle, number[]> = {
  read(grid) {
    const cells = getCells(grid);
    const props = cells.map(cellComponentProps);
    const dims = gridDims(grid);
    const size = props[0].gridSize ?? square(cells);
    const numbers: Record<number, number> = {};
    for (const p of props) if (p.sequenceNo >= 0) numbers[p.idx] = p.sequenceNo;
    const walls = (props[0].walls ?? []).map((w: any) =>
      [w.cellIdx, String(w.direction).replace('WallDirection_', '') as WallDir]);
    return { rows: dims?.rows ?? size, cols: dims?.cols ?? size, numbers, walls };
  },
  solve: solveZip,
  async play(grid, _p, path, opts) {
    const cells = getCells(grid);
    if (opts.zipInput === 'keyboard') {
      for (const c of path) key(cells[c], 'Enter');
    } else {
      drag(path.map((c) => cells[c]));
    }
  },
};

const QUEEN_SEL = '[data-testid="queen-svg"]';
const CROSS_SEL = '[data-testid="cross-svg"]';
/** Taps that take a Queens cell to a queen (cycle: empty -> X -> queen). */
const queenTapsNeeded = (el: Element) =>
  el.querySelector(QUEEN_SEL) ? 0 : el.querySelector(CROSS_SEL) ? 1 : 2;

export const queens: Game<QueensPuzzle, number[]> = {
  read(grid) {
    const cells = getCells(grid);
    const props = cells.map(cellComponentProps);
    return { size: props[0].gridSize ?? square(cells), regions: props.map((p) => p.cellMeta.color) };
  },
  solve: solveQueens,
  async play(grid, p, cols) {
    // Only the queen cells are touched. Taps go out back to back, with just a
    // microtask between taps on the same cell: React flushes click updates in
    // a microtask, so the second tap sees the X from the first without
    // waiting for a frame. Then verify, and retry only the cells still missing.
    const targets = cols.map((c, r) => r * p.size + c);
    let cells = getCells(grid);
    let todo = targets;
    for (let attempt = 0; attempt < 4 && todo.length; attempt++) {
      for (const i of todo) {
        // Count the taps from the cell's state before tapping: if a render
        // lags, re-reading between taps could push the cell past the queen.
        const n = queenTapsNeeded(cells[i]);
        for (let t = 0; t < n; t++) {
          if (t) await Promise.resolve();
          tap(cells[i]);
        }
      }
      // Verify after a frame; before re-tapping, give a slow render one more
      // frame so a pending update is not tapped past the queen.
      for (let wait = 0; wait < 2; wait++) {
        await nextFrame();
        if (!grid.isConnected) return; // board replaced (e.g. puzzle solved)
        cells = getCells(grid);
        todo = targets.filter((i) => cells[i] && queenTapsNeeded(cells[i]) > 0);
        if (!todo.length) return;
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
