// Screenshots of the panel, popup and welcome page on local mock pages
// (headless Chromium via playwright-core; never touches linkedin.com).
//   npm run build && node scripts/screenshots.ts   -> docs/screenshots/*.png
//
// The mock Queens page fakes the React fiber props the reader uses, and
// toggles empty -> cross -> queen on click, so the real content.js runs a
// full read / solve / play there.
import { chromium, type Page } from 'playwright-core';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromiumPath } from './chromium.ts';

const OUT = 'docs/screenshots';
const EXT = 'dist/extension';
mkdirSync(OUT, { recursive: true });
if (!existsSync(`${EXT}/content.js`)) throw new Error('run `npm run build` first');

const fixture = JSON.parse(readFileSync('fixtures/2026-11-09.json', 'utf8'));
const harness = (await build({
  stdin: {
    contents: `import { Panel } from './src/page/panel.ts'; import { DEFAULT_SETTINGS } from './src/page/settings.ts';
      (window as any).Panel = Panel; (window as any).DEFAULT_SETTINGS = DEFAULT_SETTINGS;`,
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'iife', write: false,
})).outputFiles[0].text;

const REGION_COLORS = ['#BBA3E2', '#FFC992', '#96BEFF', '#B3DFA0', '#DFDFDF', '#FF7B60', '#E6F388', '#B9B29E', '#DFA0BF', '#A3D2D8'];

function mockGame(game: string, kind: 'queens' | 'broken' | 'empty'): string {
  const q = fixture.queens as { size: number; regions: number[] };
  const n = q.size;
  const cells = kind === 'empty' ? '' : q.regions.map((r, i) =>
    `<div class="cell" data-cell-idx="${i}" style="background:${REGION_COLORS[r % REGION_COLORS.length]}"></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${game} (mock)</title><style>
    body{margin:0;background:#F4F2EE;font:14px system-ui,sans-serif;color:#1d1d1d}
    .top{height:52px;background:#fff;border-bottom:1px solid #e3e0da;display:flex;align-items:center;padding:0 24px;font-weight:600;color:#666}
    .wrap{display:flex;justify-content:center;padding:32px}
    .board{background:#fff;border-radius:12px;padding:24px;box-shadow:0 0 0 1px #e3e0da;display:flex;flex-direction:column;align-items:center;gap:16px}
    h1{margin:0;font-size:22px;text-transform:capitalize}
    .grid{display:grid;grid-template-columns:repeat(${n},56px);gap:2px;background:#333;border:2px solid #333;border-radius:6px;overflow:hidden}
    .cell{width:56px;height:56px;display:grid;place-items:center;font-size:22px;cursor:pointer;user-select:none}
  </style></head><body><div class="top">Mock puzzle page (local test, not LinkedIn)</div>
  <div class="wrap"><div class="board"><h1>${game}</h1>
  ${kind === 'empty' ? '<p>Press Start to begin</p>' : `<div class="grid" data-testid="interactive-grid">${cells}</div>`}
  </div></div>
  <script>
    const regions = ${JSON.stringify(q.regions)};
    document.querySelectorAll('.cell').forEach((el, i) => {
      ${kind === 'queens' ? `el['__reactFiber$mock'] = { return: { memoizedProps: { gridSize: ${n}, cellMeta: { color: regions[i] } } } };` : ''}
      let s = 0;
      el.addEventListener('click', () => {
        s = (s + 1) % 3;
        el.innerHTML = s === 1 ? '<span data-testid="cross-svg">×</span>'
          : s === 2 ? '<svg data-testid="queen-svg" width="30" height="30" viewBox="0 0 24 24"><path d="M3 18h18l-2-10-4 4-3-7-3 7-4-4z" fill="#222"/></svg>' : '';
      });
    });
  </script>
  <script src="/ext/content.js"></script></body></html>`;
}

const CHROME_STUB = (status: unknown, settings: unknown, send = `async () => (${JSON.stringify(status)})`) => `
  window.chrome = {
    runtime: { getManifest: () => ({ version: '1.0.0' }), openOptionsPage() {}, getURL: (p) => p },
    storage: { sync: { get: async () => ({ settings: ${JSON.stringify(settings)} }), set: async () => {} }, onChanged: { addListener() {} } },
    tabs: { query: async () => [{ id: 1 }], sendMessage: ${send}, create() {}, update() {} },
    commands: { getAll: async () => [{ name: 'solve', shortcut: 'Alt+S' }] },
  };`;

const server = createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  const send = (body: string | Buffer, type = 'text/html') => { res.writeHead(200, { 'content-type': type }); res.end(body); };
  if (url.pathname === '/harness.js') return send(harness, 'text/javascript');
  if (url.pathname === '/harness/') return send('<!doctype html><html><body style="margin:0;background:#F4F2EE"><script src="/harness.js"></script></body></html>');
  if (url.pathname.startsWith('/ext/')) {
    const f = join(EXT, url.pathname.slice(5));
    const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' };
    if (existsSync(f)) return send(readFileSync(f), types[extname(f)] ?? 'application/octet-stream');
  }
  const m = url.pathname.match(/^\/games\/(\w+)\/$/);
  if (m) return send(mockGame(m[1], m[1] === 'queens' ? 'queens' : m[1] === 'zip' ? 'empty' : 'broken'));
  res.writeHead(404); res.end();
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const shots: string[] = [];
async function newPage(opts: { dark?: boolean; w?: number; h?: number } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w ?? 1100, height: opts.h ?? 720 }, deviceScaleFactor: 2,
    colorScheme: opts.dark ? 'dark' : 'light',
  });
  return ctx.newPage();
}
async function shotPanel(page: Page, name: string, pad = 16) {
  const box = (await page.locator('linkedin-larp-panel').boundingBox())!;
  const vp = page.viewportSize()!;
  const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x, y, width: Math.min(vp.width - x, box.width + 2 * pad), height: Math.min(vp.height - y, box.height + 2 * pad) },
  });
  shots.push(name);
}
const phase = (page: Page) => page.locator('linkedin-larp-panel .card').getAttribute('data-phase');

// 1. Real end-to-end on the mock Queens board: idle -> done.
for (const dark of [false, true]) {
  const page = await newPage({ dark });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/games/queens/`);
  await page.locator('linkedin-larp-panel .card').waitFor();
  if (!dark) await shotPanel(page, 'panel-idle');
  await page.locator('linkedin-larp-panel #ll-solve').click();
  await page.waitForFunction(() => {
    const c = document.querySelector('linkedin-larp-panel')!.shadowRoot!.querySelector('.card') as HTMLElement;
    return c.dataset.phase === 'done' || c.dataset.phase === 'error';
  });
  const p = await phase(page);
  const queensShown = await page.locator('[data-testid="queen-svg"]').count();
  console.log(`queens e2e (${dark ? 'dark' : 'light'}): phase=${p}, queens on board=${queensShown}, page errors=${errors.length}`);
  if (p !== 'done' || queensShown !== 7) throw new Error('mock Queens e2e failed');
  await shotPanel(page, dark ? 'panel-done-dark' : 'panel-done');
  if (!dark) { await page.screenshot({ path: `${OUT}/page-queens-solved.png` }); shots.push('page-queens-solved'); }
  // Alt+S hotkey path (re-solving an already solved board is a no-op play)
  if (!dark) {
    await page.keyboard.press('Alt+KeyS');
    await page.waitForTimeout(150);
    console.log(`hotkey run: phase=${await phase(page)}`);
  }
  await page.context().close();
}

// 2. Error state: a board the reader can't read.
{
  const page = await newPage();
  await page.goto(`${base}/games/tango/`);
  await page.locator('linkedin-larp-panel #ll-solve').click();
  await page.waitForFunction(() =>
    (document.querySelector('linkedin-larp-panel')!.shadowRoot!.querySelector('.card') as HTMLElement).dataset.phase === 'error');
  console.log('error msg:', await page.locator('linkedin-larp-panel .msg-text').textContent());
  await shotPanel(page, 'panel-error');
  await page.context().close();
}

// 3. Settings open (Zip, waiting for board), then collapsed pill; position is remembered.
{
  const page = await newPage();
  await page.goto(`${base}/games/zip/`);
  await page.locator('linkedin-larp-panel #ll-gear').click();
  await shotPanel(page, 'panel-settings-zip');
  // drag by the header
  const head = (await page.locator('linkedin-larp-panel .head').boundingBox())!;
  await page.mouse.move(head.x + 120, head.y + 20);
  await page.mouse.down();
  await page.mouse.move(head.x + 420, head.y - 60, { steps: 6 });
  await page.mouse.up();
  await page.locator('linkedin-larp-panel #ll-min').click();
  await shotPanel(page, 'panel-pill', 12);
  await page.reload();
  await page.locator('linkedin-larp-panel .pill').waitFor();
  const pill = (await page.locator('linkedin-larp-panel').boundingBox())!;
  console.log(`after reload: collapsed pill at x=${Math.round(pill.x)} (moved from 16)`);
  await page.context().close();
}

// 4. Every game's accent, mid-play (panel rendered directly from panel.ts).
for (const dark of [false, true]) {
  const page = await newPage({ dark, w: 5 * 296 + 16, h: 330 });
  await page.goto(`${base}/harness/`);
  await page.evaluate(() => {
    const w = window as any;
    const games = ['zip', 'queens', 'tango', 'patches', 'wend'];
    const phases = ['playing', 'done', 'solving', 'done', 'idle'];
    const t = { read: 0.21, solve: 1.4, play: 38, total: 39.6 };
    games.forEach((g, i) => {
      const p = new w.Panel({ onSolve() {}, onSettings() {}, onExport() {}, debugInfo: () => '' }, w.DEFAULT_SETTINGS);
      p.setGame(g);
      p.show();
      p.setStatus({ game: g, phase: phases[i], timings: t, message: phases[i] === 'done' ? 'Solved in 40 ms' : undefined });
      p.element.style.setProperty('left', `${16 + i * 296}px`, 'important');
      p.element.style.setProperty('bottom', '16px', 'important');
    });
  });
  await page.screenshot({ path: `${OUT}/panel-accents${dark ? '-dark' : ''}.png` });
  shots.push(`panel-accents${dark ? '-dark' : ''}`);
  await page.context().close();
}

// 5. Popup and welcome page with a stubbed chrome.* API.
const doneStatus = { status: { game: 'queens', phase: 'done', timings: { read: 0.31, solve: 0.04, play: 42.6, total: 43 } }, path: '/games/queens/' };
for (const dark of [false, true]) {
  const page = await newPage({ dark, w: 320, h: 600 });
  await page.addInitScript(CHROME_STUB(doneStatus, { auto: true }));
  await page.goto(`${base}/ext/popup.html`);
  await page.waitForTimeout(150);
  await page.locator('body').screenshot({ path: `${OUT}/popup${dark ? '-dark' : ''}.png` });
  shots.push(`popup${dark ? '-dark' : ''}`);
  await page.context().close();
}
{
  const page = await newPage({ w: 320, h: 600 });
  await page.addInitScript(CHROME_STUB(null, {}, 'async () => { throw new Error("no receiver"); }'));
  await page.goto(`${base}/ext/popup.html`);
  await page.waitForTimeout(150);
  await page.locator('body').screenshot({ path: `${OUT}/popup-off-linkedin.png` });
  shots.push('popup-off-linkedin');
  await page.context().close();
}
for (const [dark, w] of [[false, 1100], [true, 1100], [false, 390]] as const) {
  const page = await newPage({ dark, w, h: 900 });
  await page.addInitScript(CHROME_STUB(null, { auto: false, zipInput: 'mouse' }));
  await page.goto(`${base}/ext/welcome.html`);
  await page.waitForTimeout(150);
  const name = `welcome${dark ? '-dark' : ''}${w < 500 ? '-mobile' : ''}`;
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollW > w) console.warn(`${name}: horizontal overflow ${scrollW}px > ${w}px`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  shots.push(name);
  await page.context().close();
}

await browser.close();
server.close();
console.log(`wrote ${shots.length} screenshots to ${OUT}/: ${shots.join(', ')}`);
