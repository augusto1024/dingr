import { noteToFrequency, parseNotes } from "./notes.ts";

export const families = ["tap", "pop", "pluck", "chime", "impact", "glass", "steel", "piano", "guitar", "bubble-pop", "marimba", "felt-mallet", "kalimba", "warm-synth", "woodblock", "membrane", "digital", "relay"] as const;
export type Family = typeof families[number];
export interface Voice {
  family: Family;
  /** Seconds from the start of the recipe. */
  at: number;
  note: string;
  /** Total voice length including its fade, in seconds. */
  duration: number;
  brightness: number;
  gain: number;
}
export interface Recipe {
  version: 1;
  name: string;
  seed: number;
  sampleRate: number;
  /** Retains trailing rests; must cover all voices. Maximum 12 seconds. */
  duration: number;
  voices: Voice[];
}
export interface SoundOptions {
  note?: string;
  duration?: number;
  brightness?: number;
  gain?: number;
  seed?: number;
  sampleRate?: number;
}

export function bounded(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
}

/** Also validates untrusted recipes loaded from JSON, before allocating audio. */
export function validateRecipe(input: unknown): asserts input is Recipe {
  if (!input || typeof input !== "object") throw new Error("Expected a sound recipe.");
  const r = input as Recipe;
  if (r.version !== 1) throw new Error("Unsupported recipe version.");
  if (typeof r.name !== "string" || !r.name.trim() || r.name.length > 80) throw new Error("Recipe name must contain 1–80 characters.");
  bounded(r.seed, 0, 4294967295, "Seed");
  if (!Number.isInteger(r.seed)) throw new Error("Seed must be an integer.");
  bounded(r.sampleRate, 8000, 96000, "Sample rate");
  if (!Number.isInteger(r.sampleRate)) throw new Error("Sample rate must be an integer.");
  bounded(r.duration, 0.02, 12, "Recipe duration");
  if (!Array.isArray(r.voices) || !r.voices.length || r.voices.length > 64) throw new Error("Use between 1 and 64 voices.");
  for (const voice of r.voices) {
    if (!voice || !families.includes(voice.family)) throw new Error("Unknown sound family.");
    bounded(voice.at, 0, 12, "Voice start");
    bounded(voice.duration, 0.02, 3, "Voice duration");
    bounded(voice.brightness, 0, 1, "Brightness");
    bounded(voice.gain, 0, 1, "Gain");
    if (voice.at + voice.duration > r.duration + 1e-8) throw new Error("Voice extends past recipe duration.");
    if (noteToFrequency(voice.note) >= r.sampleRate * 0.45) throw new Error("Note is too high for this sample rate.");
  }
}

export function createSound(family: Family, options: SoundOptions = {}): Recipe {
  const duration = options.duration ?? (family === "guitar" ? 1.2 : 0.35);
  const recipe: Recipe = {
    version: 1, name: family, seed: options.seed ?? 42, sampleRate: options.sampleRate ?? 48000, duration,
    voices: [{ family, at: 0, note: options.note ?? "C4", duration, brightness: options.brightness ?? 0.5, gain: options.gain ?? 0.65 }],
  };
  validateRecipe(recipe);
  return recipe;
}

/** Non-destructive palette controls. Neutral settings preserve the exact source. */
export function shapeRecipe(base: Recipe, options: { brightnessOffset?: number; durationScale?: number; seed?: number } = {}): Recipe {
  validateRecipe(base);
  const brightnessOffset = options.brightnessOffset ?? 0;
  const durationScale = options.durationScale ?? 1;
  bounded(brightnessOffset, -1, 1, "Brightness offset");
  bounded(durationScale, 0.1, 4, "Duration scale");
  const voices = base.voices.map((voice) => ({ ...voice,
    duration: durationScale === 1 ? voice.duration : voice.duration * durationScale,
    brightness: brightnessOffset === 0 ? voice.brightness : Math.max(0, Math.min(1, voice.brightness + brightnessOffset)),
  }));
  const trailingRest = base.duration - Math.max(...base.voices.map((voice) => voice.at + voice.duration));
  const recipe: Recipe = { ...base, seed: options.seed ?? base.seed, voices,
    duration: durationScale === 1 ? base.duration : Math.max(...voices.map((voice) => voice.at + voice.duration)) + trailingRest,
  };
  validateRecipe(recipe);
  return recipe;
}

export interface SequenceOptions extends Omit<SoundOptions, "note"> {
  family?: Family;
  bpm?: number;
  /** 1 = quarter notes; 0.5 = eighth notes. */
  stepBeats?: number;
}

export function createSequence(notes: string, options: SequenceOptions = {}): Recipe {
  const parsed = parseNotes(notes);
  const bpm = options.bpm ?? 120;
  const stepBeats = options.stepBeats ?? 0.5;
  bounded(bpm, 40, 240, "Tempo");
  bounded(stepBeats, 0.125, 4, "Step length");
  const step = 60 / bpm * stepBeats;
  const base = createSound(options.family ?? "pluck", { ...options, duration: options.duration ?? Math.max(0.02, step * 0.85) });
  const voices = parsed.flatMap((note, index) => note ? [{ ...base.voices[0], note, at: index * step }] : []);
  if (!voices.length) throw new Error("Include at least one note.");
  const recipe: Recipe = { ...base, name: "note-sequence", voices, duration: Math.max(parsed.length * step, ...voices.map((v) => v.at + v.duration)) };
  validateRecipe(recipe);
  return recipe;
}
