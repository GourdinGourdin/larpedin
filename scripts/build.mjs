// Builds LarpedIn:
//   dist/extension/              unpacked MV3 extension for Chrome, Edge, Brave, Opera
//   dist/firefox/, dist/safari/  the same files with each browser's manifest
//   dist/firefox-selfhosted/     the Firefox build plus gecko.update_url, for `npm run sign:firefox` (unlisted, self-hosted XPI)
//   dist/store/*.zip             store uploads (Chrome Web Store / Edge, Firefox AMO, source for AMO)
//   dist/larpedin-<v>.zip   dist/extension zipped
//   dist/larpedin.user.js   userscript (page script only, settings in localStorage)
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { BRAND, GAME_THEME } from '../src/page/theme.ts';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const out = 'dist/extension';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const entries = {
  content: 'src/page/main.ts',          // MAIN world: reads/solves/plays, draws the panel
  bridge: 'src/page/bridge.ts',         // ISOLATED world: chrome.storage <-> page relay
  background: 'src/extension/background.ts',
  popup: 'src/extension/popup.ts',
  welcome: 'src/extension/welcome.ts',
};
const res = await build({
  entryPoints: entries,
  outdir: out,
  bundle: true, format: 'iife', target: 'chrome120', write: false, minify: false,
  define: { __LARP_VERSION__: JSON.stringify(pkg.version) },
  legalComments: 'none',
});
const files = Object.fromEntries(res.outputFiles.map((f) => [f.path.split('/').pop(), f.text]));
for (const [name, text] of Object.entries(files)) writeFileSync(`${out}/${name}`, text);

for (const f of ['popup.html', 'welcome.html', 'ui.css']) cpSync(`src/extension/${f}`, `${out}/${f}`);
cpSync('src/extension/icons', `${out}/icons`, { recursive: true });

const names = Object.values(GAME_THEME).map((t) => t.name);
const list = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
const description = `Solves LinkedIn's daily ${list} puzzles right on the page. Not affiliated with LinkedIn.`;
if (description.length > 132) throw new Error(`manifest description is ${description.length} chars (max 132)`);

const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
const matches = ['https://www.linkedin.com/*'];

// One manifest, three flavours. Every browser gets the same files; only the
// manifest differs.
//   chrome  : Chrome Web Store zip. Also what Edge Add-ons, Opera and Brave take.
//   firefox : addons.mozilla.org (desktop + Android). Firefox has no MV3 service
//             workers, so the background runs as an event page, and AMO needs an
//             add-on id and a data-collection declaration.
//   safari  : input for `xcrun safari-web-extension-converter` (scripts/safari.sh),
//             which wraps it in a macOS + iOS app for the App Store.
// content.js runs in the page's MAIN world. Where a browser ignores `world`,
// content.js notices it is in the isolated world and re-injects itself as a
// <script> from web_accessible_resources (see src/page/main.ts).
const GECKO_ID = 'larpedin@larpedin.app'; // permanent once published on AMO
const SITE = 'https://gourdingourdin.github.io/larpedin/';
const REPO = 'https://github.com/GourdinGourdin/larpedin';
const UPDATE_URL = `${SITE}downloads/firefox-updates.json`;
function manifest(target) {
  const m = {
    manifest_version: 3,
    name: BRAND.name,
    short_name: 'LarpedIn',
    version: pkg.version,
    description,
    icons,
    action: { default_title: BRAND.name, default_popup: 'popup.html', default_icon: icons },
    options_ui: { page: 'welcome.html', open_in_tab: true },
    background: target.startsWith('firefox') ? { scripts: ['background.js'] } : { service_worker: 'background.js' },
    permissions: ['storage'],
    commands: {
      solve: { suggested_key: { default: 'Alt+S' }, description: 'Solve the puzzle on this page' },
    },
    content_scripts: [
      { matches, js: ['bridge.js'], run_at: 'document_idle' },
      { matches, js: ['content.js'], run_at: 'document_idle', world: 'MAIN' },
    ],
    web_accessible_resources: [{ resources: ['content.js'], matches }],
  };
  if (target === 'firefox' || target === 'firefox-selfhosted') {
    m.host_permissions = matches; // shown in the install prompt, so content scripts run without an extra click
    m.browser_specific_settings = {
      gecko: { id: GECKO_ID, strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } },
      gecko_android: { strict_min_version: '128.0' },
    };
  }
  // Self-hosted (unlisted) Firefox build: Firefox checks update_url for new signed XPIs.
  // addons.mozilla.org rejects update_url on listed add-ons, so the store build has none.
  if (target === 'firefox-selfhosted') m.browser_specific_settings.gecko.update_url = UPDATE_URL;
  if (target === 'safari') m.browser_specific_settings = { safari: { strict_min_version: '16.4' } };
  return m;
}

const zipDir = (dir, zipPath) => {
  rmSync(zipPath, { force: true });
  execFileSync('zip', ['-qrX', zipPath, '.'], { cwd: dir });
};

const targets = { chrome: out, firefox: 'dist/firefox', 'firefox-selfhosted': 'dist/firefox-selfhosted', safari: 'dist/safari' };
for (const [target, dir] of Object.entries(targets)) {
  if (dir !== out) { rmSync(dir, { recursive: true, force: true }); cpSync(out, dir, { recursive: true }); }
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest(target), null, 2));
}

// Store uploads: dist/store/larpedin-<target>-<v>.zip (manifest at the zip root).
rmSync('dist/store', { recursive: true, force: true });
mkdirSync('dist/store', { recursive: true });
for (const target of ['chrome', 'firefox']) zipDir(targets[target], `${process.cwd()}/dist/store/larpedin-${target}-${pkg.version}.zip`);
// Firefox reviewers ask for the source when the code is bundled.
execFileSync('git', ['archive', '--format=zip', '-o', `dist/store/larpedin-source-${pkg.version}.zip`, 'HEAD']);

const zipName = `larpedin-${pkg.version}.zip`;
zipDir(out, `${process.cwd()}/dist/${zipName}`);

writeFileSync('dist/larpedin.user.js', `// ==UserScript==
// @name         ${BRAND.name}
// @namespace    ${SITE}
// @version      ${pkg.version}
// @description  ${description}
// @author       LarpedIn
// @icon         ${SITE}downloads/icon-128.png
// @homepageURL  ${SITE}
// @supportURL   ${REPO}/issues
// @downloadURL  ${SITE}downloads/larpedin.user.js
// @updateURL    ${SITE}downloads/larpedin.user.js
// @match        https://www.linkedin.com/*
// @noframes
// @grant        none
// @inject-into  page
// @run-at       document-idle
// ==/UserScript==
${files['content.js']}`);

const kb = (s) => `${(s.length / 1024).toFixed(1)} KB`;
console.log(`built ${Object.values(targets).join(', ')} (content ${kb(files['content.js'])}, popup ${kb(files['popup.js'])}), dist/store/, dist/${zipName}, dist/larpedin.user.js`);
