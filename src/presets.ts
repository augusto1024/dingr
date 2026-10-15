import { type Family, type Recipe, type Voice, validateRecipe } from "./recipe.ts";

function voice(family: Family, note: string, at: number, duration: number, gain = 0.6, brightness = 0.45): Voice {
  return { family, note, at, duration, gain, brightness };
}
function cue(name: string, voices: Voice[]): Recipe {
  const recipe: Recipe = { version: 1, name, seed: 42, sampleRate: 48000, duration: Math.max(...voices.map((v) => v.at + v.duration)), voices };
  validateRecipe(recipe);
  return recipe;
}

/** Restrained, editable cues for everyday app interactions. */
export const appPresets = {
  tap: cue("tap", [voice("tap", "G4", 0, 0.07, 0.35, 0.3)]),
  type: cue("type", [voice("relay", "D5", 0, 0.035, 0.22, 0.2)]),
  back: cue("back", [voice("pluck", "G4", 0, 0.12, 0.32, 0.25), voice("pluck", "C4", 0.055, 0.15, 0.28, 0.2)]),
  forward: cue("forward", [voice("pluck", "C4", 0, 0.12, 0.28, 0.2), voice("pluck", "G4", 0.055, 0.15, 0.32, 0.25)]),
  confirmation: cue("confirmation", [voice("tap", "C5", 0, 0.055, 0.2, 0.2), voice("felt-mallet", "E5", 0.045, 0.24, 0.48, 0.3)]),
  error: cue("error", [voice("marimba", "Eb4", 0, 0.13, 0.42, 0.15), voice("marimba", "D4", 0.12, 0.19, 0.38, 0.15)]),
  success: cue("success", [voice("pluck", "C5", 0, 0.2, 0.32, 0.25), voice("pluck", "E5", 0.085, 0.22, 0.34, 0.25), voice("chime", "G5", 0.17, 0.35, 0.3, 0.2)]),
  notification: cue("notification", [voice("glass", "G5", 0, 0.3, 0.32, 0.2), voice("glass", "D5", 0.13, 0.4, 0.28, 0.15)]),
} satisfies Record<string, Recipe>;
export type AppPreset = keyof typeof appPresets;

/** Original pilot palette. Treat as editable starting points, not a final mix. */
export const pilotPresets = {
  tap: cue("tap", [voice("tap", "G4", 0, 0.09, 0.45)]),
  confirm: cue("confirm", [voice("tap", "C5", 0, 0.08, 0.3), voice("pluck", "E5", 0.04, 0.24, 0.55)]),
  back: cue("back", [voice("pop", "G4", 0, 0.12, 0.45), voice("pop", "C4", 0.07, 0.15, 0.35)]),
  error: cue("error", [voice("tap", "Db4", 0, 0.14, 0.6), voice("tap", "C4", 0.16, 0.2, 0.5)]),
  join: cue("join", [voice("pop", "C4", 0, 0.16), voice("pluck", "G4", 0.09, 0.3)]),
  reveal: cue("reveal", [voice("glass", "C5", 0, 0.3, 0.35), voice("chime", "G5", 0.17, 0.5, 0.5)]),
  correct: cue("correct", [voice("tap", "C4", 0, 0.07, 0.25), voice("pluck", "C5", 0.02, 0.24), voice("pluck", "E5", 0.12, 0.32)]),
  incorrect: cue("incorrect", [voice("pluck", "E4", 0, 0.2, 0.5), voice("pluck", "C4", 0.12, 0.27, 0.45)]),
  countdown: cue("countdown", [voice("tap", "C5", 0, 0.09, 0.5, 0.3)]),
  timeout: cue("timeout", [voice("impact", "C3", 0, 0.32, 0.55), voice("pluck", "G3", 0.03, 0.3, 0.35)]),
  roundWin: cue("round-win", [voice("pluck", "C5", 0, 0.24), voice("pluck", "E5", 0.11, 0.24), voice("chime", "G5", 0.22, 0.5)]),
  victory: cue("victory", [voice("impact", "C3", 0, 0.3, 0.35), voice("pluck", "C5", 0, 0.3), voice("pluck", "E5", 0.12, 0.3), voice("pluck", "G5", 0.24, 0.3), voice("chime", "C6", 0.4, 0.8, 0.55)]),
} satisfies Record<string, Recipe>;
export type PilotPreset = keyof typeof pilotPresets;
