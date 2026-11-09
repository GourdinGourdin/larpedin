// Bundles src/page/main.ts into an unpacked Chrome extension and a userscript.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
mkdirSync('dist/extension', { recursive: true });

const res = await build({
  entryPoints: ['src/page/main.ts'],
  bundle: true, format: 'iife', target: 'chrome120', write: false, minify: false,
});
const code = res.outputFiles[0].text;

writeFileSync('dist/extension/content.js', code);
writeFileSync('dist/extension/manifest.json', JSON.stringify({
  manifest_version: 3,
  name: 'LinkedIn Games Solver (personal)',
  version: pkg.version,
  description: 'Reads, solves and plays LinkedIn Zip, Queens, Tango and Patches.',
  content_scripts: [{
    matches: ['https://www.linkedin.com/*'],
    js: ['content.js'],
    run_at: 'document_idle',
    world: 'MAIN',
  }],
}, null, 2));

writeFileSync('dist/linkedin-games-solver.user.js', `// ==UserScript==
// @name         LinkedIn Games Solver (personal)
// @version      ${pkg.version}
// @match        https://www.linkedin.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
${code}`);
console.log(`built dist/extension (${(code.length / 1024).toFixed(1)} KB)`);
