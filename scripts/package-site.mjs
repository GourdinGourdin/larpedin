// Builds the extension and packages it for the static site.
//
//   node scripts/package-site.mjs          (or: npm run site:build)
//
// 1. runs `npm run build` (writes dist/extension/ and dist/*.user.js)
// 2. zips dist/extension/ into site/downloads/larpedin.zip, inside a
//    top-level "larpedin/" folder so unzipping gives one folder to load
// 3. zips dist/firefox/ into site/downloads/larpedin-firefox.zip
// 4. copies the userscript to site/downloads/larpedin.user.js
// 5. copies the toolbar icon to site/downloads/icon-128.png (the userscript's @icon)
// 6. if site/downloads/larpedin.xpi exists (npm run sign:firefox, or the CI step), writes
//    firefox-updates.json next to it
// 7. writes site/downloads/latest.json, the contract with the website:
//      { name, version, file, size, sha256, userscript: { file, size },
//        xpi?: { file, size, version }, built }
//    which the page reads to show "v1.1.0, 45 KB".
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeUpdateManifest } from './xpi.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(root, 'dist', 'extension');
const outDir = join(root, 'site', 'downloads');
const ZIP = 'larpedin.zip';
const USERSCRIPT = 'larpedin.user.js';
const FOLDER = 'larpedin';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });

if (!process.argv.includes('--skip-build')) run('npm', ['run', 'build']);

if (!existsSync(join(extDir, 'manifest.json'))) {
  console.error(`package-site: ${extDir}/manifest.json not found. Did the build fail?`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));

mkdirSync(outDir, { recursive: true });
const zipPath = join(outDir, ZIP);
rmSync(zipPath, { force: true });

// Stage a copy under a stable folder name, then zip it (-X: no extra attrs, -q: quiet).
const stage = mkdtempSync(join(tmpdir(), 'larp-'));
try {
  cpSync(extDir, join(stage, FOLDER), { recursive: true });
  run('zip', ['-r', '-X', '-q', zipPath, FOLDER], { cwd: stage });
} finally {
  rmSync(stage, { recursive: true, force: true });
}

// Firefox build, for about:debugging until the AMO listing is live.
const ffZip = join(outDir, 'larpedin-firefox.zip');
rmSync(ffZip, { force: true });
run('zip', ['-r', '-X', '-q', ffZip, '.'], { cwd: join(root, 'dist', 'firefox') });

// Userscript (optional; the build names it, so pick whatever *.user.js it produced).
const userscripts = readdirSync(join(root, 'dist')).filter((f) => f.endsWith('.user.js'));
let userscript = null;
if (userscripts.length) {
  cpSync(join(root, 'dist', userscripts[0]), join(outDir, USERSCRIPT));
  userscript = { file: USERSCRIPT, size: statSync(join(outDir, USERSCRIPT)).size };
}

cpSync(join(root, 'src', 'extension', 'icons', 'icon-128.png'), join(outDir, 'icon-128.png'));

// Signed Firefox add-on, when one has been made for this site build.
const xpi = writeUpdateManifest(outDir);

const buf = readFileSync(zipPath);
const latest = {
  name: 'LarpedIn',
  version: manifest.version,
  file: ZIP,
  size: buf.length,
  sha256: createHash('sha256').update(buf).digest('hex'),
  userscript,
  ...(xpi ? { xpi } : {}),
  built: new Date().toISOString(),
};
writeFileSync(join(outDir, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');

console.log(`package-site: site/downloads/${ZIP} v${latest.version} ${(latest.size / 1024).toFixed(1)} KB sha256 ${latest.sha256.slice(0, 12)}...${xpi ? `, signed XPI v${xpi.version}` : ', no signed XPI yet (npm run sign:firefox)'}`);
