// Launches Playwright's cached Chromium (dev only). Override with CHROMIUM_PATH.
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const candidates = [];
  try {
    for (const d of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      candidates.push(join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
      candidates.push(join(cache, d, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
      candidates.push(join(cache, d, 'chrome-linux/chrome'));
    }
  } catch {}
  return candidates.find(existsSync);
}

export async function launch() {
  const executablePath = findChromium();
  if (!executablePath) throw new Error('No Chromium found. Run `npx playwright install chromium` or set CHROMIUM_PATH.');
  return chromium.launch({ executablePath, headless: true });
}
