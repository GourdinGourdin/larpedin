# Linkedin Larp: explainer video

A 1080×1920, 30 fps vertical video (~37 s) with a Kokoro voice-over, burned-in captions
and a synthesized lo-fi bed. Every frame is a pure function of time (`renderAt(t)` in
`scene.html`), and scene timing comes from the narration (`timeline.js`).

## Setup

```sh
npm install            # repo root (solvers used by make-data.ts)
cd video && npm install
```

The renderer uses Playwright's Chromium from `~/Library/Caches/ms-playwright`
(`npx playwright install chromium` if it is missing) and `ffmpeg-static`.

## Pipeline

| step | command | output |
|---|---|---|
| 1. puzzle data | `node make-data.ts` | `data.js` (fixtures + real solvers + Wend) |
| 2. voice-over | `node gen-voice.mjs [voice]` | `out/audio/voice.wav`, `timeline.js` |
| 3. music | `node gen-music.mjs` | `out/audio/music.wav` |
| 4. video | `node render.mjs` | `out/linkedin-larp-silent.mp4` |
| 5. mix + mux | `node mix.mjs` | `out/audio/mix.wav`, `out/linkedin-larp.mp4` |

`data.js` and `timeline.js` are committed, so steps 4–5 work without downloading the model.
Re-run 2→5 after editing the script in `gen-voice.mjs` (scene timing follows the voice).

### Checking your work

- `node render.mjs --stills 0,5.5,21.5` renders PNG stills to `out/still-<t>.png`;
  `node sheet.mjs out/sheet.png 0,5.5,21.5` puts them on one contact sheet.
- Open `scene.html` in a browser for a live loop, or `scene.html?t=12` for one frame.
- `node check-voice.mjs [Xenova/whisper-base.en]` transcribes the voice locally with Whisper
  to check what Kokoro actually said.

## Audio: tools and licences

- **Voice:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), ONNX build
  `onnx-community/Kokoro-82M-v1.0-ONNX`, run locally via `kokoro-js` (Apache-2.0). Voice `af_heart`
  at speed 1.05. The first run downloads ~90 MB into `video/.cache/hf` (git-ignored). No account needed.
- **Music:** synthesized from scratch in `gen-music.mjs` (no samples, no model): 90 BPM,
  Fmaj9 → Em7 → Dm9 → Cmaj7 electric-piano chords, sine bass, soft kick/snare, swung hats and
  vinyl hiss. It is our own code, so it is free to reuse.
- **Mix:** ffmpeg: the music is side-chain ducked under the voice, then two-pass `loudnorm`
  brings it to −14 LUFS integrated / −1.5 dBTP, with a 1.2 s fade-out.
- **QA transcription (optional):** Whisper tiny/base.en ONNX (MIT) via transformers.js.

## Palette

It is defined once in the `PALETTE` object at the top of `scene.html`, ready to align with `src/page/theme.ts`.
