// Serves site/, screenshots it at several widths with headless Chromium, and runs a few checks.
//   npm run site:shots        (run `npm run site:build` first so downloads/ exists)
// Output: site/screenshots/*.png (dev only, not part of the deployed site).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chromium.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(site, 'screenshots');
mkdirSync(out, { recursive: true });
const PORT = 4179, BASE = `http://localhost:${PORT}/`;

const server = spawn(process.execPath, [join(site, 'dev/serve.mjs'), String(PORT)], { stdio: 'pipe' });
await new Promise((ok) => server.stdout.once('data', ok));

const failures = [];
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures.push(msg); };

const browser = await launch();
try {
  // ---- download + latest.json over HTTP ----
  const zip = await fetch(BASE + 'downloads/linkedin-larp.zip');
  const buf = Buffer.from(await zip.arrayBuffer());
  check(zip.status === 200, `GET downloads/linkedin-larp.zip -> ${zip.status}`);
  check(zip.headers.get('content-type') === 'application/zip', `zip content-type ${zip.headers.get('content-type')}`);
  check(buf.subarray(0, 2).toString() === 'PK', `zip starts with PK (${buf.length} bytes)`);
  const latest = await (await fetch(BASE + 'downloads/latest.json')).json();
  check(latest.size === buf.length, `latest.json size matches (${latest.size})`);

  const shots = [
    { name: 'desktop-1440', viewport: { width: 1440, height: 900 } },
    { name: 'laptop-1024', viewport: { width: 1024, height: 768 } },
    { name: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
    { name: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
    { name: 'mobile-320', viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  ];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.viewport, isMobile: s.isMobile, hasTouch: s.hasTouch, deviceScaleFactor: s.deviceScaleFactor ?? 1, userAgent: s.userAgent });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    check(errors.length === 0, `${s.name}: no console errors ${errors.join(' | ')}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${s.name}: no horizontal scroll (overflow ${overflow}px)`);
    if (s.name === 'desktop-1440') {
      const v = await page.textContent('[data-version]');
      check(/^v\d/.test(v), `version label "${v}"`);
      const href = await page.getAttribute('.btn-big[data-download]', 'href');
      check(href === 'downloads/linkedin-larp.zip', `download href ${href}`);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.hero .btn-big')]);
      check(dl.suggestedFilename() === 'linkedin-larp.zip', `clicking Download saves ${dl.suggestedFilename()}`);
      // demo frames
      await page.locator('#how').scrollIntoViewIfNeeded();
      for (const [i, label] of [[0, 'read'], [1, 'solve'], [2, 'play']]) {
        await page.click(`[data-step-btn="${i}"]`);
        await page.waitForTimeout(i === 1 ? 1400 : 1100);
        await page.locator('[data-demo]').screenshot({ path: join(out, `demo-${i + 1}-${label}.png`) });
      }
      const bench = await page.textContent('[data-demo-bench-ms]');
      check(/ms/.test(bench), `in-browser bench "${bench}"`);
    }
    if (s.name === 'mobile-390') {
      const hint = await page.locator('.hero [data-browser-hint]');
      check(await hint.isVisible(), `mobile browser hint shown: "${(await hint.textContent()).slice(0, 50)}…"`);
    }
    // keyboard focus is visible on the first link
    if (s.name === 'laptop-1024') {
      await page.keyboard.press('Tab');
      await page.screenshot({ path: join(out, `focus-skip-link.png`), clip: { x: 0, y: 0, width: 600, height: 120 } });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(out, `${s.name}-top.png`) });
    await page.screenshot({ path: join(out, `${s.name}-full.png`), fullPage: true });
    await ctx.close();
  }

  // ---- reduced motion + Firefox hint ----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0' });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const pressed = await page.getAttribute('[data-demo-toggle]', 'aria-pressed');
  check(pressed === 'true', 'reduced motion: demo starts paused');
  check(await page.locator('.hero [data-browser-hint]').isVisible(), 'firefox UA: browser hint shown');
  await page.screenshot({ path: join(out, 'reduced-motion-firefox-top.png') });
  await page.locator('#how').screenshot({ path: join(out, 'reduced-motion-demo.png') });
  await ctx.close();
} finally {
  await browser.close();
  server.kill();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
