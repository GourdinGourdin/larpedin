// Contact sheet of rendered stills for layout QA: node sheet.mjs out/sheet.png t1,t2,... (3 per row)
// (render the stills first with: node render.mjs --stills t1,t2,...)
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const [outFile, list] = process.argv.slice(2);
const ts = list.split(',');
const inputs = ts.flatMap((t) => ['-i', join(import.meta.dirname, 'out', `still-${t}.png`)]);
const cols = 3, w = 540, h = 960;
const scaled = ts.map((_, i) => `[${i}]scale=${w}:${h}[s${i}]`).join(';');
const layout = ts.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|');
const graph = `${scaled};${ts.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${ts.length}:layout=${layout}:fill=white`;
const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, outFile], { stdio: 'inherit' });
process.exit(r.status);
