#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createSequence, encodeWav, pilotPresets, render, validateRecipe } from "../dist/index.js";

// Standalone recipe/sequence exporter. Paths are relative to the caller.
const args = process.argv.slice(2);
const allowed = new Set(["--out", "--notes", "--bpm", "--family", "--recipe", "--variations"]);
const options = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Invalid option: ${args[i]}`);
  options.set(args[i], args[i + 1]);
}
if (options.has("--recipe") && options.has("--notes")) throw new Error("Choose --recipe or --notes.");
const out = resolve(options.get("--out") ?? "output/dingr");
const variations = Number(options.get("--variations") ?? 1);
if (!Number.isInteger(variations) || variations < 1 || variations > 16) throw new Error("Use 1–16 variations.");
const recipes = options.has("--recipe")
  ? [JSON.parse(await readFile(options.get("--recipe"), "utf8"))]
  : options.has("--notes")
    ? [createSequence(options.get("--notes"), { bpm: Number(options.get("--bpm") ?? 120), family: options.get("--family") ?? "pluck" })]
    : Object.values(pilotPresets);
recipes.forEach(validateRecipe);
await mkdir(out, { recursive: true });
for (const original of recipes) {
  for (let variation = 0; variation < variations; variation++) {
    const recipe = { ...original, seed: (original.seed + variation) >>> 0 };
    const sound = render(recipe);
    const stem = `${recipe.name.replace(/[^a-z0-9-]/gi, "-")}${variations > 1 ? `-${variation + 1}` : ""}`;
    await writeFile(join(out, `${stem}.wav`), encodeWav(sound));
    await writeFile(join(out, `${stem}.json`), JSON.stringify(recipe, null, 2) + "\n");
    console.log(`${stem}: ${sound.duration.toFixed(3)} s, peak ${sound.peak.toFixed(3)}`);
  }
}
console.log(`Exported to ${out}`);
