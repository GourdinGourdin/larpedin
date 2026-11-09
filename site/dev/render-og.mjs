// Renders site/dev/og.html to site/assets/og.png (1200x630) and the PNG icons from site/assets/icon.svg.
//   npm run site:og
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './chromium.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(site, 'dev/og.html')).href);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(site, 'assets/og.png') });
  console.log('wrote site/assets/og.png');

  for (const size of [32, 180]) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    const pad = size >= 180 ? 0 : 0;
    await p.setContent(`<html><body style="margin:0;background:transparent"><img src="${pathToFileURL(join(site, 'assets/icon.svg')).href}" style="width:${size - pad * 2}px;height:${size - pad * 2}px;margin:${pad}px;display:block"></body></html>`);
    await p.waitForLoadState('networkidle');
    await p.screenshot({ path: join(site, `assets/icon-${size}.png`), omitBackground: true });
    console.log(`wrote site/assets/icon-${size}.png`);
  }
} finally {
  await browser.close();
}
