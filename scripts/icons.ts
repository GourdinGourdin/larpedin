// Renders the brand mark (theme.ts) to the extension's PNG icons and SVG.
//   node scripts/icons.ts        -> src/extension/icons/icon-{16,32,48,128}.png + icon.svg
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { markSvg } from '../src/page/theme.ts';
import { chromiumPath } from './chromium.ts';

const out = 'src/extension/icons';
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/icon.svg`, markSvg(128, 'Linkedin Larp'));

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markSvg(size)}</body></html>`);
  await page.locator('svg').screenshot({ path: `${out}/icon-${size}.png`, omitBackground: true });
  console.log(`${out}/icon-${size}.png`);
}
await browser.close();
