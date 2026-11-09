// Linkedin Larp: entry point injected into linkedin.com pages (main world).
// - Floating panel (panel.ts): Solve (Alt+S), auto-solve, per-game settings.
// - Every puzzle seen is saved to localStorage so you build your own archive;
//   "Export puzzles" downloads it as JSON for the test suite.
// - In the extension, settings sync with chrome.storage through bridge.ts;
//   in the userscript they live in localStorage only.
import { getGrid, getCells } from './dom.ts';
import { GAMES, currentGame, type GameId } from './games.ts';
import { Panel, fmtMs } from './panel.ts';
import {
  FROM_BRIDGE, FROM_PAGE, sanitizeSettings,
  type BridgeMsg, type PageMsg, type Settings, type Status, type Timings,
} from './settings.ts';

declare const __LARP_VERSION__: string;
type PageBody = PageMsg extends infer M ? M extends PageMsg ? Omit<M, 'source'> : never : never;
const VERSION = typeof __LARP_VERSION__ === 'string' ? __LARP_VERSION__ : 'dev';

const STORE = 'lgs-archive';
const OPTS = 'lgs-options';
const PATCHES_PACE = 'lgs-patches-pace';

function loadSettings(): Settings {
  try { return sanitizeSettings(JSON.parse(localStorage.getItem(OPTS) || '{}')); }
  catch { return sanitizeSettings({}); }
}

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

function boot() {
  const w = window as any;
  if (w.__linkedinLarp) return; // injected twice (extension + userscript)
  w.__linkedinLarp = VERSION;

  let settings = loadSettings();
  let status: Status = { game: null, phase: 'idle' };
  let lastError: unknown = null;
  let lastPuzzle: unknown = null;
  let busy = false;

  const post = (m: PageBody) => window.postMessage({ source: FROM_PAGE, ...m }, location.origin);

  function applySettings(next: Settings, fromBridge: boolean) {
    settings = next;
    try {
      localStorage.setItem(OPTS, JSON.stringify(next));
      localStorage.setItem(PATCHES_PACE, next.patchesPace);
    } catch {}
    panel.setSettings(next);
    if (!fromBridge) post({ type: 'settings', settings: next });
  }

  function setStatus(s: Status) {
    status = s;
    panel.setStatus(s);
    post({ type: 'status', status: s });
  }

  function debugInfo(): string {
    const grid = getGrid();
    const err = lastError as Error | null;
    return JSON.stringify({
      app: `Linkedin Larp ${VERSION}`,
      when: new Date().toISOString(),
      page: location.pathname,
      userAgent: navigator.userAgent,
      game: currentGame(),
      status,
      settings,
      grid: grid ? { cells: getCells(grid).length, testid: grid.dataset.testid } : null,
      error: err ? { message: String(err.message ?? err), stack: err.stack?.split('\n').slice(0, 8) } : null,
      puzzle: lastPuzzle,
    }, null, 2);
  }

  function exportArchive() {
    const blob = new Blob([localStorage.getItem(STORE) || '{}'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linkedin-puzzles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function run(reason: string) {
    const game = currentGame();
    if (!game || busy) return;
    const name = game[0].toUpperCase() + game.slice(1);
    const grid = getGrid();
    if (!grid) {
      setStatus({ game, phase: 'error', message: `No ${name} board found yet. Open today's puzzle and press Start, then try again.` });
      return;
    }
    busy = true;
    lastError = null;
    const g = GAMES[game];
    let phase: 'reading' | 'solving' | 'playing' = 'reading';
    try {
      setStatus({ game, phase });
      const t0 = performance.now();
      const puzzle = g.read(grid);
      lastPuzzle = puzzle;
      const t1 = performance.now();
      setStatus({ game, phase: phase = 'solving' });
      const sol = g.solve(puzzle);
      const t2 = performance.now();
      if (!sol) {
        setStatus({ game, phase: 'error', message: `No solution found for this ${name} board. The board may have been read wrong: copy the debug info and file an issue.` });
        return;
      }
      archive(game, puzzle);
      setStatus({ game, phase: phase = 'playing' });
      await g.play(grid, puzzle, sol, settings);
      const t3 = performance.now();
      const timings: Timings = { read: t1 - t0, solve: t2 - t1, play: t3 - t2, total: t3 - t0 };
      console.log(`[Linkedin Larp] ${game} (${reason})`, timings, { puzzle, sol });
      setStatus({ game, phase: 'done', timings, message: `Solved in ${fmtMs(timings.total)}` });
    } catch (e) {
      lastError = e;
      console.error('[Linkedin Larp]', e);
      const what = phase === 'reading' ? 'read the board' : phase === 'solving' ? 'solve the puzzle' : 'play the answer';
      setStatus({ game, phase: 'error', message: `Couldn't ${what}: ${(e as Error)?.message ?? e}` });
    } finally {
      busy = false;
    }
  }

  const panel = new Panel({
    onSolve: () => run('button'),
    onSettings: (patch) => applySettings(sanitizeSettings({ ...settings, ...patch }), false),
    onExport: exportArchive,
    debugInfo,
  }, settings);

  // ---------- bridge (extension only) ----------
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const m = e.data as BridgeMsg;
    if (!m || m.source !== FROM_BRIDGE) return;
    if (m.type === 'settings') applySettings(sanitizeSettings(m.settings), true);
    else if (m.type === 'hello') { post({ type: 'hello', settings }); post({ type: 'status', status }); }
    else if (m.type === 'solve' && currentGame()) { panel.expand(); run('shortcut'); }
  });
  post({ type: 'hello', settings });

  // ---------- wiring ----------
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyS' && currentGame()) {
      e.preventDefault();
      run('hotkey');
    }
  }, true);

  let lastGrid: HTMLElement | null = null;
  let lastGame: string | null = null;
  const tick = () => {
    const game = currentGame();
    if (game !== lastGame) {
      lastGame = game;
      lastGrid = null;
      if (game) {
        panel.setGame(game);
        setStatus({ game, phase: 'idle', message: 'Waiting for the board…' });
      } else {
        status = { game: null, phase: 'idle' };
        post({ type: 'status', status });
      }
    }
    if (!game) { panel.hide(); return; }
    if (document.body) panel.show();
    const grid = getGrid();
    if (grid && grid !== lastGrid) {
      lastGrid = grid;
      if (!busy) setStatus({ game, phase: 'idle', message: settings.auto ? 'Board found.' : 'Board found. Ready when you are.' });
      // record the puzzle even if we don't play it
      try { archive(game, GAMES[game].read(grid)); } catch {}
      if (settings.auto && !alreadySolved(game, grid)) run('auto');
    }
  };
  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
  tick();
}

boot();
