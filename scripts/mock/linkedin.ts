// Mock puzzle pages served in place of linkedin.com/games/<game>/ by the test
// and store-asset scripts (via Playwright request routing; nothing here ever
// talks to the real site). The boards come from fixtures/2026-11-09.json and
// check the moves they receive; see page.js.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE_JS = readFileSync(join(here, 'page.js'), 'utf8');
export const FIXTURE = JSON.parse(readFileSync(join(here, '../../fixtures/2026-11-09.json'), 'utf8'));

export const GAMES = ['zip', 'queens', 'tango', 'patches', 'wend'] as const;
export type Game = (typeof GAMES)[number];

const TITLES: Record<Game, string> = {
  zip: 'Zip', queens: 'Queens', tango: 'Tango', patches: 'Patches', wend: 'Wend',
};
const BLURB: Record<Game, string> = {
  zip: 'Draw one path through every cell, passing the numbers in order.',
  queens: 'Place one queen in every row, column and colour region.',
  tango: 'Fill the grid with suns and moons. Follow the = and × signs.',
  patches: 'Cut the grid into rectangles that match each clue.',
  wend: 'Find the hidden words. Each one snakes through the tiles.',
};

const CSS = `
  *{box-sizing:border-box}
  body{margin:0;background:#F4F2EE;font:14px system-ui,-apple-system,sans-serif;color:#1d1d1d}
  .top{background:#fff;border-bottom:1px solid #e3e0da;padding:12px 24px;display:flex;gap:18px;align-items:center;font-weight:600}
  .top span.t{color:#6b665c;font-weight:500}
  .wrap{display:flex;justify-content:center;padding:32px 16px}
  .card{background:#fff;border-radius:16px;padding:24px 32px 28px;box-shadow:0 0 0 1px #e3e0da;display:flex;flex-direction:column;align-items:center;gap:14px;max-width:560px}
  h1{margin:0;font-size:26px}
  .sub{margin:0;color:#6b665c;text-align:center}
  #status{font-weight:600;color:#6b665c}
  #status.ok{color:#156E55}
  #board{display:flex;flex-direction:column;align-items:center;gap:12px}
  .grid{position:relative;display:grid;gap:2px;background:#333;border:2px solid #333;border-radius:6px;user-select:none}
  .cell{position:relative;width:var(--cell);height:var(--cell);display:grid;place-items:center;font-size:22px;cursor:pointer;background:#FFFDF8}
  .cell b.num{font-size:15px;min-width:26px;height:26px;border-radius:13px;background:#222;color:#fff;display:grid;place-items:center;position:relative;z-index:2;padding:0 4px}
  .zip-cell, .cell.on{background:#FDEBDD}
  .cell i.fill{display:none}
  svg.zpath{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible}
  .cell.w-down{border-bottom:4px solid #111}.cell.w-right{border-right:4px solid #111}
  .cell.w-up{border-top:4px solid #111}.cell.w-left{border-left:4px solid #111}
  .edge{position:absolute;transform:translate(-50%,-50%);background:#fff;border:1px solid #bbb;border-radius:50%;width:20px;height:20px;display:grid;place-items:center;font-weight:700;font-size:13px;pointer-events:none;z-index:3}
  .cell.locked{background:#ECE6D8}
  .tile{font-weight:700;font-size:22px}
  .cell.hole{background:#333}
  .cell.sel{background:#F9C9A8}.cell.lock{background:#CC3B75;color:#fff}
  .cell i.lk{position:absolute;right:3px;top:3px;width:6px;height:6px;background:#fff;border-radius:50%}
  .wlist{display:flex;flex-direction:column;gap:6px}.slots{display:flex;gap:4px}.slot{width:14px;height:8px;background:#ddd;border-radius:3px}
  .ins{margin:0;color:#6b665c}
`;

/** Script that swaps the board on an open mock page for another game, as LinkedIn's client-side navigation does. */
export function mockSwitchScript(game: Game): string {
  return `history.pushState({}, '', '/games/${game}/'); document.title = '${TITLES[game]} (mock)';
    document.querySelector('h1').textContent = '${TITLES[game]}'; document.getElementById('board').replaceChildren();
    window.__MOCK = ${JSON.stringify({ game, puzzle: FIXTURE[game] })}; ${PAGE_JS}`;
}

export function mockPageHtml(game: Game, opts: { shot?: boolean } = {}): string {
  const puzzle = FIXTURE[game];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLES[game]} (mock)</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head><body>
<div class="top">Daily puzzles${opts.shot ? '' : ' <span class="t">mock page for tests, not the real site</span>'}</div>
<div class="wrap"><div class="card"><h1>${TITLES[game]}</h1><p class="sub">${BLURB[game]}</p>
<p id="status">Unsolved</p><div id="board"></div></div></div>
<script>window.__MOCK = ${JSON.stringify({ game, puzzle })};</script>
<script>${PAGE_JS}</script></body></html>`;
}
