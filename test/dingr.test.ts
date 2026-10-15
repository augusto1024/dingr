import { describe, expect, it } from "vitest";
import { createSequence, createSound, encodeWav, families, noteToFrequency, noteToMidi, parseNotes, appPresets, pilotPresets, render, shapeRecipe, validateRecipe } from "../src/index.ts";

describe("musical notes", () => {
  it("uses scientific pitch notation, including the requested lowercase sequence", () => {
    expect(noteToFrequency("A4")).toBe(440);
    expect(noteToFrequency("c1")).toBeCloseTo(32.7032, 4);
    expect(noteToFrequency("b2")).toBeCloseTo(123.4708, 4);
    expect(parseNotes("c1, b2, c1")).toEqual(["C1", "B2", "C1"]);
    expect(noteToFrequency("Bb2")).toBe(noteToFrequency("A#2"));
    expect(noteToFrequency("B♭2")).toBe(noteToFrequency("A♯2"));
    expect(noteToMidi("B#3")).toBe(noteToMidi("C4"));
    expect(noteToMidi("Cb4")).toBe(noteToMidi("B3"));
  });
  it("rejects typos and out-of-range notes", () => {
    for (const note of ["H2", "C", "C9", "C-1", "C##4", "Cb0", "B#8", "12"]) expect(() => noteToFrequency(note)).toThrow();
    expect(() => parseNotes("")).toThrow();
    expect(() => parseNotes(Array(33).fill("C4").join(" "))).toThrow();
  });
  it("places notes and rests on the tempo grid, retaining trailing rests", () => {
    const recipe = createSequence("c1, -, b2, c1, -", { bpm: 120, stepBeats: 0.5, duration: 0.2 });
    expect(recipe.voices.map((v) => [v.note, v.at])).toEqual([["C1", 0], ["B2", 0.5], ["C1", 0.75]]);
    expect(recipe.duration).toBe(1.25);
    const sound = render(recipe);
    expect(sound.samples.length).toBe(60000);
    expect(sound.samples.slice(48000).every((x) => x === 0)).toBe(true);
    expect(() => createSequence("- -")).toThrow();
    expect(() => createSequence("C4", { bpm: 0 })).toThrow();
    expect(() => createSequence(Array(32).fill("C4").join(" "), { bpm: 40, stepBeats: 4 })).toThrow();
  });
});

describe("portable renderer", () => {
  it("preserves every imported recipe exactly with neutral shaping controls", () => {
    for (const recipe of [...Object.values(appPresets), ...Object.values(pilotPresets)]) {
      const shaped = shapeRecipe(JSON.parse(JSON.stringify(recipe)), { brightnessOffset: 0, durationScale: 1 });
      expect(shaped).toEqual(recipe);
      expect(encodeWav(render(shaped))).toEqual(encodeWav(render(recipe)));
    }
    const melody = createSequence("C4, -", { duration: 0.2 });
    const shorter = shapeRecipe(melody, { durationScale: 0.5 });
    expect(shorter.duration).toBeCloseTo(0.4);
    expect(shorter.voices[0].duration).toBe(0.1);
    expect(melody.voices[0].duration).toBe(0.2);
  });
  it("renders every family and preset with finite samples, headroom, and clean endpoints", () => {
    const recipes = [...families.map((f) => createSound(f)), ...Object.values(appPresets), ...Object.values(pilotPresets)];
    for (const recipe of recipes) {
      const sound = render(recipe);
      expect(sound.samples.length).toBe(Math.ceil(recipe.duration * recipe.sampleRate));
      expect(sound.samples.every(Number.isFinite)).toBe(true);
      expect(sound.peak).toBeGreaterThan(0.001);
      expect(sound.peak).toBeLessThanOrEqual(0.890001);
      expect(sound.samples[0]).toBe(0);
      expect(Math.abs(sound.samples[sound.samples.length - 1])).toBeLessThan(0.00001);
    }
  });
  it("reproduces saved JSON exactly and gives seeds audible variation", () => {
    const recipe = createSound("tap");
    const first = render(recipe).samples;
    expect(render(JSON.parse(JSON.stringify(recipe))).samples).toEqual(first);
    expect(render({ ...recipe, seed: 43 }).samples).not.toEqual(first);
    expect(render({ ...recipe, seed: 0 }).samples).not.toEqual(first);
  });
  it("keeps requested musical pitch across seeds", () => {
    for (const family of ["pluck", "glass", "steel", "piano", "guitar", "marimba", "felt-mallet", "kalimba", "warm-synth", "digital"] as const) {
      for (const seed of [0, 42, 71]) {
        const { samples, sampleRate } = render(createSound(family, { note: "A4", duration: 0.5, seed }));
        // Direct spectral measurement, independent of the note conversion implementation.
        const energy = (hz: number) => {
          let real = 0, imaginary = 0;
          for (let i = 1000; i < 15000; i++) {
            const phase = 2 * Math.PI * hz * i / sampleRate;
            real += samples[i] * Math.cos(phase);
            imaginary += samples[i] * Math.sin(phase);
          }
          return real * real + imaginary * imaginary;
        };
        expect(energy(440)).toBeGreaterThan(energy(430) * 20);
        expect(energy(440)).toBeGreaterThan(energy(450) * 20);
      }
    }
  });
  it("renders distinct, reproducible material families across notes and sample rates", () => {
    const materials = ["glass", "steel", "piano", "guitar", "bubble-pop", "marimba", "felt-mallet", "kalimba", "warm-synth", "woodblock", "membrane", "digital", "relay"] as const;
    const fingerprints = new Set<string>();
    for (const family of materials) {
      const recipe = createSound(family, { note: "C4" });
      const wav = encodeWav(render(recipe));
      fingerprints.add(Array.from(wav).join(","));
      expect(encodeWav(render(JSON.parse(JSON.stringify(recipe))))).toEqual(wav);
      expect(render({ ...recipe, seed: 43 }).samples).not.toEqual(render(recipe).samples);
      for (const sampleRate of [8000, 48000, 96000]) {
        for (const brightness of [0, 1]) {
          const sound = render(createSequence("c1, b2, c4", { family, sampleRate, brightness, duration: 0.02 }));
          expect(sound.samples.every(Number.isFinite)).toBe(true);
          expect(sound.peak).toBeGreaterThan(0.001);
          expect(sound.peak).toBeLessThanOrEqual(0.890001);
        }
      }
    }
    expect(fingerprints.size).toBe(materials.length);
    expect(encodeWav(render(createSound("bubble-pop")))).not.toEqual(encodeWav(render(createSound("pop"))));
  });
  it("gives warm synth a held body while mallet families decay", () => {
    const lateEnergy = (family: "warm-synth" | "marimba" | "felt-mallet") => {
      const sound = render(createSound(family, { note: "C4", duration: 0.5 }));
      const segment = sound.samples.slice(0.25 * sound.sampleRate, 0.35 * sound.sampleRate);
      return segment.reduce((sum, sample) => sum + sample * sample, 0) / segment.length;
    };
    expect(lateEnergy("warm-synth")).toBeGreaterThan(lateEnergy("marimba") * 20);
    expect(lateEnergy("warm-synth")).toBeGreaterThan(lateEnergy("felt-mallet") * 20);
  });
  it("keeps guitar in tune when brightness or sample rate changes", () => {
    for (const sampleRate of [8000, 48000, 96000]) {
      for (const note of ["E2", "A3", "E5"]) {
        for (const brightness of [0, 1]) {
          const sound = render(createSound("guitar", { note, sampleRate, brightness, duration: 0.8 }));
          const frequency = noteToFrequency(note);
          const energy = (hz: number) => {
            let real = 0, imaginary = 0;
            for (let i = Math.floor(sampleRate * 0.02); i < sampleRate * 0.7; i++) {
              const phase = 2 * Math.PI * hz * i / sampleRate;
              real += sound.samples[i] * Math.cos(phase);
              imaginary += sound.samples[i] * Math.sin(phase);
            }
            return real * real + imaginary * imaginary;
          };
          expect(energy(frequency)).toBeGreaterThan(20 * Math.max(energy(frequency * 0.97), energy(frequency * 1.03)));
        }
      }
    }
  });
  it("preserves a guitar's attack when extending its duration and damps its endpoints", () => {
    expect(createSound("guitar").duration).toBe(1.2);
    const short = render(createSound("guitar", { duration: 0.5 }));
    const long = render(createSound("guitar", { duration: 2 }));
    expect(short.samples.slice(0, 12000)).toEqual(long.samples.slice(0, 12000));
    expect(long.samples[0]).toBe(0);
    expect(long.samples[long.samples.length - 1]).toBe(0);
    for (const note of ["C0", "E2", "E5", "B8"]) {
      const sound = render(createSound("guitar", { note, duration: 3 }));
      expect(sound.samples.every(Number.isFinite)).toBe(true);
      expect(sound.peak).toBeGreaterThan(0.001);
      expect(sound.peak).toBeLessThanOrEqual(0.890001);
    }
  });
  it("rejects removed families and keeps them out of pilot recipes", () => {
    const recipe = createSound("glass");
    for (const family of ["swish", "paper", "grand-piano"]) {
      expect(() => validateRecipe({ ...recipe, voices: [{ ...recipe.voices[0], family }] })).toThrow("Unknown sound family");
      expect(families.map(String)).not.toContain(family);
      expect(Object.values(pilotPresets).flatMap((r) => r.voices).map((v) => v.family)).not.toContain(family);
    }
  });
  it("separates contact clicks, hollow knocks, drums and held digital pulses by their envelopes", () => {
    const energyRatio = (family: typeof families[number]) => {
      const { samples, sampleRate } = render(createSound(family, { note: "A3", duration: .4 }));
      const energy = (from: number, to: number) => {
        const segment = samples.slice(from * sampleRate, to * sampleRate);
        return segment.reduce((sum, sample) => sum + sample * sample, 0) / segment.length;
      };
      return energy(.1, .18) / energy(.005, .04);
    };
    expect(energyRatio("relay")).toBeLessThan(.00001);
    expect(energyRatio("woodblock")).toBeLessThan(.001);
    expect(energyRatio("membrane")).toBeGreaterThan(energyRatio("woodblock") * 10);
    expect(energyRatio("digital")).toBeGreaterThan(.8);
    expect(energyRatio("digital")).toBeGreaterThan(energyRatio("membrane") * 5);
  });
  it("attenuates a dense mix without clipping or boosting quiet cues", () => {
    const base = createSound("chime", { gain: 1 });
    const loud = render({ ...base, voices: Array(64).fill(base.voices[0]) });
    expect(loud.attenuation).toBeLessThan(1);
    expect(loud.samples.every((x) => Math.abs(x) <= 0.890001)).toBe(true);
    expect(render(createSound("tap", { gain: 0.1 })).attenuation).toBe(1);
  });
  it("validates untrusted JSON before allocating buffers", () => {
    const base = createSound("pop");
    for (const patch of [{ version: 2 }, { sampleRate: 1e12 }, { seed: NaN }, { duration: Infinity }, { voices: [] }, { voices: Array(65).fill(base.voices[0]) }]) {
      expect(() => validateRecipe({ ...base, ...patch })).toThrow();
    }
    for (const patch of [{ note: "H2" }, { family: "unknown" }, { gain: 3 }, { at: -1 }, { duration: 4 }, { brightness: NaN }]) {
      expect(() => validateRecipe({ ...base, voices: [{ ...base.voices[0], ...patch }] })).toThrow();
    }
    expect(() => createSound("chime", { sampleRate: 8000, note: "B8" })).toThrow();
  });
  it("writes a standard mono PCM WAV with the actual samples and rate", () => {
    const samples = new Float32Array([-1, -0.5, 0, 0.5, 1]);
    const bytes = encodeWav({ samples, sampleRate: 44100 });
    const view = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(10);
    expect(Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true))).toEqual([-32768, -16384, 0, 16384, 32767]);
    expect(() => encodeWav({ samples: new Float32Array([NaN]), sampleRate: 48000 })).toThrow();
  });
});
