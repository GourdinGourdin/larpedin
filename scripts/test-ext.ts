// End-to-end test of the built extension and the userscript, in a real
// Chromium, against mock game pages (scripts/mock/). Nothing here touches
// linkedin.com: every request to it is answered by a mock page, and any other
// host is aborted.
//
//   npm run test:ext     (builds first)
//
// For each of the five games it opens the mock board, waits for the panel,
// presses Solve (and, on a second board, Alt+S) and asserts BOTH that the
// panel says solved AND that the mock board, which judges the moves it
// received, reports a genuinely solved puzzle. Also covers the popup, the
// welcome page on install, a settings change travelling popup -> page
// (auto-solve and appearance), the userscript, and `web-ext lint` on the
// Firefox build.
import type { BrowserContext, Page } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXT, launch as launchBrowser } from './mock/harness.ts';
import { GAMES, mockSwitchScript, type Game } from './mock/linkedin.ts';

const USERSCRIPT = resolve('dist/larpedin.user.js');
const PANEL_TIMEOUT = 15_000;
const SOLVE_TIMEOUT = 25_000;

if (!existsSync(`${EXT}/manifest.json`) || !existsSync(USERSCRIPT)) throw new Error('run `npm run build` first');

// ---------- tiny test runner ----------
const results: { name: string; ok: boolean; note: string }[] = [];
async function test(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const note = (await fn()) || '';
    results.push({ name, ok: true, note });
    console.log(`  ok    ${name}${note ? `  (${note})` : ''}  ${Date.now() - t0} ms`);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).split('\n').slice(0, 4).join(' | ');
    results.push({ name, ok: false, note: msg });
    console.log(`  FAIL  ${name}: ${msg}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

// ---------- harness ----------
const launch = (o: { extension: boolean; colorScheme?: 'light' | 'dark' }) => launchBrowser(o);

const errorsOf = new WeakMap<Page, string[]>();
function track(page: Page) {
  const errs: string[] = [];
  errorsOf.set(page, errs);
  page.on('pageerror', (e) => errs.push(e.message));
  return page;
}
const pageErrors = (p: Page) => errorsOf.get(p) ?? [];

async function openGame(ctx: BrowserContext, game: Game) {
  const page = track(await ctx.newPage());
  await page.goto(`https://www.linkedin.com/games/${game}/`);
  await page.locator('larpedin-panel .card').waitFor({ timeout: PANEL_TIMEOUT });
  return page;
}
const phaseOf = (page: Page) => page.evaluate(() =>
  (document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('.card') as HTMLElement).dataset.phase);
const panelMessage = (page: Page) => page.evaluate(() =>
  document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('.msg-text')!.textContent);
const mockSolved = (page: Page) => page.evaluate(() => (window as any).__mock.solved() as boolean);

async function waitFinished(page: Page) {
  await page.waitForFunction(() => {
    const c = document.querySelector('larpedin-panel')?.shadowRoot?.querySelector('.card') as HTMLElement | undefined;
    return c && (c.dataset.phase === 'done' || c.dataset.phase === 'error');
  }, null, { timeout: SOLVE_TIMEOUT });
}

/** Solve through `how` and assert both the panel and the mock board agree. */
async function solveAndCheck(page: Page, game: Game, how: 'button' | 'altS'): Promise<string> {
  assert(!(await mockSolved(page)), 'mock board started out solved');
  if (how === 'button') await page.locator('larpedin-panel #ll-solve').click();
  else { await page.locator('.top').click(); await page.keyboard.press('Alt+KeyS'); }
  await waitFinished(page);
  const phase = await phaseOf(page);
  const msg = await panelMessage(page);
  assert(phase === 'done', `panel phase is ${phase}: ${msg}`);
  assert(/solved/i.test(msg ?? ''), `panel message does not say solved: ${msg}`);
  assert(await mockSolved(page), `${game}: panel says done but the mock board is NOT solved`);
  assert(await page.evaluate(() => document.body.dataset.solved === '1'), 'mock banner not shown');
  const errs = pageErrors(page);
  assert(!errs.length, `page errors: ${errs.join(' | ')}`);
  return msg ?? '';
}

// ======================================================================
console.log('Extension (dist/extension) in Chromium');
const ext = await launch({ extension: true });
const extId = ext.id;

await test('extension loads, service worker runs', async () => {
  assert(/^[a-p]{32}$/.test(extId), `bad extension id ${extId}`);
  return extId;
});

await test('welcome page opens on install', async () => {
  const t0 = Date.now();
  let page: Page | undefined;
  while (!page && Date.now() - t0 < 10_000) {
    page = ext.ctx.pages().find((p) => p.url().endsWith('/welcome.html'));
    if (!page) await new Promise((r) => setTimeout(r, 200));
  }
  assert(page, 'no welcome.html tab opened after install');
  track(page);
  await page.locator('h1').waitFor();
  assert((await page.locator('h1').textContent())?.includes('Welcome'), 'welcome heading missing');
  assert(await page.locator('#games a').count() === 5, 'welcome page should list 5 games');
  assert(!pageErrors(page).length, `welcome page errors: ${pageErrors(page)}`);
  await page.close();
});

for (const how of ['button', 'altS'] as const) {
  for (const game of GAMES) {
    await test(`${game}: ${how === 'button' ? 'Solve button' : 'Alt+S'} solves the board`, async () => {
      const page = await openGame(ext.ctx, game);
      const msg = await solveAndCheck(page, game, how);
      await page.close();
      return msg;
    });
  }
}

// ---------- popup ----------
await test('popup shows status of the game tab and Solve now works', async () => {
  const game = await openGame(ext.ctx, 'queens');
  await game.bringToFront();
  const tabId = await ext.sw!.evaluate(async () =>
    (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  const popup = track(await ext.ctx.newPage());
  // The popup asks for the *active* tab; a normal tab can't be both, so point it at the game tab.
  await popup.addInitScript((id) => { chrome.tabs.query = (async () => [{ id }]) as any; }, tabId);
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.locator('#status-title').waitFor();
  await popup.waitForFunction(() => /ready/i.test(document.getElementById('status-title')!.textContent || ''), null, { timeout: 5000 });
  assert(!(await popup.locator('#solve').isHidden()), 'Solve now button hidden on a game tab');
  assert((await popup.locator('#games a').count()) === 5, 'popup lists 5 games');
  assert(/^v\d/.test((await popup.locator('#ver').textContent()) ?? ''), 'version missing');
  await popup.locator('#solve').click();
  await popup.waitForFunction(() => /solved/i.test(document.getElementById('status-title')!.textContent || ''), null, { timeout: SOLVE_TIMEOUT });
  assert(await mockSolved(game), 'popup said solved but the mock board is not');
  assert(!pageErrors(popup).length, `popup errors: ${pageErrors(popup)}`);
  await popup.close(); await game.close();
});

await test('popup off a LinkedIn tab says so', async () => {
  const popup = track(await ext.ctx.newPage());
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForFunction(() => /Not on a LinkedIn/i.test(document.getElementById('status-title')!.textContent || ''), null, { timeout: 5000 });
  assert(await popup.locator('#solve').isHidden(), 'Solve now should be hidden off LinkedIn');
  await popup.close();
});

// ---------- settings travel: popup -> storage -> bridge -> page ----------
await test('auto-solve toggled in the popup reaches the page and solves a new board', async () => {
  const open = await openGame(ext.ctx, 'tango');
  const popup = track(await ext.ctx.newPage());
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.locator('#auto').waitFor();
  await popup.locator('#auto').check();
  // the already-open panel follows
  await open.waitForFunction(() =>
    (document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('#ll-auto') as HTMLInputElement).checked, null, { timeout: 5000 });
  // and a fresh board solves itself, with no click
  const fresh = await openGame(ext.ctx, 'queens');
  await waitFinished(fresh);
  assert((await phaseOf(fresh)) === 'done', `auto-solve phase ${await phaseOf(fresh)}: ${await panelMessage(fresh)}`);
  assert(await mockSolved(fresh), 'auto-solve said done but the mock board is not solved');
  // The open tab was already waiting on its board before the toggle: it stays untouched until asked.
  await popup.locator('#auto').uncheck();
  await open.waitForFunction(() =>
    !(document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('#ll-auto') as HTMLInputElement).checked, null, { timeout: 5000 });
  await Promise.all([popup.close(), open.close(), fresh.close()]);
});

await test('Appearance: Light is the default even on a dark OS; Dark and Match device apply to panel and popup', async () => {
  const dark = await launch({ extension: true, colorScheme: 'dark' });
  try {
    const bg = (p: Page, sel: string) => p.evaluate((s) => {
      const root = document.querySelector('larpedin-panel')?.shadowRoot;
      const e = (s.startsWith('panel:') ? root!.querySelector(s.slice(6)) : document.querySelector(s)) as HTMLElement;
      return getComputedStyle(e).backgroundColor;
    }, sel);
    const CREAM = 'rgb(255, 251, 243)', DARK = 'rgb(34, 29, 24)';
    const page = await openGame(dark.ctx, 'queens');
    assert((await bg(page, 'panel:.card')) === CREAM, `panel not cream by default on a dark OS: ${await bg(page, 'panel:.card')}`);
    const welcome = track(await dark.ctx.newPage());
    await welcome.goto(`chrome-extension://${dark.id}/welcome.html`);
    assert((await bg(welcome, '.card')) === CREAM, 'welcome page not cream by default');
    assert(await welcome.locator('input[name="theme"][value="light"]').isChecked(), 'Appearance default is not Light');
    await welcome.locator('input[name="theme"][value="dark"]').check({ force: true });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('.card')!).backgroundColor === 'rgb(34, 29, 24)', null, { timeout: 5000 });
    assert((await bg(welcome, '.card')) === DARK, 'welcome page did not go dark');
    const popup = track(await dark.ctx.newPage());
    await popup.goto(`chrome-extension://${dark.id}/popup.html`);
    assert((await bg(popup, '.card')) === DARK, 'popup did not follow Dark');
    await welcome.locator('input[name="theme"][value="auto"]').check({ force: true });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('.card')!).backgroundColor === 'rgb(34, 29, 24)', null, { timeout: 5000 });
    await welcome.locator('input[name="theme"][value="light"]').check({ force: true });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('.card')!).backgroundColor === 'rgb(255, 251, 243)', null, { timeout: 5000 });
    const errs = [...pageErrors(page), ...pageErrors(welcome), ...pageErrors(popup)];
    assert(!errs.length, `errors: ${errs.join(' | ')}`);
  } finally { await dark.close(); }
});

await test('welcome page settings (Zip input) reach the page panel', async () => {
  const page = await openGame(ext.ctx, 'zip');
  const welcome = track(await ext.ctx.newPage());
  await welcome.goto(`chrome-extension://${extId}/welcome.html`);
  await welcome.locator('input[name="zipInput"][value="keyboard"]').check({ force: true });
  await page.waitForFunction(() => {
    const r = document.querySelector('larpedin-panel')!.shadowRoot!;
    return (r.querySelector('input[name="zipInput"][value="keyboard"]') as HTMLInputElement | null)?.checked;
  }, null, { timeout: 5000 });
  // and the keyboard path really solves the Zip mock (no mouse drag was used)
  await solveAndCheck(page, 'zip', 'button');
  assert((await page.evaluate(() => (window as any).__mock.log.events.mousedown)) === 0, 'Zip keyboard mode still dragged with the mouse');
  await welcome.locator('input[name="zipInput"][value="mouse"]').check({ force: true });
  await Promise.all([welcome.close(), page.close()]);
});

await test('client-side navigation between games: the panel follows and solves the next board', async () => {
  const page = await openGame(ext.ctx, 'zip');
  await solveAndCheck(page, 'zip', 'button');
  await page.evaluate(mockSwitchScript('tango'));
  await page.waitForFunction(() =>
    document.querySelector('larpedin-panel')?.shadowRoot?.querySelector('.game-name')?.textContent === 'Tango', null, { timeout: 5000 });
  await page.waitForFunction(() => /ready|found/i.test(document.querySelector('larpedin-panel')!.shadowRoot!.querySelector('.msg-text')!.textContent || ''), null, { timeout: 5000 });
  await solveAndCheck(page, 'tango', 'altS');
  await page.close();
});

await test('no mock request left the sandbox', async () => {
  assert(ext.served.length >= 10, `expected the mock to serve the game pages, served ${ext.served.length}`);
});
await ext.close();

// ======================================================================
console.log('Userscript (dist/larpedin.user.js) injected as a page script');
const header = readFileSync(USERSCRIPT, 'utf8').split('==/UserScript==')[0];
await test('userscript header is a one-click install', async () => {
  const want: [string, RegExp][] = [
    ['@grant', /@grant\s+none/], ['@inject-into', /@inject-into\s+page/], ['@run-at', /@run-at\s+document-idle/],
    ['@match', /@match\s+https:\/\/www\.linkedin\.com\/\*/], ['@icon', /@icon\s+https:\/\//], ['@namespace', /@namespace\s+\S+/],
    ['@homepageURL', /@homepageURL\s+https:\/\/gourdingourdin\.github\.io\/larpedin\//],
    ['@supportURL', /@supportURL\s+https:\/\/github\.com\/GourdinGourdin\/larpedin\/issues/],
    ['@downloadURL', /@downloadURL\s+https:\/\/gourdingourdin\.github\.io\/larpedin\/downloads\/larpedin\.user\.js/],
    ['@updateURL', /@updateURL\s+https:\/\/gourdingourdin\.github\.io\/larpedin\/downloads\/larpedin\.user\.js/],
  ];
  const missing = want.filter(([, re]) => !re.test(header)).map(([k]) => k);
  assert(!missing.length, `missing/incorrect: ${missing.join(', ')}`);
});

const us = await launch({ extension: false });
for (const game of GAMES) {
  await test(`userscript solves ${game}`, async () => {
    const page = track(await us.ctx.newPage());
    await page.goto(`https://www.linkedin.com/games/${game}/`);
    await page.addScriptTag({ content: readFileSync(USERSCRIPT, 'utf8') });
    await page.locator('larpedin-panel .card').waitFor({ timeout: PANEL_TIMEOUT });
    const msg = await solveAndCheck(page, game, 'button');
    await page.close();
    return msg;
  });
}
await us.close();

// ======================================================================
console.log('Firefox build lint');
await test('web-ext lint dist/firefox has no errors', async () => {
  const r = spawnSync('npx', ['web-ext', 'lint', '--source-dir', 'dist/firefox', '--output', 'json', '--no-config-discovery'], { encoding: 'utf8' });
  let report: any;
  try { report = JSON.parse(r.stdout); } catch { throw new Error(`web-ext output unreadable: ${(r.stderr || r.stdout).slice(0, 300)}`); }
  const errs = report.errors ?? [];
  assert(!errs.length, errs.map((e: any) => `${e.code}: ${e.message}`).join(' | '));
  return `${report.warnings?.length ?? 0} warnings, ${report.notices?.length ?? 0} notices`;
});

await test('web-ext lint --self-hosted dist/firefox-selfhosted has no errors and carries update_url', async () => {
  const r = spawnSync('npx', ['web-ext', 'lint', '--source-dir', 'dist/firefox-selfhosted', '--self-hosted', '--output', 'json', '--no-config-discovery'], { encoding: 'utf8' });
  const report = JSON.parse(r.stdout);
  assert(!(report.errors ?? []).length, (report.errors as any[]).map((e) => `${e.code}: ${e.message}`).join(' | '));
  const m = JSON.parse(readFileSync('dist/firefox-selfhosted/manifest.json', 'utf8'));
  assert(m.browser_specific_settings.gecko.update_url === 'https://gourdingourdin.github.io/larpedin/downloads/firefox-updates.json', 'update_url missing');
  assert(!JSON.parse(readFileSync('dist/firefox/manifest.json', 'utf8')).browser_specific_settings.gecko.update_url, 'store build must not carry update_url');
});

// ---------- summary ----------
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { for (const f of failed) console.log(`  FAIL ${f.name}: ${f.note}`); process.exit(1); }
