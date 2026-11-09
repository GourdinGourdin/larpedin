// Synthesises a chill lo-fi bed in plain JS (no samples, no models -> no licence questions).
// Soft Rhodes-ish chords, sub bass, dusty kick/snare, swung hats and vinyl crackle,
// on the same BPM / length as timeline.js so scene cuts land on the beat.
// Writes out/audio/music.wav (44.1 kHz stereo). Usage: node gen-music.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeWav } from './wav.mjs';

const DIR = import.meta.dirname;
const window = {}; eval(readFileSync(join(DIR, 'timeline.js'), 'utf8')); // eslint-disable-line no-eval
const { bpm, duration } = window.TL;
const SR = 44100, BEAT = 60 / bpm, BAR = BEAT * 4;
const N = Math.ceil((duration + 0.5) * SR);
const L = new Float32Array(N), R = new Float32Array(N);

// deterministic noise
let seed = 1234567;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const add = (i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

// Fmaj9 - Em7 - Dm9 - Cmaj7  (voicings as MIDI notes)
const CHORDS = [
  { root: 41, notes: [57, 60, 64, 67, 69] },
  { root: 40, notes: [55, 59, 62, 64, 67] },
  { root: 38, notes: [57, 60, 62, 65, 69] },
  { root: 36, notes: [55, 59, 60, 64, 67] },
];

// Rhodes-ish electric piano: sine + soft bell partial, slow tremolo, gentle decay
function ep(t0, midi, len, vel, pan) {
  const f = mtof(midi), n = Math.floor((len + 1.2) * SR), s0 = Math.floor(t0 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 1.1) * (t > len ? Math.exp(-(t - len) * 6) : 1);
    const v = (Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 4)
      + 0.06 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(-t * 8)) * env * vel * (1 + 0.12 * Math.sin(2 * Math.PI * 4.2 * t));
    add(s0 + i, v * (1 - pan) * 0.9, v * (1 + pan) * 0.9);
  }
}
function bass(t0, midi, len, vel) {
  const f = mtof(midi), n = Math.floor((len + 0.2) * SR), s0 = Math.floor(t0 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.01) * (t > len ? Math.exp(-(t - len) * 25) : Math.exp(-t * 0.6));
    add(s0 + i, (Math.sin(2 * Math.PI * f * t) + 0.15 * Math.sin(4 * Math.PI * f * t)) * env * vel);
  }
}
function kick(t0, vel) {
  const n = Math.floor(0.45 * SR), s0 = Math.floor(t0 * SR); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 48 + 90 * Math.exp(-t * 28);
    ph += 2 * Math.PI * f / SR;
    add(s0 + i, Math.sin(ph) * Math.exp(-t * 7) * vel);
  }
}
function snare(t0, vel) { // dusty brushed snare: band-limited noise + body
  const n = Math.floor(0.3 * SR), s0 = Math.floor(t0 * SR); let lp = 0, hp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = rnd();
    lp += (x - lp) * 0.35; hp = lp - prev; prev = lp;
    const v = (hp * 1.4 * Math.exp(-t * 16) + 0.25 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30)) * vel;
    add(s0 + i, v * 0.9, v);
  }
}
function hat(t0, vel, pan) {
  const n = Math.floor(0.06 * SR), s0 = Math.floor(t0 * SR); let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = rnd(), hp = x - prev; prev = x;
    const v = hp * Math.exp(-t * 70) * vel;
    add(s0 + i, v * (1 - pan), v * (1 + pan));
  }
}

const bars = Math.ceil(duration / BAR) + 1;
for (let b = 0; b < bars; b++) {
  const t = b * BAR, ch = CHORDS[b % 4];
  const strum = 0.018;
  ch.notes.forEach((m, k) => ep(t + k * strum, m, BAR * 0.92, 0.055 - k * 0.004, (k - 2) * 0.18));
  ep(t + BEAT * 2.5, ch.notes[4] + 2, BEAT * 0.9, 0.035, 0.4); // little melodic answer
  bass(t, ch.root, BEAT * 1.5, 0.22);
  bass(t + BEAT * 2.5, ch.root + (b % 2 ? 7 : 12), BEAT * 1.2, 0.16);
  const drums = b >= 1; // first bar: keys only, drums drop on bar 2
  if (drums) {
    kick(t, 0.5); kick(t + BEAT * 1.75, 0.32); kick(t + BEAT * 2.5, 0.42);
    snare(t + BEAT, 0.28); snare(t + BEAT * 3, 0.28);
  }
  for (let e = 0; e < 8; e++) { // swung 8ths
    const sw = e % 2 ? BEAT * 0.16 : 0;
    hat(t + e * BEAT / 2 + sw, (e % 2 ? 0.05 : 0.08) * (drums ? 1 : 0.5), e % 2 ? 0.3 : -0.2);
  }
}

// vinyl: soft hiss + sparse crackles
for (let i = 0; i < N; i++) {
  const h = rnd() * 0.004;
  add(i, h, h);
  if (Math.abs(rnd()) > 0.99985) { const c = rnd() * 0.08; add(i, c, c * 0.7); }
}

// tape-ish warmth: one-pole low-pass, soft clip, fades, normalise
for (const ch of [L, R]) {
  let y = 0;
  for (let i = 0; i < N; i++) { y += (ch[i] - y) * 0.38; ch[i] = Math.tanh(y * 1.4); }
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    ch[i] *= Math.min(1, t / 0.3) * Math.min(1, Math.max(0, (duration + 0.3 - t) / 2.2));
  }
}
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
for (let i = 0; i < N; i++) { L[i] *= 0.7 / peak; R[i] *= 0.7 / peak; }

mkdirSync(join(DIR, 'out', 'audio'), { recursive: true });
writeWav(join(DIR, 'out', 'audio', 'music.wav'), [L, R], SR);
console.log(`music: ${bpm} BPM, ${(N / SR).toFixed(2)} s`);
