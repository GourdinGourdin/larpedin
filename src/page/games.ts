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

/** Symbol a Tango cell currently shows: 1, 0, or -1 for empty. */
const tangoShown = (el: Element) =>
  el.querySelector('[data-testid="cell-one"]') ? 1 :
  el.querySelector('[data-testid="cell-zero"]') ? 0 : -1;

/**
 * What we know about Tango input, learned on the page and cached in localStorage:
 * - first: the symbol an empty cell shows after one tap. The cycle is assumed to be
 *   empty -> first -> other -> empty; null = not learned yet.
 * - mode: 'burst' sends every tap synchronously (no waiting at all); 'yield' gives the
 *   page one task turn after each tap (sub-millisecond, lets React re-render between
 *   taps) and is used once a burst is seen to lose taps.
 */
interface TangoInput { first: 0 | 1 | null; mode: 'burst' | 'yield' }
const TANGO_INPUT_KEY = 'lgs-tango-input';

function loadTangoInput(): TangoInput {
  try {
    const x = JSON.parse(localStorage.getItem(TANGO_INPUT_KEY) || '{}');
    return { first: x.first === 0 || x.first === 1 ? x.first : null, mode: x.mode === 'yield' ? 'yield' : 'burst' };
  } catch { return { first: null, mode: 'burst' }; }
}
function saveTangoInput(x: TangoInput) { try { localStorage.setItem(TANGO_INPUT_KEY, JSON.stringify(x)); } catch {} }

/** Taps from `from` to `to` on the cycle empty -> first -> other -> empty. */
export function tangoTaps(first: 0 | 1, from: number, to: number): number {
  const pos = (v: number) => (v < 0 ? 0 : v === first ? 1 : 2);
  return (pos(to) - pos(from) + 3) % 3;
}

/** Infer `first` from one observed tap: before -> after. */
export function tangoLearnFirst(before: number, after: number): 0 | 1 | null {
  if (before === after) return null;
  if (before < 0) return after as 0 | 1;      // empty -> first
  if (after < 0) return (before ^ 1) as 0 | 1; // other -> empty
  return before as 0 | 1;                      // first -> other
}

/** One macrotask turn (MessageChannel: not clamped like setTimeout). */
const yieldTask = () => new Promise<void>((r) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); r(); };
  ch.port2.postMessage(0);
});

export const tango: Game<TangoPuzzle, number[]> = {
  read(grid) {
    const cells = getCells(grid);
    const props = cells.map(cellComponentProps);
    const given: Record<number, number> = {};
    props.forEach((p, i) => {
      const v = p.cellData?.isLocked ? tangoValue(p.cellData.state) : -1;
      if (v >= 0) given[i] = v;
    });
    const edges = (props[0].edges ?? []).map((e: any) =>
      [e.startIdx, e.endIdx, e.isEqual ? '=' : 'x'] as [number, number, '=' | 'x']);
    return { size: props[0].gridSize ?? square(cells), given, edges };
  },
  solve: (p) => solveTango(p),
  async play(grid, p, s) {
    const cells = getCells(grid);
    const todo: number[] = [];
    for (let c = 0; c < s.length; c++) if (!(c in p.given)) todo.push(c);
    const wrong = () => todo.filter((c) => tangoShown(cells[c]) !== s[c]);
    // Wait for the page to show our taps: until every cell is right, or nothing
    // changed for a frame (max ~10 frames).
    const settle = async () => {
      let prev = '';
      for (let i = 0; i < 10; i++) {
        await nextFrame();
        const w = wrong();
        const sig = w.map((c) => `${c}:${tangoShown(cells[c])}`).join();
        if (!w.length || sig === prev) return w;
        prev = sig;
      }
      return wrong();
    };

    const st = loadTangoInput();
    let pending = wrong();
    if (!pending.length) return;

    // 1. Learn the click cycle from one tap (prefer an empty cell).
    if (st.first === null) {
      const c = pending.find((x) => tangoShown(cells[x]) < 0) ?? pending[0];
      const before = tangoShown(cells[c]);
      tap(cells[c]);
      let after = before;
      for (let i = 0; i < 10 && after === before; i++) { await nextFrame(); after = tangoShown(cells[c]); }
      st.first = tangoLearnFirst(before, after);
      if (st.first !== null) saveTangoInput(st);
      pending = wrong();
    }

    // 2. Exact tap counts: a synchronous burst, then (if taps got lost) one task turn per tap.
    if (st.first !== null) {
      const first = st.first;
      for (const mode of st.mode === 'burst' ? (['burst', 'yield'] as const) : (['yield'] as const)) {
        if (!pending.length || !grid.isConnected) break;
        for (const c of pending) {
          const k = tangoTaps(first, tangoShown(cells[c]), s[c]);
          for (let i = 0; i < k; i++) {
            tap(cells[c]);
            if (mode === 'yield') await yieldTask();
          }
        }
        pending = await settle();
        if (pending.length && mode === 'burst') { st.mode = 'yield'; saveTangoInput(st); }
      }
      // Still wrong after exact counts with yields: the cycle guess is off; relearn next time.
      if (pending.length) { st.first = null; saveTangoInput(st); }
    }

    // 3. Fallback: tap and verify one frame at a time (works for any cycle).
    for (const c of pending) {
      for (let i = 0; i < 3 && grid.isConnected && tangoShown(cells[c]) !== s[c]; i++) {
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
