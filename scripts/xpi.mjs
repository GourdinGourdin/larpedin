// Shared by package-site.mjs and sign-firefox.mjs: describes the signed,
// self-hosted Firefox add-on (site/downloads/larpedin.xpi) and writes
// firefox-updates.json, which Firefox polls (manifest gecko.update_url).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SITE = 'https://gourdingourdin.github.io/larpedin/';
export const XPI = 'larpedin.xpi';
export const UPDATES = 'firefox-updates.json';

/** { file, size, version } of the signed XPI in `dir`, or null when there is none. */
export function describeXpi(dir) {
  const path = join(dir, XPI);
  if (!existsSync(path)) return null;
  const manifest = JSON.parse(execFileSync('unzip', ['-p', path, 'manifest.json'], { maxBuffer: 1 << 24 }).toString());
  return { file: XPI, size: statSync(path).size, version: manifest.version, id: manifest.browser_specific_settings?.gecko?.id };
}

/**
 * Write firefox-updates.json for the XPI in `dir` (Firefox's update manifest).
 * Returns the `xpi` entry for latest.json ({ file, size, version }) or null.
 */
export function writeUpdateManifest(dir) {
  const x = describeXpi(dir);
  if (!x) return null;
  const sha = createHash('sha256').update(readFileSync(join(dir, XPI))).digest('hex');
  const updates = {
    addons: { [x.id]: { updates: [{ version: x.version, update_link: `${SITE}downloads/${XPI}`, update_hash: `sha256:${sha}` }] } },
  };
  writeFileSync(join(dir, UPDATES), JSON.stringify(updates, null, 2) + '\n');
  return { file: x.file, size: x.size, version: x.version };
}
