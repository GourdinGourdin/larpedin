// Entry point injected into linkedin.com/games/* pages.
// - Small panel: "Solve" button (Alt+S), auto-solve toggle, timing readout.
// - Every puzzle seen is saved to localStorage so you build your own archive;
//   "Export" downloads it as JSON for the test suite.
import { getGrid, getCells } from './dom.ts';
import { GAMES, currentGame, type GameId, type PlayOptions } from './games.ts';

const STORE = 'lgs-archive';
const OPTS = 'lgs-options';

interface Options extends PlayOptions { auto: boolean }

function loadOpts(): Options {
  try { return { auto: false, zipInput: 'mouse', ...JSON.parse(localStorage.getItem(OPTS) || '{}') }; }
  catch { return { auto: false, zipInput: 'mouse' }; }
}
function saveOpts(o: Options) { try { localStorage.setItem(OPTS, JSON.stringify(o)); } catch {} }

function archive(game: GameId, puzzle: unknown) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || '{}');
    const day = new Date().toISOString().slice(0, 10);
    (all[day] ??= {})[game] = puzzle;
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {}
}

function alreadySolved(game: GameId, grid: HTMLElement): boolean {
  const cells = getCells(grid);
  if (game === 'queens') return grid.querySelectorAll('[data-testid="queen-svg"]').length === Math.round(Math.sqrt(cells.length));
  if (game === 'tango') return cells.every((c) => c.querySelector('[data-testid="cell-one"],[data-testid="cell-zero"]'));
  if (game === 'zip') {
    try {
      const key = Object.keys(cells[0]).find((k) => k.startsWith('__reactFiber'))!;
      return ((cells[0] as any)[key].return.memoizedProps.path ?? []).length === cells.length;
    } catch { return false; }
  }
  return false;
}

let busy = false;

async function run(reason: string) {
  const game = currentGame();
  const grid = getGrid();
  if (!game || !grid || busy) return;
  busy = true;
  const opts = loadOpts();
  try {
    const g = GAMES[game];
    const t0 = performance.now();
    const puzzle = g.read(grid);
    const t1 = performance.now();
    const sol = g.solve(puzzle);
    const t2 = performance.now();
    if (!sol) { report(`${game}: no solution found`); return; }
    archive(game, puzzle);
    await g.play(grid, puzzle, sol, opts);
    const t3 = performance.now();
    const msg = `${game} (${reason}): read ${(t1 - t0).toFixed(1)} ms · solve ${(t2 - t1).toFixed(1)} ms · ` +
      `input ${(t3 - t2).toFixed(1)} ms · total ${(t3 - t0).toFixed(1)} ms`;
    console.log('[lgs]', msg, { puzzle, sol });
    report(msg);
  } catch (e) {
    console.error('[lgs]', e);
    report(`${game}: error: ${(e as Error).message}`);
  } finally {
    busy = false;
  }
}

// ---------- panel ----------
let out: HTMLElement | null = null;
function report(s: string) { if (out) out.textContent = s; }

function panel() {
  if (document.getElementById('lgs-panel')) return;
  const box = document.createElement('div');
  box.id = 'lgs-panel';
  box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;background:#111;color:#eee;' +
    'font:12px/1.4 ui-monospace,monospace;padding:8px 10px;border-radius:8px;max-width:340px;box-shadow:0 2px 8px #0006';
  const opts = loadOpts();
  box.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <b>Solver</b>
      <button id="lgs-solve">Solve (Alt+S)</button>
      <label><input type="checkbox" id="lgs-auto" ${opts.auto ? 'checked' : ''}> auto</label>
      <select id="lgs-zip"><option value="mouse">zip: drag</option><option value="keyboard">zip: keys</option></select>
      <button id="lgs-export">Export</button>
    </div>
    <div id="lgs-out" style="margin-top:4px;opacity:.85">ready</div>`;
  document.body.appendChild(box);
  out = box.querySelector('#lgs-out');
  (box.querySelector('#lgs-zip') as HTMLSelectElement).value = opts.zipInput ?? 'mouse';
  box.querySelector('#lgs-solve')!.addEventListener('click', () => run('button'));
  box.querySelector('#lgs-auto')!.addEventListener('change', (e) =>
    saveOpts({ ...loadOpts(), auto: (e.target as HTMLInputElement).checked }));
  box.querySelector('#lgs-zip')!.addEventListener('change', (e) =>
    saveOpts({ ...loadOpts(), zipInput: (e.target as HTMLSelectElement).value as 'mouse' | 'keyboard' }));
  box.querySelector('#lgs-export')!.addEventListener('click', () => {
    const blob = new Blob([localStorage.getItem(STORE) || '{}'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linkedin-puzzles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
}

// ---------- wiring ----------
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.code === 'KeyS') { e.preventDefault(); run('hotkey'); }
});

let lastGrid: HTMLElement | null = null;
new MutationObserver(() => {
  if (!currentGame()) return;
  if (document.body) panel();
  const grid = getGrid();
  if (grid && grid !== lastGrid) {
    lastGrid = grid;
    const game = currentGame()!;
    // record the puzzle even if we don't play it
    try { archive(game, GAMES[game].read(grid)); } catch {}
    if (loadOpts().auto && !alreadySolved(game, grid)) run('auto');
  }
}).observe(document.documentElement, { childList: true, subtree: true });
