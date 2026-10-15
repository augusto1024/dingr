# Dingr playground

A browser instrument for exploring Dingr. All synthesis, playback, and exports
happen locally in the browser. No backend or account is required.

The playground uses Vite 8 and requires Node.js 20.19+ or 22.12+ (Node 21 is
unsupported). The repository's `.tool-versions` selects Node 22.20.0 for asdf.
This development requirement is separate from the library's Node.js 20+ support.

From the Dingr repository:

```sh
npm ci --prefix playground
npm run dev --prefix playground
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).

- Choose any of the 18 timbres and adjust brightness, duration, gain, and seed.
- **Guitar** is a synthesized acoustic-style plucked string with body resonance.
  It starts at 1.2 seconds unless you have customized Duration; manually set
  durations are preserved when switching families. Reset restores the defaults.
- Play C4–C5 with the on-screen piano or `A W S E D F T G Y H U J K`.
- Use **Sequence** to type notes and rests, add notes with the piano, remove
  individual steps, adjust tempo, and loop the result. Steps are eighth notes.
- Try the interactive app demos: **Tap**, **Type**, **Back**, **Forward**,
  **Confirmation**, **Error**, **Success**, and **Notification**. Each interaction
  plays its matching sound, independently of Auto-preview and the current recipe.
  Confirmation shows a green check for three seconds. Toasts can be dismissed and
  expire after five seconds; repeated clicks restart that timer. Type in the input
  to hear key clicks. Hover or focus a demo control, then select **Edit recipe**
  in its tooltip to edit or export the sound. Escape dismisses the tooltip.
- Open a demo’s recipe or choose **Recipe** to edit the full JSON, including layered
  voices, other octaves, timing, and sample rate. Apply edits before exporting.
- **Auto-preview** auditions timbre and shape changes. Piano keys always audition.
- Press **Space** outside a form control to play or stop. Listening level affects
  browser playback only; gain is part of the exported sound.
- Export a mono PCM WAV or a reusable JSON recipe. Reloading resets the session.

The playground imports only the library's public entry point (`../src/index.ts`),
so edits to Dingr are immediately reflected during development. Rendering runs
in a module worker; playback uses the Web Audio API. UI dependencies are isolated
in this package and are excluded from the library's published files. The interface
uses Google Fonts with local fallbacks; audio never leaves the browser.

## Verify and build

```sh
npm run build --prefix playground
cd playground
npx playwright install chromium
npm test
```

The browser suite checks playback, loop/stop, WAV and JSON exports, sequence
editing, recipe validation, preset loading, and mobile overflow. It captures
full-page desktop and mobile screenshots in the ignored `test-results/` directory.

`npm run build` produces a static `dist/` directory. To preview that build, run
`npm run preview` from this directory. No changes to the library build are needed.

## Troubleshooting after dependency upgrades

If Vite fails to start with `Cannot find native binding`, check `node --version`
first. Switch to a supported Node version, then run `npm ci --prefix playground`
from the repository root to reinstall the platform-specific optional dependencies
from the lockfile. Do not omit optional dependencies.

With asdf, run these from the repository root:

```sh
asdf install
asdf exec node --version
asdf exec npm ci --prefix playground
asdf exec npm test --prefix playground
```

If Playwright then reports a missing browser executable, install the browser for
the installed Playwright version with `(cd playground && npx playwright install chromium)`.
