// Store assets, from the real extension running on the mock pages (no
// linkedin.com). Writes dist/store-assets/:
//   chrome/    1280x800 screenshots (24-bit PNG, no alpha), 440x280 small promo tile, 1400x560 marquee
//   firefox/   the same screenshots (AMO takes any size; 1280x800 is fine), plus a dark one
//   icon-128.png, icon-300.png (Edge logo)
//
//   npm run assets:store      (builds first if dist/extension is missing)
import type { Page } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { EXT, launch } from './mock/harness.ts';
import { BASE, BRAND, GAME_THEME, markSvg } from '../src/page/theme.ts';

if (!existsSync(`${EXT}/manifest.json`)) execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
const OUT = 'dist/store-assets';
rmSync(OUT, { recursive: true, force: true });
for (const d of ['chrome', 'firefox']) mkdirSync(`${OUT}/${d}`, { recursive: true });

const h = await launch({ shot: true, viewport: { width: 1280, height: 800 } });
const shots: string[] = [];
const save = async (page: Page, name: string, dirs = ['chrome', 'firefox']) => {
  const buf = await page.screenshot({ type: 'png' });
  for (const d of dirs) writeFileSync(`${OUT}/${d}/${name}.png`, buf);
  shots.push(name);
};

async function solvedGame(game: string) {
  const page = await h.ctx.newPage();
  await page.goto(`https://www.linkedin.com/games/${game}/`);
  await page.locator('larpedin-panel .card').waitFor();
  await page.locator('larpedin-panel #ll-solve').click();
  await page.waitForFunction(() => (document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('.card') as HTMLElement).dataset.phase === 'done', null, { timeout: 25_000 });
  if (!(await page.evaluate(() => (window as any).__mock.solved()))) throw new Error(`${game} did not solve`);
  await page.mouse.move(640, 20); // park the pointer off the board
  await page.waitForTimeout(250);
  return page;
}

// 1-3. the panel on solved boards
for (const [n, game] of [['01-queens-solved', 'queens'], ['02-zip-solved', 'zip'], ['03-tango-solved', 'tango']] as const) {
  const page = await solvedGame(game);
  await save(page, n);
  if (game === 'queens') {
    // 06 (dark): same board, Appearance = Dark, settings open
    await h.sw!.evaluate(() => chrome.storage.sync.set({ settings: { theme: 'dark' } }));
    await page.waitForFunction(() => document.querySelector('larpedin-panel')!.shadowRoot!.host.getAttribute('data-theme') === 'dark');
    await page.locator('larpedin-panel #ll-gear').click();
    await page.waitForTimeout(200);
    await save(page, '06-dark-settings', ['firefox']);
    await h.sw!.evaluate(() => chrome.storage.sync.set({ settings: { theme: 'light' } }));
  }
  await page.close();
}

// 4. the toolbar popup on a game tab, composed on a 1280x800 canvas
{
  const game = await solvedGame('patches');
  await game.bringToFront();
  const tabId = await h.sw!.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  const popup = await h.ctx.newPage();
  await popup.setViewportSize({ width: 320, height: 900 });
  // render the popup at 2x so it stays sharp when shown larger on the canvas
  await (await h.ctx.newCDPSession(popup)).send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 2, mobile: false });
  await popup.addInitScript((id) => { chrome.tabs.query = (async () => [{ id }]) as any; }, tabId);
  await popup.goto(`chrome-extension://${h.id}/popup.html`);
  await popup.waitForFunction(() => /solved/i.test(document.getElementById('status-title')!.textContent || ''));
  await popup.mouse.move(600, 600);
  const img = (await popup.locator('body').screenshot({ type: 'png' })).toString('base64');
  const stage = await h.ctx.newPage();
  await stage.setContent(`<body style="margin:0;background:${BASE.light.bg};display:grid;place-items:center;height:800px;font-family:system-ui,sans-serif">
    <div style="display:flex;align-items:center;gap:72px">
      <div style="width:420px"><div style="font-size:44px;font-weight:800;letter-spacing:-.04em;line-height:1.05;color:${BASE.light.ink}">Status and a Solve button, one click away</div>
      <p style="font-size:20px;line-height:1.45;color:${BASE.light.ink2};margin-top:18px">The toolbar popup shows the puzzle on the current tab, lets you switch games and turn on auto-solve.</p></div>
      <img src="data:image/png;base64,${img}" style="width:${Math.round(320 * 1.5)}px;border-radius:20px;box-shadow:${BASE.light.shadow}">
    </div></body>`);
  await save(stage, '04-popup');
  await Promise.all([stage.close(), popup.close(), game.close()]);
}

// 5. the welcome / options page
{
  const page = await h.ctx.newPage();
  await page.goto(`chrome-extension://${h.id}/welcome.html`);
  await page.locator('h1').waitFor();
  await page.evaluate(() => document.getElementById('set-h')!.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -24));
  await page.waitForTimeout(300);
  await save(page, '05-welcome-settings');
  await page.close();
}

// promo tile 440x280 and marquee 1400x560: the mask logo, cream, the five games
async function promo(w: number, hgt: number, name: string, big: boolean) {
  const page = await h.ctx.newPage();
  await page.setViewportSize({ width: w, height: hgt });
  const dots = Object.values(GAME_THEME).map((t) =>
    `<span style="display:inline-flex;align-items:center;gap:${big ? 10 : 6}px;font-weight:650;font-size:${big ? 22 : 13}px;color:${BASE.light.ink2}">` +
    `<i style="width:${big ? 14 : 9}px;height:${big ? 14 : 9}px;border-radius:50%;background:${t.accent};display:block"></i>${t.name}</span>`).join('');
  await page.setContent(`<body style="margin:0;width:${w}px;height:${hgt}px;background:${BASE.light.bg};display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,-apple-system,'Segoe UI',system-ui,sans-serif;color:${BASE.light.ink}">
    <div style="display:flex;align-items:center;gap:${big ? 56 : 22}px">
      ${markSvg(big ? 200 : 96)}
      <div style="display:flex;flex-direction:column;gap:${big ? 16 : 8}px">
        <div style="font-weight:800;letter-spacing:-.04em;font-size:${big ? 84 : 40}px;line-height:1">${BRAND.name}</div>
        <div style="font-size:${big ? 28 : 15}px;line-height:1.3;color:${BASE.light.ink2};max-width:${big ? 620 : 220}px">${BRAND.tagline}</div>
        <div style="display:flex;flex-wrap:wrap;gap:${big ? '10px 22px' : '6px 12px'};margin-top:${big ? 8 : 2}px;max-width:${big ? 640 : 230}px">${dots}</div>
      </div></div></body>`);
  writeFileSync(`${OUT}/chrome/${name}.png`, await page.screenshot({ type: 'png' }));
  shots.push(name);
  await page.close();
}
await promo(440, 280, 'promo-tile-440x280', false);
await promo(1400, 560, 'promo-marquee-1400x560', true);

cpSync('src/extension/icons/icon-128.png', `${OUT}/icon-128.png`);
{ // Edge asks for a 300x300 logo
  const page = await h.ctx.newPage();
  await page.setViewportSize({ width: 300, height: 300 });
  await page.setContent(`<body style="margin:0;background:transparent">${markSvg(300)}</body>`);
  writeFileSync(`${OUT}/icon-300.png`, await page.screenshot({ type: 'png', omitBackground: true }));
  await page.close();
}
await h.close();
console.log(`store assets in ${OUT}/: ${shots.join(', ')}`);
