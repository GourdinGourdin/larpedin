// Builds Linkedin Larp:
//   dist/extension/              unpacked MV3 extension (load in chrome://extensions)
//   dist/linkedin-larp-<v>.zip   the same folder, zipped for upload
//   dist/linkedin-larp.user.js   userscript (page script only, settings in localStorage)
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
writeFileSync(`${out}/manifest.json`, JSON.stringify({
  manifest_version: 3,
  name: BRAND.name,
  short_name: 'Larp',
  version: pkg.version,
  description,
  icons,
  action: { default_title: BRAND.name, default_popup: 'popup.html', default_icon: icons },
  options_ui: { page: 'welcome.html', open_in_tab: true },
  background: { service_worker: 'background.js' },
  permissions: ['storage'],
  commands: {
    solve: { suggested_key: { default: 'Alt+S' }, description: 'Solve the puzzle on this page' },
  },
  content_scripts: [
    { matches, js: ['bridge.js'], run_at: 'document_idle' },
    { matches, js: ['content.js'], run_at: 'document_idle', world: 'MAIN' },
  ],
}, null, 2));

const zipName = `linkedin-larp-${pkg.version}.zip`;
rmSync(`dist/${zipName}`, { force: true });
execFileSync('zip', ['-qrX', `../${zipName}`, '.'], { cwd: out });

writeFileSync('dist/linkedin-larp.user.js', `// ==UserScript==
// @name         ${BRAND.name}
// @namespace    linkedin-larp
// @version      ${pkg.version}
// @description  ${description}
// @match        https://www.linkedin.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
${files['content.js']}`);

const kb = (s) => `${(s.length / 1024).toFixed(1)} KB`;
console.log(`built ${out} (content ${kb(files['content.js'])}, popup ${kb(files['popup.js'])}), dist/${zipName}, dist/linkedin-larp.user.js`);
