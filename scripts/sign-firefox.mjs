// Signs the self-hosted Firefox build with Mozilla (unlisted channel) and puts
// the result on the site:
//
//   AMO_JWT_ISSUER=user:123:45 AMO_JWT_SECRET=... npm run sign:firefox
//
// Keys come from the environment only (addons.mozilla.org > Tools > Manage API
// Keys); nothing is written to disk. Signing the same version twice fails, so
// bump package.json's version for every new XPI.
//
// Output: site/downloads/larpedin.xpi, firefox-updates.json (the self-update
// manifest Firefox polls) and an `xpi` entry in site/downloads/latest.json.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XPI, writeUpdateManifest } from './xpi.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issuer = process.env.AMO_JWT_ISSUER, secret = process.env.AMO_JWT_SECRET;
if (!issuer || !secret) {
  console.error('sign:firefox needs AMO_JWT_ISSUER and AMO_JWT_SECRET in the environment (AMO > Tools > Manage API Keys).');
  process.exit(1);
}
const src = join(root, 'dist', 'firefox-selfhosted');
if (!existsSync(join(src, 'manifest.json'))) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

const out = mkdtempSync(join(tmpdir(), 'larp-sign-'));
try {
  // web-ext reads the keys from WEB_EXT_API_KEY / WEB_EXT_API_SECRET, so they never appear in argv.
  execFileSync('npx', ['web-ext', 'sign', '--channel=unlisted', '--source-dir', src, '--artifacts-dir', out], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, WEB_EXT_API_KEY: issuer, WEB_EXT_API_SECRET: secret },
  });
  const xpi = readdirSync(out).find((f) => f.endsWith('.xpi'));
  if (!xpi) throw new Error('web-ext sign finished without an .xpi (check the AMO dashboard).');
  const dir = join(root, 'site', 'downloads');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(out, xpi), join(dir, XPI));
  const entry = writeUpdateManifest(dir);
  const latestPath = join(dir, 'latest.json');
  if (existsSync(latestPath)) {
    const latest = JSON.parse(readFileSync(latestPath, 'utf8'));
    writeFileSync(latestPath, JSON.stringify({ ...latest, xpi: entry }, null, 2) + '\n');
  }
  console.log(`sign:firefox: site/downloads/${XPI} v${entry.version} (${(entry.size / 1024).toFixed(0)} KB). Run \`npm run site:build\` to refresh latest.json if it did not exist.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
