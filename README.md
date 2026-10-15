<img src="assets/brand/dingr-logo-concept.png" alt="dingr logo" width="128" height="128" />

# dingr — sound effects for JavaScript and TypeScript

Deterministic sound effects, built from notes and code. `dingr` is a small
TypeScript library for creating sound recipes, rendering them to PCM, and
exporting WAV files. It includes 18 synthesized sound families, a note-sequence
builder, and editable JSON recipes. It has no runtime dependencies and uses no
recorded samples.

[Try the sound playground](https://augusto1024.github.io/dingr/).
Create UI feedback, notification sounds, and game effects from code, in Node.js
or the browser.

The sounds are generated with simple digital signal processing: oscillators
provide pitched components, while partials, short noise bursts, pitch movement,
and amplitude envelopes give each family its character. The family names describe
the intended sound, not a recording or physical model of the named object.

## Install

```sh
npm install dingr
```

Requires Node.js 20 or newer. The package provides ESM and TypeScript declarations.
In browsers, import it from an ESM-capable build setup; rendering is synchronous,
so use a Web Worker for composition that should not block the main thread.

## Quick start

```ts
import { createSequence, createSound, encodeWav, render } from "dingr";

const melody = createSequence("C4, E4, G4, -", {
  family: "kalimba",
  bpm: 120,
  stepBeats: 0.5,
  duration: 0.3,
  seed: 42,
});

const sound = render(melody);
const wav = encodeWav(sound); // Uint8Array containing a mono PCM WAV

const click = render(createSound("relay", { note: "C5", duration: 0.055 }));
```

`render` returns the samples as a `Float32Array`, along with the sample rate,
duration, peak, and any attenuation applied to keep the mix below its peak ceiling.
Play the samples with the Web Audio API, or pass the rendered sound to `encodeWav`
for a portable, mono 16-bit PCM file. `dingr` does not handle playback or file I/O.

## Notes and timing

Notes use scientific pitch notation: C4 is middle C and A4 is 440 Hz. Names are
case-insensitive; sharps and flats are accepted, including `C#4`, `Db4`, `C♯4`,
and `D♭4`. The supported range is C0 through B8, subject to the selected sample
rate.

Separate sequence steps with commas or whitespace. A hyphen is a rest, and rests
occupy a step:

```ts
createSequence("C4, -, E4, G4, -", { bpm: 120, stepBeats: 0.5 });
```

Tempo and `stepBeats` set when notes begin. The `duration` option sets each voice's
length independently, so voices may overlap or ring across later steps. A trailing
rest is retained in the recipe and rendered output.

## Sound families

| Family | Character |
| --- | --- |
| `tap` | Short resonant tone with a filtered-noise transient |
| `pop` | Brief downward pitch bend into the note |
| `pluck` | Harmonic tone with quickly damping upper partials |
| `chime` | Ringing fundamental and bright decaying partials |
| `impact` | Low body with an octave component and noise transient |
| `glass` | Clear tone with sparse, inharmonic resonances |
| `steel` | Beating metal-like modes and a short strike |
| `piano` | Synthesized piano tone with decaying harmonics |
| `guitar` | Plucked-string model with pick noise, string damping, and acoustic-body resonances |
| `bubble-pop` | Upward pitch glide with a small filtered transient |
| `marimba` | Rounded fundamental with short-lived bar modes |
| `felt-mallet` | Soft attack, muted fundamental, and few overtones |
| `kalimba` | Plucked tone with bright, damping tine-like resonances |
| `warm-synth` | Rounded harmonics with a held body and soft release |
| `woodblock` | Hollow tone with rapidly damped bar modes |
| `membrane` | Drum-like inharmonic modes with a downward bend |
| `digital` | Band-limited odd harmonics with a held body |
| `relay` | Very short, damped metal modes with a second excitation |

`pluck`, `piano`, and `kalimba` suit short melodic phrases; `glass` and `chime`
make brighter accents. `woodblock`, `membrane`, and `relay` are percussive. These
are synthesized timbres, not sampled instruments or physically accurate models.

The `guitar` family uses a tuned, damped delay loop (extended Karplus–Strong)
with pick-position excitation and body resonators. It is generated entirely in
code, with no recorded notes or sample libraries. Brightness changes string
excitation and damping without retuning the fundamental; the seed varies the
pluck. Its natural range is most convincing around E2–E5. This is a compact
acoustic-style model, not a reproduction of a specific guitar or player.
`createSound("guitar")` defaults to 1.2 seconds to let the string ring. Explicit
voice durations and the existing sequence timing rules remain supported.

## Recipes

A recipe is a versioned JSON object with a name, seed, sample rate, total duration,
and one or more voices. Each voice specifies its family, note, start time (`at`),
duration, brightness, and gain. Times are in seconds; brightness and gain range
from 0 to 1. Create a single-voice recipe with `createSound`, or build a pitched
sequence with `createSequence`. Edit the `voices` array to layer sounds, then use
`validateRecipe` to check a recipe loaded from JSON before rendering it.

`shapeRecipe` returns an adjusted copy of a recipe. It can offset brightness,
scale voice durations, and set a different seed:

```ts
import { shapeRecipe } from "dingr";

const variation = shapeRecipe(melody, {
  brightnessOffset: 0.1,
  durationScale: 0.8,
  seed: 43,
});
```

The seed changes excitation and partial balance, not the requested note. The same
recipe produces the same samples in the same JavaScript runtime. Floating-point
math can differ between runtimes, and rendering may change between library
versions; keep rendered WAVs when exact long-term playback matters.

Recipes are limited to 64 voices, 12 seconds per render, 3 seconds per voice, and
sample rates from 8 to 96 kHz. Sequences accept up to 32 steps. The default sample
rate is 48 kHz. Invalid values are rejected before the audio buffer is allocated.
Mixes above a sample peak of 0.89 are attenuated uniformly; quieter mixes are not
boosted. This prevents sample clipping but is not loudness normalization or a
true-peak guarantee.

## App presets

`appPresets` provides eight editable recipes for everyday interfaces: `tap`,
`type`, `back`, `forward`, `confirmation`, `error`, `success`, and `notification`.
These are the examples shown in the playground. Type is a quiet, short key click;
Back and Forward use matching descending and ascending notes. Confirmation is a
brief acknowledgment, while Success adds a short resolving phrase.

```ts
import { appPresets, render } from "dingr";

const notification = render(appPresets.notification);
```

## Command line

The `dingr` command writes WAV files and their JSON recipes. It accepts a note
sequence, an existing recipe, or no input (which exports the included pilot cues):

```sh
dingr --notes 'C4, E4, G4' --family kalimba --bpm 120
dingr --variations 4 --out output/variations
dingr --recipe output/dingr/note-sequence.json --out output/rendered
```

Output defaults to `output/dingr` in the current directory. `--variations` accepts
1–16 seeds. Re-running an export with the same name replaces the corresponding
local files. When running from a source checkout, build first and invoke the CLI
with `node bin/dingr.mjs`.

The library also exports `pilotPresets`, a set of editable starting recipes for
common cues such as `tap`, `confirm`, `error`, `reveal`, `countdown`, and `victory`.

## Development

Use Node.js 22.20.0 for development (`asdf install` reads `.tool-versions`). The
root's Vitest 5 test runner requires Node 22.12+ on the Node 22 release line;
the playground's Vite 8 tooling also supports this version. The library itself
continues to support Node.js 20 and newer.

```sh
npm ci
npm test
npm run typecheck
npm run build
```

If your shell still selects an older Node version, run `asdf exec npm ci` and
`asdf exec npm test` from the repository root. Reinstall dependencies under the
selected Node version after upgrading build tools; this also restores optional
native dependencies that may have been skipped by an older Node installation.

## Sound playground

Explore the sound families in a minimal browser instrument, with live waveform
previews, a playable keyboard, sequence editing, layered recipes, and WAV exports:

```sh
npm ci --prefix playground
npm run dev --prefix playground
```

See [the playground README](playground/README.md) for controls and browser tests.

## License

Released under the [Unlicense](LICENSE). You may use, copy, modify, distribute,
and sell this software for any purpose, including commercial projects, without
attribution. The software is provided without warranty.
