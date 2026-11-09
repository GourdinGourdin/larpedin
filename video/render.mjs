// Renders scene.html frame by frame and encodes an MP4.
// Usage: node render.mjs [fps=30] [--stills t1,t2,...]   -> out/larpedin-silent.mp4 (then: node mix.mjs)
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;
const fps = Number(args.find((a) => /^\d+$/.test(a)) ?? 30);

const cache = join(homedir(), 'Library/Caches/ms-playwright');
const chromeDir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
const executablePath = join(cache, chromeDir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(import.meta.dirname, 'scene.html')).href + '?render=1');
await page.waitForFunction(() => typeof window.renderAt === 'function');
await page.evaluate(() => document.fonts.ready);

const frame = (t, type = 'image/jpeg') => page.evaluate(([t, type]) => {
  window.renderAt(t);
  return document.getElementById('c').toDataURL(type, 0.95).split(',')[1];
}, [t, type]);

mkdirSync(join(import.meta.dirname, 'out'), { recursive: true });

if (stillsArg) {
  for (const t of stillsArg.split(',').map(Number)) {
    writeFileSync(join(import.meta.dirname, 'out', `still-${t}.png`), Buffer.from(await frame(t, 'image/png'), 'base64'));
  }
  await browser.close();
  console.log('stills written');
  process.exit(0);
}

const duration = await page.evaluate(() => window.DURATION);
const total = Math.round(duration * fps);
const out = join(import.meta.dirname, 'out', 'larpedin-silent.mp4');
const ff = spawn(ffmpegPath, [
  '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-r', String(fps), '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const buf = Buffer.from(await frame(i / fps), 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 150 === 0) console.log(`frame ${i}/${total}`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
