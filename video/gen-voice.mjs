// Generates the voice-over with Kokoro-82M (Apache-2.0) running locally via kokoro-js,
// then lays the lines out on the music's beat grid and writes:
//   out/audio/voice.wav  - the assembled narration (24 kHz mono)
//   timeline.js          - window.TL: line/word timings the scene + captions are driven by
// Usage: node gen-voice.mjs [voice=af_heart]
// First run downloads the ONNX model (~90 MB) from Hugging Face into video/.cache/hf (no account needed).
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeWav } from './wav.mjs';

const DIR = import.meta.dirname;
env.cacheDir = join(DIR, '.cache', 'hf');
const VOICE = process.argv[2] ?? 'af_heart';
export const BPM = 90;
const BEAT = 60 / BPM;

// say: what Kokoro reads; cap: what is burned in as captions (same words).
// hold: extra seconds of visuals after the line before the next one may start.
const LINES = [
  { id: 'hook',  say: 'Five LinkedIn puzzles every day? Let Larped In play them for you.', cap: 'Five LinkedIn puzzles every day? Let LarpedIn play them for you.', hold: 0.3 },
  { id: 'read',  say: 'Step one: it reads the board straight from the page. No screenshots.', hold: 0.9 },
  { id: 'solve', say: 'Step two: it tries every move, and prunes the dead ends, in a blink.', hold: 1.3 },
  { id: 'play',  say: 'Step three: it plays the answer for you, in one smooth drag.', hold: 0.9 },
  { id: 'all',   say: 'Same trick for Zip, Queens, Tango, and Patches.', hold: 0.6 },
  { id: 'wend',  say: 'And it already snakes through the brand new Wend.', hold: 2.6 },
  { id: 'outro', say: 'Larped In. Reads. Solves. Plays. Which puzzle should it beat next?', cap: 'LarpedIn. Reads. Solves. Plays. Which puzzle should it beat next?', hold: 2.4 },
];

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const SR = 24000;

// trim leading/trailing silence
function trim(x) {
  const th = 0.012; let a = 0, b = x.length - 1;
  while (a < b && Math.abs(x[a]) < th) a++;
  while (b > a && Math.abs(x[b]) < th) b--;
  return x.slice(Math.max(0, a - 240), Math.min(x.length, b + 1200));
}

// Pauses inside a clip: runs of 10 ms windows with low RMS lasting >= 70 ms.
function pauses(x) {
  const win = SR / 100, out = [];
  let run = 0;
  for (let i = 0; i * win < x.length; i++) {
    let s = 0;
    for (let j = i * win; j < Math.min(x.length, (i + 1) * win); j++) s += x[j] * x[j];
    if (Math.sqrt(s / win) < 0.01) run++;
    else { if (run >= 7) out.push({ a: (i - run) / 100, b: i / 100 }); run = 0; }
  }
  return out;
}

// Word timings: split at punctuation into phrases, snap phrase boundaries to the
// longest real pauses in the audio, then spread words in a phrase by letter count.
function wordTimes(cap, x) {
  const dur = x.length / SR;
  const words = cap.split(/\s+/);
  const phrases = [[]];
  words.forEach((w, i) => { phrases.at(-1).push(w); if (/[.?!:,]$/.test(w) && i < words.length - 1) phrases.push([]); });
  const gaps = pauses(x).filter((p) => p.a > 0.1 && p.b < dur - 0.1)
    .sort((p, q) => (q.b - q.a) - (p.b - p.a)).slice(0, phrases.length - 1).sort((p, q) => p.a - q.a);
  let bounds;
  if (gaps.length === phrases.length - 1) {
    bounds = phrases.map((_, i) => [i ? gaps[i - 1].b : 0, i < gaps.length ? gaps[i].a : dur]);
  } else { // fall back to proportional
    const len = phrases.map((p) => p.join(' ').length); const tot = len.reduce((a, b) => a + b, 0);
    let acc = 0; bounds = len.map((l) => { const s = acc / tot * dur; acc += l; return [s, acc / tot * dur]; });
  }
  const res = [];
  phrases.forEach((p, k) => {
    const [a, b] = bounds[k];
    const wt = p.map((w) => w.replace(/[^\w']/g, '').length + 1.2); const tot = wt.reduce((m, n) => m + n, 0);
    let acc = 0;
    p.forEach((w, i) => { const s = a + (acc / tot) * (b - a); acc += wt[i]; res.push({ w, s: +s.toFixed(3), e: +(a + (acc / tot) * (b - a)).toFixed(3) }); });
  });
  return res;
}

const clips = [];
for (const L of LINES) {
  const a = await tts.generate(L.say, { voice: VOICE, speed: 1.05 });
  const x = trim(a.audio);
  clips.push(x);
  console.log(`${L.id.padEnd(6)} ${(x.length / SR).toFixed(2)} s  ${L.say}`);
}

// place lines on the beat grid: each line starts on the first beat after prev end + hold
let t = 0.2;
const lines = LINES.map((L, i) => {
  const dur = clips[i].length / SR;
  const start = i === 0 ? t : Math.ceil((t + 0.05) / BEAT) * BEAT;
  t = start + dur + L.hold;
  return { id: L.id, start: +start.toFixed(3), dur: +dur.toFixed(3), text: L.cap ?? L.say, words: wordTimes(L.cap ?? L.say, clips[i]) };
});
const DURATION = +(Math.ceil(t / BEAT) * BEAT).toFixed(3);

const voice = new Float32Array(Math.ceil(DURATION * SR));
lines.forEach((l, i) => voice.set(clips[i], Math.round(l.start * SR)));
mkdirSync(join(DIR, 'out', 'audio'), { recursive: true });
writeWav(join(DIR, 'out', 'audio', 'voice.wav'), [voice], SR);
writeFileSync(join(DIR, 'timeline.js'), `// generated by gen-voice.mjs (voice ${VOICE})\nwindow.TL = ${JSON.stringify({ bpm: BPM, duration: DURATION, voice: VOICE, lines })};\n`);
console.log(`duration ${DURATION} s, words ${lines.reduce((n, l) => n + l.words.length, 0)}`);
