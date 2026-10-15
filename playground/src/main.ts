import {
  createSound,
  createSequence,
  encodeWav,
  families,
  appPresets,
  validateRecipe,
  type AppPreset,
  type Family,
  type Recipe,
  type RenderedSound,
} from "../../src/index.ts";
import "./style.css";
import { mountDemos } from "./demos.ts";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const label = (name: string) =>
  name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ");
const defaults = {
  family: "kalimba" as Family,
  note: "C4",
  duration: 0.45,
  brightness: 0.5,
  gain: 0.65,
  seed: 42,
  bpm: 180,
  // Nokia tune, with empty eighth-note steps spacing the longer notes.
  notes: "E5 D5 F#4 - G#4 - C#5 B4 D4 - E4 - B4 A4 C#4 - E4 - A4 - - -",
};
let state = { ...defaults };
let durationCustomized = false;
let mode: "sound" | "sequence" | "recipe" = "sound";
let customRecipe: Recipe | undefined;
let currentRecipe: Recipe | undefined;
let currentSound: RenderedSound | undefined;
let context: AudioContext | undefined;
let master: GainNode | undefined;
let source: AudioBufferSourceNode | undefined;
let playing = false;
let startedAt = 0;
let revision = 0;
let playIntent = 0;
let debounce: ReturnType<typeof setTimeout>;
let animation = 0;
let renderId = 0;
const pending = new Map<
  number,
  { resolve: (sound: RenderedSound) => void; reject: (error: Error) => void }
>();
const worker = new Worker(new URL("./render.worker.ts", import.meta.url), {
  type: "module",
});
worker.onmessage = ({ data }) => {
  const request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id);
  if (data.error) request.reject(new Error(data.error));
  else request.resolve(data.sound);
};
worker.onerror = () => {
  for (const request of pending.values())
    request.reject(
      new Error("The audio renderer stopped. Reload to try again."),
    );
  pending.clear();
  showError("The audio renderer stopped. Reload to try again.");
};
const renderAsync = (recipe: Recipe) =>
  new Promise<RenderedSound>((resolve, reject) => {
    const id = ++renderId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, recipe });
  });

$("#app").innerHTML = `
  <header class="masthead"><a class="wordmark" href="./" aria-label="Dingr playground home">dingr<span>·</span></a><span class="masthead-note">a little laboratory for sound</span><span class="edition">PLAYGROUND / 01</span></header>
  <main>
    <div class="intro"><div><p class="eyebrow">SOUND, FROM SCRATCH</p><h1>Make a little noise<span>.</span></h1></div><p>A JavaScript &amp; TypeScript sound library.<br>Play, shape, and export your own effects.</p></div>
    <section class="instrument" aria-label="Sound playground">
      <div class="workspace">
        <div class="toolbar"><div class="mode-switch" role="group" aria-label="Composition mode"><button data-mode="sound" aria-pressed="true">Single sound</button><button data-mode="sequence" aria-pressed="false">Sequence</button><button data-mode="recipe" aria-pressed="false">Recipe</button></div><button id="reset" class="quiet">Reset ↺</button></div>
        <div class="scope"><div class="scope-top"><span id="sound-name">Kalimba</span><span id="render-status" role="status">Rendering…</span></div><canvas id="waveform" role="img" aria-label="Waveform of the current sound"></canvas><div id="playhead" class="playhead" hidden></div><div class="scope-bottom"><span>0.00 s</span><span id="sound-stats">48,000 Hz / MONO</span><span id="duration-label">0.45 s</span></div></div>
        <div class="transport"><button id="play" class="primary" disabled><span id="play-icon">▶</span><span id="play-label">Play sound</span><kbd>space</kbd></button><label class="toggle"><input id="loop" type="checkbox" />Loop</label><label class="monitor">Listening level<input id="volume" aria-label="Listening level" type="range" min="0" max="1" step="0.01" value="0.65" /></label><button id="download-wav" class="download" disabled>Export WAV <span>↗</span></button></div>
        <p id="error" class="error" role="alert" hidden></p>
        <div id="sequence-panel" hidden><div class="section-heading"><label for="notes">YOUR SEQUENCE</label><span>Notes separated by spaces · − is a rest</span></div><input id="notes" class="sequence-input" spellcheck="false" aria-describedby="sequence-help" value="${state.notes}" /><div class="sequence-tools"><div id="steps" class="steps" aria-label="Sequence steps"></div><button id="add-rest" class="quiet">+ Rest</button><button id="clear-notes" class="quiet">Clear</button></div><div class="tempo-row"><label for="bpm">Tempo <output id="bpm-value">120 BPM</output></label><input id="bpm" type="range" min="40" max="240" value="120" /><span>⅛ notes</span></div><p id="sequence-help" class="hint">Tap the keys below to add notes. Click a step to remove it. Up to 32 steps / 12 seconds.</p></div>
        <div id="keyboard-panel"><div class="section-heading"><span>PLAY THE KEYS</span><span id="keyboard-help">Your keyboard works, too</span></div><div id="keyboard" class="keyboard" aria-label="Piano keyboard"></div><div class="keyboard-footer"><span>C4 — C5</span><span id="selected-note">C4 selected</span><span>A W S E D F T G Y H U J K</span></div></div>
        <div id="recipe-panel" hidden><div class="section-heading"><label for="recipe-json">EDIT THE RECIPE</label><button id="apply-recipe" class="quiet">Apply & render ↗</button></div><textarea id="recipe-json" spellcheck="false" aria-label="Recipe JSON"></textarea><p class="hint">Layer voices, mix families, and set exact timings. Apply your edits to hear them.</p></div>
      </div>
      <aside class="controls" aria-label="Sound controls"><div class="section-heading"><span>01 / TIMBRE</span><label class="toggle"><input id="audition" type="checkbox" checked />Auto-preview</label></div><div id="families" class="families"></div><p id="family-description" class="family-description"></p>
        <div class="section-heading shape-heading"><span>02 / SHAPE</span><span id="shape-note">Fine-tune your sound</span></div><div id="shape-controls">
          <label class="slider-label" for="brightness">Brightness<output id="brightness-value">50%</output></label><input id="brightness" type="range" min="0" max="1" step="0.01" value="0.5" /><div class="range-captions"><span>Soft</span><span>Bright</span></div>
          <label class="slider-label" for="duration">Duration<output id="duration-value">0.45 s</output></label><input id="duration" type="range" min="0.02" max="3" step="0.01" value="0.45" /><div class="range-captions"><span>Short</span><span>Lingering</span></div>
          <label class="slider-label" for="gain">Gain<output id="gain-value">65%</output></label><input id="gain" type="range" min="0" max="1" step="0.01" value="0.65" /><div class="range-captions"><span>Quiet</span><span>Full</span></div>
          <div class="seed-row"><label for="seed">Variation <input id="seed" type="number" min="0" max="4294967295" step="1" value="42" /></label><button id="randomize" class="quiet" title="Try a new seed">Shuffle ↗</button></div>
        </div><p id="recipe-control-hint" class="hint" hidden>All sound parameters are in your recipe. Edit the JSON, then apply to hear your changes.</p>
      </aside>
    </section>
    <section class="presets" aria-label="Sound presets"><div><p class="eyebrow">A PLACE TO START</p><h2>Small sounds. <br>Big feelings.</h2><p class="demo-intro">Try them in action.</p></div><div id="presets" class="preset-list"></div></section>
    <footer><span><span class="footer-dot"></span> Synthesized here. No samples. All yours.</span><button id="download-json" class="quiet" disabled>Export recipe .json ↗</button></footer>
  </main>`;

const descriptions: Record<Family, string> = {
  tap: "A small, resonant touch.",
  pop: "A quick bend down into the note.",
  pluck: "Bright strings with a gentle decay.",
  chime: "A bright strike that hangs in the air.",
  impact: "Low, weighty, and to the point.",
  glass: "Clear, delicate, a little otherworldly.",
  steel: "Metallic overtones with a crisp strike.",
  piano: "A smooth, rounded piano tone.",
  guitar:
    "Plucked strings and a resonant wooden body. Synthesized, sample-free.",
  "bubble-pop": "A tiny upward flick of pitch.",
  marimba: "Round and woody, with a warm center.",
  "felt-mallet": "A soft landing, with muted overtones.",
  kalimba: "A little shimmer at your fingertips.",
  "warm-synth": "Rounded harmonics with a soft release.",
  woodblock: "Hollow, woody, and wonderfully short.",
  membrane: "A drum-like body with a falling pitch.",
  digital: "Clean-edged harmonics that hold their shape.",
  relay: "A tiny metallic double-click.",
};
$("#families").innerHTML = families
  .map(
    (family) =>
      `<button data-family="${family}" aria-pressed="${family === state.family}">${label(family)}</button>`,
  )
  .join("");
// Demo sounds have their own short-lived sources so typing never interrupts
// the instrument or changes the recipe being edited.
const demoSounds = new Map<AppPreset, Promise<RenderedSound>>();
const demoSources = new Set<AudioBufferSourceNode>();
mountDemos($("#presets"), (key) => {
  void (async () => {
    try {
      let soundPromise = demoSounds.get(key);
      if (!soundPromise) {
        soundPromise = renderAsync(appPresets[key]);
        demoSounds.set(key, soundPromise);
      }
      const [, sound] = await Promise.all([audioReady(), soundPromise]);
      const buffer = context!.createBuffer(
        1,
        sound.samples.length,
        sound.sampleRate,
      );
      buffer.copyToChannel(new Float32Array(sound.samples), 0);
      const demoSource = context!.createBufferSource();
      demoSource.buffer = buffer;
      demoSource.connect(master!);
      if (demoSources.size >= 8) {
        const oldest = demoSources.values().next().value!;
        oldest.stop();
        oldest.disconnect();
        demoSources.delete(oldest);
      }
      demoSources.add(demoSource);
      demoSource.onended = () => {
        demoSource.disconnect();
        demoSources.delete(demoSource);
      };
      demoSource.start();
    } catch {
      demoSounds.delete(key);
      showError("Audio could not start. Try the demo again.");
    }
  })();
});
const pitches = [
  "C4",
  "C#4",
  "D4",
  "D#4",
  "E4",
  "F4",
  "F#4",
  "G4",
  "G#4",
  "A4",
  "A#4",
  "B4",
  "C5",
];
const shortcuts = [
  "a",
  "w",
  "s",
  "e",
  "d",
  "f",
  "t",
  "g",
  "y",
  "h",
  "u",
  "j",
  "k",
];
let whites = 0;
$("#keyboard").innerHTML = pitches
  .map((note, i) => {
    const black = note.includes("#");
    const position = whites;
    if (!black) whites++;
    return `<button class="key ${black ? "black" : "white"}" data-note="${note}" aria-label="Play ${note}" style="--position:${position}"><span>${note.replace("#", "♯")}</span><kbd>${shortcuts[i].toUpperCase()}</kbd></button>`;
  })
  .join("");

function showError(message = "") {
  $("#error").textContent = message;
  $("#error").hidden = !message;
}
function getRecipe(): Recipe {
  if (mode === "recipe") {
    if (!customRecipe) throw new Error("Apply a recipe to start.");
    return customRecipe;
  }
  return mode === "sequence"
    ? createSequence(state.notes, { ...state, stepBeats: 0.5 })
    : createSound(state.family, state);
}
function syncUI() {
  document
    .querySelectorAll<HTMLButtonElement>("[data-family]")
    .forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.family === state.family && mode !== "recipe"),
      );
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-mode]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode)),
    );
  $("#sequence-panel").hidden = mode !== "sequence";
  $("#recipe-panel").hidden = mode !== "recipe";
  $("#keyboard-panel").hidden = mode === "recipe";
  $("#shape-controls").hidden = mode === "recipe";
  $("#recipe-control-hint").hidden = mode !== "recipe";
  $("#shape-note").textContent =
    mode === "recipe" ? "Defined in your recipe" : "Fine-tune your sound";
  $("#family-description").textContent =
    mode === "recipe"
      ? "Choose a timbre to start a new single sound."
      : descriptions[state.family];
  $("#selected-note").textContent = `${state.note} selected`;
  $("#keyboard-help").textContent =
    mode === "sequence"
      ? "Tap a key to add a note"
      : "Your keyboard works, too";
  for (const key of [
    "brightness",
    "gain",
    "duration",
    "bpm",
    "seed",
  ] as const) {
    $<HTMLInputElement>(`#${key}`).value = String(state[key]);
    const output = document.querySelector(`#${key}-value`);
    if (output)
      output.textContent =
        key === "duration"
          ? `${state.duration.toFixed(2)} s`
          : key === "bpm"
            ? `${state.bpm} BPM`
            : `${Math.round(state[key] * 100)}%`;
  }
  $<HTMLInputElement>("#notes").value = state.notes;
  const steps = state.notes
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  $("#steps").replaceChildren(
    ...steps.map((note, i) => {
      const button = document.createElement("button");
      button.textContent = note;
      button.setAttribute("aria-label", `Remove step ${i + 1}: ${note}`);
      button.onclick = () => {
        steps.splice(i, 1);
        state.notes = steps.join(" ");
        changed();
      };
      return button;
    }),
  );
}
function stop() {
  playIntent++;
  if (source) {
    source.onended = null;
    source.stop();
    source.disconnect();
    source = undefined;
  }
  playing = false;
  cancelAnimationFrame(animation);
  $("#playhead").hidden = true;
  $("#play-icon").textContent = "▶";
  $("#play-label").textContent = "Play sound";
}
async function audioReady() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = Number($<HTMLInputElement>("#volume").value);
    master.connect(context.destination);
  }
  await context.resume();
}
function start(sound: RenderedSound, track: boolean) {
  stop();
  if (!context || !master) return;
  const buffer = context.createBuffer(
    1,
    sound.samples.length,
    sound.sampleRate,
  );
  buffer.copyToChannel(new Float32Array(sound.samples), 0);
  source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = track && $<HTMLInputElement>("#loop").checked;
  source.connect(master);
  startedAt = context.currentTime;
  source.start();
  playing = true;
  $("#play-icon").textContent = "■";
  $("#play-label").textContent = "Stop";
  source.onended = stop;
  if (track) {
    const tick = () => {
      if (!playing || !context) return;
      $("#playhead").hidden = false;
      const progress =
        ((context.currentTime - startedAt) % sound.duration) / sound.duration;
      $("#playhead").style.transform =
        `translateX(${progress * $("#waveform").clientWidth}px)`;
      animation = requestAnimationFrame(tick);
    };
    tick();
  }
}
async function play() {
  if (playing) {
    stop();
    return;
  }
  if (!currentSound) return;
  const intent = ++playIntent;
  try {
    await audioReady();
    if (intent === playIntent && currentSound) start(currentSound, true);
  } catch {
    showError("Audio could not start. Try pressing Play again.");
  }
}
function drawWaveform() {
  const canvas = $<HTMLCanvasElement>("#waveform");
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = bounds.width * ratio;
  canvas.height = bounds.height * ratio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  const width = bounds.width,
    height = bounds.height;
  const theme = getComputedStyle(document.documentElement);
  ctx.strokeStyle = theme.getPropertyValue("--line").trim();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  for (let division = 1; division < 8; division++) {
    const x = (division / 8) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  if (!currentSound) return;
  ctx.strokeStyle = theme.getPropertyValue("--wave").trim();
  ctx.lineWidth = 1.5;
  const samples = currentSound.samples;
  for (let x = 0; x < width; x += 3) {
    const from = Math.floor((x / width) * samples.length);
    const to = Math.max(
      from + 1,
      Math.floor(((x + 3) / width) * samples.length),
    );
    let low = 0,
      high = 0;
    for (let i = from; i < Math.min(to, samples.length); i++) {
      low = Math.min(low, samples[i]);
      high = Math.max(high, samples[i]);
    }
    ctx.beginPath();
    ctx.moveTo(x, height / 2 - high * height * 0.47);
    ctx.lineTo(x, height / 2 - low * height * 0.47);
    ctx.stroke();
  }
}
async function refresh(preview = false) {
  const version = revision;
  try {
    const recipe = getRecipe();
    const sound = await renderAsync(recipe);
    if (version !== revision) return;
    currentRecipe = recipe;
    currentSound = sound;
    $("#sound-name").textContent = label(recipe.name);
    $("#duration-label").textContent = `${sound.duration.toFixed(2)} s`;
    $("#sound-stats").textContent =
      `${(sound.sampleRate / 1000).toFixed(0)} kHz / ${recipe.voices.length} ${recipe.voices.length === 1 ? "VOICE" : "VOICES"}`;
    $("#render-status").textContent = "Ready to play";
    for (const id of ["play", "download-wav", "download-json"])
      $<HTMLButtonElement>(`#${id}`).disabled = false;
    drawWaveform();
    if (preview && context?.state === "running") start(sound, false);
  } catch (error) {
    if (version !== revision) return;
    $("#render-status").textContent = "Check your sound";
    showError(
      error instanceof Error ? error.message : "Could not render this sound.",
    );
  }
}
function changed(preview = true) {
  stop();
  document
    .querySelectorAll("[data-preset]")
    .forEach((item) => item.setAttribute("aria-pressed", "false"));
  revision++;
  clearTimeout(debounce);
  showError();
  currentRecipe = undefined;
  currentSound = undefined;
  for (const id of ["play", "download-wav", "download-json"])
    $<HTMLButtonElement>(`#${id}`).disabled = true;
  $("#render-status").textContent = "Rendering…";
  syncUI();
  const audition = preview && $<HTMLInputElement>("#audition").checked;
  if (audition)
    void audioReady().catch(() => showError("Press Play to enable audio."));
  debounce = setTimeout(() => void refresh(audition), 90);
}
function switchMode(next: typeof mode) {
  if (next === "recipe" && mode !== "recipe") {
    try {
      customRecipe = getRecipe();
    } catch {
      customRecipe = createSound(defaults.family, defaults);
    }
    $<HTMLTextAreaElement>("#recipe-json").value = JSON.stringify(
      customRecipe,
      null,
      2,
    );
  }
  mode = next;
  changed(false);
}
function notePressed(note: string) {
  state.note = note;
  if (mode === "sequence") {
    const steps = state.notes
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (steps.length >= 32) {
      showError("Your sequence has 32 steps. Remove a step to add another.");
      return;
    }
    state.notes = [...steps, note].join(" ");
  }
  changed(false);
  // Key presses always audition a single note, independently of the composition.
  const intent = playIntent;
  void (async () => {
    try {
      await audioReady();
      const sound = await renderAsync(createSound(state.family, state));
      if (intent === playIntent) start(sound, false);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Could not play this note.",
      );
    }
  })();
  const key = document.querySelector<HTMLButtonElement>(
    `[data-note="${note}"]`,
  )!;
  key.classList.add("pressed");
  setTimeout(() => key.classList.remove("pressed"), 180);
}
document.querySelectorAll<HTMLButtonElement>("[data-family]").forEach(
  (button) =>
    (button.onclick = () => {
      state.family = button.dataset.family as Family;
      if (!durationCustomized)
        state.duration = state.family === "guitar" ? 1.2 : defaults.duration;
      if (mode === "recipe") mode = "sound";
      changed();
    }),
);
document
  .querySelectorAll<HTMLButtonElement>("[data-mode]")
  .forEach(
    (button) =>
      (button.onclick = () => switchMode(button.dataset.mode as typeof mode)),
  );
document
  .querySelectorAll<HTMLButtonElement>("[data-note]")
  .forEach(
    (button) => (button.onclick = () => notePressed(button.dataset.note!)),
  );
document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(
  (button) =>
    (button.onclick = () => {
      customRecipe = structuredClone(
        appPresets[button.dataset.preset as keyof typeof appPresets],
      );
      mode = "recipe";
      $<HTMLTextAreaElement>("#recipe-json").value = JSON.stringify(
        customRecipe,
        null,
        2,
      );
      changed();
      document
        .querySelectorAll("[data-preset]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
    }),
);
for (const key of ["brightness", "duration", "gain", "seed", "bpm"] as const) {
  $<HTMLInputElement>(`#${key}`).oninput = (event) => {
    state[key] = (event.target as HTMLInputElement).valueAsNumber;
    if (key === "duration") durationCustomized = true;
    changed();
  };
}
$<HTMLInputElement>("#notes").oninput = (event) => {
  state.notes = (event.target as HTMLInputElement).value;
  changed(false);
};
$("#add-rest").onclick = () => {
  if (
    state.notes
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean).length >= 32
  ) {
    showError("Remove a step before adding another rest.");
    return;
  }
  state.notes = `${state.notes.trim()} -`.trim();
  changed(false);
};
$("#clear-notes").onclick = () => {
  state.notes = "";
  changed(false);
  $<HTMLInputElement>("#notes").focus();
};
$("#randomize").onclick = () => {
  state.seed = crypto.getRandomValues(new Uint32Array(1))[0];
  changed();
};
$("#reset").onclick = () => {
  state = { ...defaults };
  durationCustomized = false;
  mode = "sound";
  document
    .querySelectorAll("[data-preset]")
    .forEach((item) => item.setAttribute("aria-pressed", "false"));
  changed(false);
};
$("#play").onclick = () => void play();
$<HTMLInputElement>("#loop").onchange = () => {
  if (source) source.loop = $<HTMLInputElement>("#loop").checked;
};
$<HTMLInputElement>("#volume").oninput = () => {
  if (context && master)
    master.gain.setTargetAtTime(
      Number($<HTMLInputElement>("#volume").value),
      context.currentTime,
      0.02,
    );
};
$("#apply-recipe").onclick = () => {
  try {
    const recipe: unknown = JSON.parse(
      $<HTMLTextAreaElement>("#recipe-json").value,
    );
    validateRecipe(recipe);
    customRecipe = recipe;
    changed();
  } catch (error) {
    showError(
      error instanceof SyntaxError
        ? "This JSON is not valid. Check commas, quotes, and brackets, then apply again."
        : (error as Error).message,
    );
  }
};
function download(data: BlobPart, type: string, extension: string) {
  if (!currentRecipe) return;
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `dingr-${currentRecipe.name.replace(/[^a-z0-9-]/gi, "-").slice(0, 80)}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#download-wav").onclick = () => {
  if (currentSound)
    download(new Uint8Array(encodeWav(currentSound)), "audio/wav", "wav");
};
$("#download-json").onclick = () => {
  if (currentRecipe)
    download(
      JSON.stringify(currentRecipe, null, 2),
      "application/json",
      "json",
    );
};
document.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat ||
    (event.target as HTMLElement).closest(
      'input, textarea, select, [contenteditable="true"]',
    )
  )
    return;
  if (
    event.code === "Space" &&
    !(event.target as HTMLElement).closest("button, a")
  ) {
    event.preventDefault();
    void play();
  }
  const index = shortcuts.indexOf(event.key.toLowerCase());
  if (index !== -1 && mode !== "recipe") {
    event.preventDefault();
    notePressed(pitches[index]);
  }
});
new ResizeObserver(drawWaveform).observe($("#waveform"));
syncUI();
void refresh();
