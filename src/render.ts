import { renderGuitar } from "./guitar.ts";
import { noteToFrequency } from "./notes.ts";
import { validateRecipe, type Recipe } from "./recipe.ts";

export interface RenderedSound {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  peak: number;
  /** Whole-file attenuation used only if the mix exceeds the peak ceiling. */
  attenuation: number;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
}

/** Pure, synchronous DSP. Use a worker for interactive browser authoring. */
export function render(recipe: Recipe): RenderedSound {
  validateRecipe(recipe);
  const rate = recipe.sampleRate;
  const samples = new Float32Array(Math.ceil(recipe.duration * rate));
  const tau = Math.PI * 2;
  recipe.voices.forEach((voice, index) => {
    const rng = random((recipe.seed + Math.imul(index + 1, 2654435761)) >>> 0);
    const frequency = noteToFrequency(voice.note);
    const start = Math.round(voice.at * rate);
    const count = Math.round(voice.duration * rate);
    const brightness = voice.brightness;
    if (voice.family === "guitar") {
      const guitar = renderGuitar(frequency, count, rate, brightness, rng);
      for (let i = 0; i < count && start + i < samples.length; i++) {
        samples[start + i] += guitar[i] * voice.gain * 0.8;
      }
      return;
    }
    // Seed varies excitation and partial balance, never the requested pitch.
    const color = 0.9 + 0.1 * rng();
    const cutoff = Math.min(rate * 0.35, 700 + 11500 * brightness);
    const alpha = 1 - Math.exp(-tau * cutoff / rate);
    let filtered = 0;
    const partial = (phase: number, ratio: number) => frequency * ratio < rate * 0.45 ? Math.sin(phase * ratio) : 0;
    for (let i = 0; i < count && start + i < samples.length; i++) {
      const t = i / rate;
      const progress = i / Math.max(1, count - 1);
      const phase = tau * frequency * t;
      const noise = rng();
      filtered += alpha * (noise - filtered);
      // Smooth both endpoints; exponential tails never end in an abrupt cut.
      const attackTime = voice.family === "relay" ? 0.0008 : voice.family === "woodblock" || voice.family === "digital" ? 0.002 : 0.006;
      const attack = Math.min(1, t / Math.min(attackTime, voice.duration * 0.1));
      const release = Math.min(1, (count - 1 - i) / (rate * 0.012));
      let signal = 0;
      let envelope = Math.exp(-5 * progress);
      switch (voice.family) {
        case "woodblock":
          // Hollow cavity and two short bar modes, without a sustained bell tail.
          signal = 0.6 * partial(phase, 1)
            + (0.24 + 0.2 * brightness) * color * partial(phase, 2.61) * Math.exp(-t / 0.018)
            + 0.2 * brightness * partial(phase, 4.17) * Math.exp(-t / 0.009);
          envelope = Math.exp(-t / Math.min(0.026, voice.duration * 0.18));
          break;
        case "membrane": {
          // Drumhead modes and a short tension drop; note names set the settled body.
          const bend = Math.min(0.65, Math.max(0, rate * 0.44 / frequency - 1));
          const drumPhase = phase + tau * frequency * bend * 0.022 * (1 - Math.exp(-t / 0.022));
          const mode = (ratio: number) => frequency * (1 + bend) * ratio < rate * 0.45 ? Math.sin(drumPhase * ratio) : 0;
          signal = 0.73 * mode(1) + 0.23 * color * mode(1.593) * Math.exp(-t / 0.035)
            + 0.18 * brightness * mode(2.136) * Math.exp(-t / 0.018);
          envelope = Math.exp(-5.5 * progress);
          break;
        }
        case "digital":
          // Band-limited odd harmonics, held level, and a short gate release.
          signal = 0.62 * partial(phase, 1);
          for (let h = 3; h <= 19; h += 2) signal += (0.3 + 0.45 * brightness) * color / h * partial(phase, h);
          envelope = Math.min(1, (1 - progress) / 0.12);
          break;
        case "relay":
          // Contact chatter excites a tiny damped metal housing. No noise wash.
          signal = 0.38 * partial(phase, 1) + 0.42 * color * partial(phase, 1.73)
            + (0.12 + 0.18 * brightness) * partial(phase, 3.91);
          envelope = Math.exp(-t / 0.006)
            + (t >= 0.012 ? 0.38 * Math.exp(-(t - 0.012) / 0.004) * Math.min(1, (t - 0.012) / 0.001) : 0);
          break;
        case "tap":
          signal = 0.65 * partial(phase, 1) + 0.22 * color * partial(phase, 2.76) * Math.exp(-12 * progress) + filtered * 0.28 * Math.exp(-45 * progress);
          envelope = Math.exp(-8 * progress);
          break;
        case "pop": {
          // A brief pitch drop settles onto the requested fundamental.
          const sweep = Math.min(1, rate * 0.45 / frequency - 1);
          const popPhase = phase + tau * frequency * sweep * 0.008 * (1 - Math.exp(-t / 0.008));
          signal = 0.8 * Math.sin(popPhase) + 0.15 * brightness * partial(phase, 2) * color;
          break;
        }
        case "pluck":
          signal = 0.68 * partial(phase, 1);
          for (let h = 2; h <= 6; h++) signal += (0.5 * brightness * color / h) * partial(phase, h) * Math.exp(-h * 2 * progress);
          signal += filtered * 0.09 * Math.exp(-70 * progress);
          break;
        case "chime":
          signal = 0.62 * partial(phase, 1) + brightness * color * (0.22 * partial(phase, 2) * Math.exp(-3 * progress) + 0.12 * partial(phase, 3) * Math.exp(-6 * progress) + 0.08 * partial(phase, 4.03) * Math.exp(-9 * progress));
          envelope = Math.exp(-3.5 * progress);
          break;
        case "glass":
          // A clear rim tone with sparse, fast-decaying inharmonic resonances.
          signal = 0.64 * partial(phase, 1)
            + (0.12 + 0.18 * brightness) * color * partial(phase, 2.32) * Math.exp(-4 * progress)
            + 0.16 * brightness * partial(phase, 4.25) * Math.exp(-7 * progress)
            + 0.08 * brightness * partial(phase, 6.63) * Math.exp(-11 * progress);
          envelope = Math.exp(-3.2 * progress);
          break;
        case "steel":
          // Closely spaced modes give a struck metal body a beating ring.
          signal = 0.5 * partial(phase, 1)
            + 0.18 * color * partial(phase, 1.006) * Math.exp(-progress)
            + (0.1 + 0.17 * brightness) * partial(phase, 1.47) * Math.exp(-1.5 * progress)
            + 0.19 * brightness * partial(phase, 2.09) * Math.exp(-2.5 * progress)
            + 0.12 * brightness * partial(phase, 3.16) * Math.exp(-4 * progress)
            + filtered * 0.08 * Math.exp(-t / 0.006);
          envelope = Math.exp(-2.4 * progress);
          break;
        case "piano":
          // Synthesized piano timbre: upper harmonics decay faster
          // than the warm pitched body and its quiet unison string.
          signal = 0.57 * partial(phase, 1) + 0.09 * color * partial(phase, 1.0015);
          for (let h = 2; h <= 10; h++) {
            signal += (0.8 * (0.25 + brightness) / h ** 1.4) * partial(phase, h) * Math.exp(-(1 + h * 0.8) * progress);
          }
          signal += filtered * 0.055 * color * Math.exp(-t / 0.004);
          envelope = 0.65 * Math.exp(-3 * progress) + 0.35 * Math.exp(-11 * progress);
          break;
        case "bubble-pop": {
          // A wet upward droplet glides into the note, unlike pop's downward
          // rubbery bend. Integrated phase keeps frequency below the target.
          const rise = 0.008 + voice.duration * 0.025;
          const bubblePhase = phase - tau * frequency * 0.7 * rise * (1 - Math.exp(-t / rise));
          signal = 0.85 * Math.sin(bubblePhase)
            + (frequency * 2 < rate * 0.45 ? 0.12 * brightness * color * Math.sin(bubblePhase * 2) * Math.exp(-12 * progress) : 0)
            + filtered * 0.035 * Math.exp(-t / 0.003);
          envelope = Math.exp(-8 * progress);
          break;
        }
        case "marimba":
          // A wooden bar's rounded fundamental outlasts the bright 4x/10x
          // strike modes. The attack is tonal, without a rustling noise layer.
          signal = 0.72 * partial(phase, 1)
            + (0.08 + 0.24 * brightness) * color * partial(phase, 4) * Math.exp(-12 * progress)
            + 0.1 * brightness * partial(phase, 10) * Math.exp(-22 * progress);
          envelope = Math.exp(-4.2 * progress);
          break;
        case "felt-mallet":
          // A cushioned strike with very few overtones and no noisy transient.
          signal = 0.8 * partial(phase, 1)
            + 0.075 * brightness * color * partial(phase, 2) * Math.exp(-8 * progress)
            + 0.025 * brightness * partial(phase, 3) * Math.exp(-15 * progress);
          envelope = (1 - Math.exp(-t / Math.min(0.009, voice.duration * 0.12))) * Math.exp(-6 * progress);
          break;
        case "kalimba":
          // A plucked tine: a stable fundamental, a bright inharmonic twang,
          // and a little octave body, with the twang damping away first.
          signal = 0.64 * partial(phase, 1)
            + (0.08 + 0.22 * brightness) * color * partial(phase, 2.76) * Math.exp(-5 * progress)
            + 0.12 * brightness * partial(phase, 5.4) * Math.exp(-10 * progress)
            + 0.09 * partial(phase, 2) * Math.exp(-3 * progress);
          envelope = Math.exp(-3.7 * progress);
          break;
        case "warm-synth":
          // Rounded additive oscillator with a gentle harmonic closing motion.
          // Keep a held body, then taper the final fifth of the note smoothly.
          signal = 0.65 * partial(phase, 1) + 0.12 * brightness * color * partial(phase, 2) * Math.exp(-2 * progress);
          for (let h = 3; h <= 9; h += 2) {
            signal += 0.65 * brightness * color / h ** 1.5 * partial(phase, h) * Math.exp(-(1 + h * 0.45) * progress);
          }
          envelope = (1 - Math.exp(-t / Math.min(0.012, voice.duration * 0.12)))
            * (0.9 + 0.1 * Math.cos(Math.PI * progress)) * Math.min(1, (1 - progress) / 0.2);
          break;
        case "impact":
          signal = 0.7 * partial(phase, 1) + 0.22 * partial(phase, 2) * color + filtered * (0.2 + 0.3 * brightness) * Math.exp(-18 * progress);
          envelope = Math.exp(-7 * progress);
          break;
      }
      samples[start + i] += signal * envelope * attack * release * voice.gain * 0.8;
    }
  });
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const attenuation = peak > 0.89 ? 0.89 / peak : 1;
  if (attenuation < 1) for (let i = 0; i < samples.length; i++) samples[i] *= attenuation;
  return { samples, sampleRate: rate, duration: samples.length / rate, peak: peak * attenuation, attenuation };
}

/** Portable mono 16-bit PCM WAV; no browser, filesystem, or codec dependency. */
export function encodeWav(sound: Pick<RenderedSound, "samples" | "sampleRate">): Uint8Array {
  if (!(sound.samples instanceof Float32Array) || sound.samples.length < 1 || sound.samples.length > 96000 * 12) throw new Error("Invalid audio buffer.");
  if (!Number.isInteger(sound.sampleRate) || sound.sampleRate < 8000 || sound.sampleRate > 96000) throw new Error("Invalid sample rate.");
  const bytes = new Uint8Array(44 + sound.samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sound.sampleRate, true);
  view.setUint32(28, sound.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, sound.samples.length * 2, true);
  for (let i = 0; i < sound.samples.length; i++) {
    if (!Number.isFinite(sound.samples[i])) throw new Error("Audio contains a non-finite sample.");
    const value = Math.max(-1, Math.min(1, sound.samples[i]));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
