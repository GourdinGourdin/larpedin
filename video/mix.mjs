// Mixes narration + music and muxes them onto the silent render.
//   in:  out/linkedin-larp-silent.mp4, out/audio/voice.wav, out/audio/music.wav
//   out: out/audio/mix.wav, out/linkedin-larp.mp4 (H.264 copy + AAC 192k)
// Music is side-chain ducked under the voice, then the mix is loudness-normalised
// to -14 LUFS (measured with loudnorm, applied as one static gain) with a -1.5 dBTP limiter and fades.
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dirname, OUT = join(DIR, 'out'), A = join(OUT, 'audio');
const window = {}; eval(readFileSync(join(DIR, 'timeline.js'), 'utf8')); // eslint-disable-line no-eval
const dur = window.TL.duration;

const ff = (args, capture = false) => {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-y', ...args], { encoding: 'utf8', stdio: capture ? 'pipe' : ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error(r.stderr); throw new Error('ffmpeg failed'); }
  return r.stderr;
};

const graph = [
  '[0:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=70,acompressor=threshold=0.1:ratio=3:attack=5:release=120:makeup=2,volume=1.6,asplit=2[v][key]',
  '[1:a]aresample=48000,volume=0.34[m]',
  '[m][key]sidechaincompress=threshold=0.015:ratio=6:attack=25:release=400:makeup=1[duck]',
  '[v][duck]amix=inputs=2:duration=longest:normalize=0[mix]',
].join(';');
// 1) premix
ff(['-i', join(A, 'voice.wav'), '-i', join(A, 'music.wav'), '-filter_complex', graph, '-map', '[mix]', '-ac', '2', '-t', String(dur), join(A, 'premix.wav')]);
// 2) measure loudness
const LN = 'I=-14:TP=-1.5:LRA=11';
const m = ff(['-i', join(A, 'premix.wav'), '-af', `loudnorm=${LN}:print_format=json`, '-f', 'null', '-'], true);
const j = JSON.parse(m.slice(m.lastIndexOf('{'), m.lastIndexOf('}') + 1));
// 3) normalise with one static gain (no dynamic loudnorm pumping in the music-only gaps)
//    + a true-peak limiter at -1.5 dBTP, + fades
const gain = (-14 - Number(j.input_i)).toFixed(2);
ff(['-i', join(A, 'premix.wav'), '-af',
  `volume=${gain}dB,aresample=192000,alimiter=limit=0.84:attack=1:release=60:level=disabled,aresample=48000,` +
  `afade=t=in:st=0:d=0.15,afade=t=out:st=${(dur - 1.2).toFixed(2)}:d=1.2,aformat=sample_fmts=s16:channel_layouts=stereo`,
  join(A, 'mix.wav')]);
// 4) mux
ff(['-i', join(OUT, 'linkedin-larp-silent.mp4'), '-i', join(A, 'mix.wav'), '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', join(OUT, 'linkedin-larp.mp4')]);
// report
const r = ff(['-i', join(OUT, 'linkedin-larp.mp4'), '-af', 'ebur128=peak=true', '-f', 'null', '-'], true);
const sum = r.slice(r.lastIndexOf('Summary:'));
console.log(`input ${j.input_i} LUFS -> ${(sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]} LUFS, true peak ${(sum.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]} dBFS`);
console.log('wrote', join(OUT, 'linkedin-larp.mp4'));
