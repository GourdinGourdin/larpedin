// Launches Chromium (Playwright's Chrome for Testing) with the built extension
// loaded and every request to linkedin.com answered by a local mock page.
// Shared by scripts/test-ext.ts and scripts/store-assets.ts.
import { chromium, type Worker } from 'playwright-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromiumPath } from '../chromium.ts';
import { mockPageHtml, type Game } from './linkedin.ts';

export const EXT = resolve('dist/extension');

export interface LaunchOptions {
  /** load dist/extension (default true); false = plain browser, for the userscript */
  extension?: boolean;
  colorScheme?: 'light' | 'dark';
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  /** mock pages without the "mock page for tests" label, for store screenshots */
  shot?: boolean;
}

export async function launch(opts: LaunchOptions = {}) {
  const extension = opts.extension ?? true;
  const dir = mkdtempSync(join(tmpdir(), 'larp-e2e-'));
  const args = ['--headless=new', '--no-first-run', '--no-default-browser-check'];
  if (extension) args.push(`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: chromiumPath(), headless: false, args,
    viewport: opts.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
    colorScheme: opts.colorScheme ?? 'light', acceptDownloads: false,
  });
  const served: string[] = [];
  // The hard rule: linkedin.com is only ever answered locally, any other host is refused.
  await ctx.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'www.linkedin.com') {
      const m = url.pathname.match(/^\/games\/(zip|queens|tango|patches|wend)\/?$/);
      if (m) {
        served.push(url.pathname);
        return route.fulfill({ status: 200, contentType: 'text/html', body: mockPageHtml(m[1] as Game, { shot: opts.shot }) });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>mock</title><p>mock home</p>' });
    }
    return route.abort();
  });
  let sw: Worker | undefined;
  let id = '';
  if (extension) {
    sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
    id = new URL(sw.url()).host;
  }
  return { ctx, sw, id, served, close: async () => { await ctx.close(); rmSync(dir, { recursive: true, force: true }); } };
}
