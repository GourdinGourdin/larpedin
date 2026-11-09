// QA: transcribes out/audio/voice.wav with Whisper (tiny.en, local, via transformers.js)
// so you can check Kokoro said what the captions say. Usage: node check-voice.mjs
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dirname;
env.cacheDir = join(DIR, '.cache', 'hf');
const buf = readFileSync(join(DIR, 'out', 'audio', 'voice.wav'));
const sr = buf.readUInt32LE(24), n = (buf.length - 44) / 2;
let x = new Float32Array(n);
for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(44 + i * 2) / 32768;
if (sr !== 16000) { // linear resample to 16 kHz
  const m = Math.floor(n * 16000 / sr), y = new Float32Array(m);
  for (let i = 0; i < m; i++) { const p = i * sr / 16000, k = Math.floor(p); y[i] = x[k] + (x[Math.min(n - 1, k + 1)] - x[k]) * (p - k); }
  x = y;
}
const asr = await pipeline('automatic-speech-recognition', process.argv[2] ?? 'Xenova/whisper-tiny.en', { dtype: 'q8' });
const r = await asr(x, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
for (const c of r.chunks) console.log(`[${c.timestamp.map((v) => v?.toFixed(1)).join('-')}] ${c.text}`);
