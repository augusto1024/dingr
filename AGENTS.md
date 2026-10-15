# Guide for coding agents

This guide applies to the whole repository. Read `README.md` for the public API
and `playground/README.md` when working on the browser interface.

## Project overview

`dingr` is a small TypeScript ESM library that synthesizes deterministic sound
effects from versioned JSON recipes and exports mono PCM WAV files. It has no
runtime dependencies or recorded samples. The separate playground is a static
Vite app; synthesis, playback, and exports happen in the browser.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Public library exports and types |
| `src/recipe.ts` | Recipe types, sound families, validation, builders, and shaping |
| `src/notes.ts` | Note parsing, pitch conversion, and sequence parsing |
| `src/render.ts` | Seeded synthesis, mixing, peak attenuation, and WAV encoding |
| `src/guitar.ts` | Plucked-string synthesis used by the renderer |
| `src/presets.ts` | App and pilot sound recipes |
| `bin/dingr.mjs` | Node CLI; imports the built library from `dist/` |
| `test/dingr.test.ts` | Vitest tests for the library and audio properties |
| `playground/src/` | Browser UI, demo interactions, styles, and render worker |
| `playground/tests/playground.spec.ts` | Playwright browser tests |
| `.github/workflows/pages.yml` | Builds and deploys the playground to GitHub Pages |

## Setup and commands

Use Node.js 20 or newer (the Pages workflow uses Node 22) and npm. The root and
`playground/` have separate packages and lockfiles; this is not an npm workspace.
Run these commands from the repository root unless stated otherwise.

```sh
npm ci                              # Also builds the library via prepare
npm ci --prefix playground          # Needed for playground work
npm run dev --prefix playground     # Local browser playground
```

For library changes, run:

```sh
npm test
npm run typecheck
npm run build
```

For playground changes, also run:

```sh
npm run build --prefix playground
# One-time browser installation, from playground/:
(cd playground && npx playwright install chromium)
npm test --prefix playground
```

Playwright starts Vite on `127.0.0.1:5173` and can reuse an existing server outside
CI. Ensure a reused server is serving this checkout. Screenshots and test reports
are generated in ignored directories under `playground/`.

For CLI changes, build first, then smoke-test an export, for example:

```sh
npm run build
node bin/dingr.mjs --notes 'C4, E4, G4' --family kalimba --out output/agent-check
```

Exports replace files with matching names, so use a dedicated output directory.
There is no lint script. Documentation-only changes do not require audio or
browser tests; check referenced paths, commands, and the diff instead.

## Implementation conventions

- Follow the surrounding TypeScript style: strict types, ESM, and explicit `.ts`
  extensions for relative source imports. The library build rewrites extensions
  for emitted JavaScript.
- Keep `src/` portable between Node and browsers, with no DOM, file I/O, playback,
  or runtime dependencies. File I/O belongs in the CLI; Web Audio and UI code
  belong in the playground.
- Expose public APIs through `src/index.ts`. The playground consumes that entry
  point directly, so library edits appear without rebuilding `dist/`.
- Keep interactive rendering in `playground/src/render.worker.ts`; preserve
  request IDs, error responses, and transfer of the sample buffer.
- Keep changes focused and preserve unrelated local work. Update the appropriate
  package lockfile if dependencies change. Do not edit or commit generated
  `dist/`, `output/`, test results, reports, or `node_modules/` contents.

## Audio and recipe invariants

- Rendering is pure and synchronous. The same recipe must yield the same samples
  in the same JavaScript runtime. Use the seeded generator for synthesis, not
  `Math.random()`, wall-clock time, or external state. Exact output across runtimes
  or library versions is not guaranteed.
- Validate untrusted recipes before allocating audio buffers. Preserve finite
  value checks, recipe version checks, and bounds on voices, duration, sample
  rate, and pitch. See `validateRecipe` and `parseNotes` for the current limits.
- Seeds vary excitation and timbre without retuning the requested note. Preserve
  sample-rate-aware frequency limits, finite samples, and smooth endpoints.
- Preserve the mix's 0.89 sample-peak ceiling through uniform attenuation. Quiet
  sounds must not be boosted; this is not loudness normalization.
- Keep note onset timing separate from voice duration. Voices may overlap, and
  trailing rests must remain in the recipe and rendered output.
- Recipe shaping must not mutate its input; neutral shaping must preserve the
  recipe and rendered audio exactly. WAV output is mono, 16-bit PCM.

When changing synthesis or recipe behavior, extend the relevant property tests
in `test/dingr.test.ts` (for example pitch, determinism, endpoints, bounds, or WAV
contents). For new sound families, inspect the family registry, renderer,
playground controls/defaults, tests, and README together. Update documentation
when public behavior changes. For audible changes, audition representative
sounds when possible; report whether listening was actually performed.

For UI behavior changes, update relevant Playwright coverage and check keyboard
interaction and mobile overflow. The Pages build uses `--base=/dingr/`; keep
assets and navigation compatible with hosting under that subpath. The deployment
workflow builds the playground but does not run either test suite.

Before handing off, review the diff and report what changed, which checks ran,
and any checks that could not run.
