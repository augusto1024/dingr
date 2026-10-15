/** Sample-free plucked-string synthesis using a tuned, damped delay loop.
 * Based on the extended Karplus–Strong model described by Julius O. Smith:
 * https://www.dsprelated.com/freebooks/pasp/extended_karplus_strong_algorithm.html
 * Body coefficients are designed, not extracted from recordings.
 */
export function renderGuitar(
  frequency: number,
  count: number,
  rate: number,
  brightness: number,
  random: () => number,
): Float32Array {
  const tau = 2 * Math.PI;
  const omega = (tau * frequency) / rate;
  const period = rate / frequency;
  const cutoff = Math.min(
    rate * 0.4,
    2200 + 10000 * brightness + frequency * 0.7,
  );
  const pole = Math.exp((-tau * cutoff) / rate);
  const alpha = 1 - pole;
  // Compensate for the loss filter's phase delay, then tune the fractional
  // remainder with an allpass. Brightness must not detune the musical note.
  const filterDelay =
    Math.atan2(pole * Math.sin(omega), 1 - pole * Math.cos(omega)) / omega;
  const length = Math.max(1, Math.floor(period - filterDelay - 0.05));
  const fraction = period - filterDelay - length;
  const tangent = Math.tan(omega / 2);
  const fractionalTangent = Math.tan((omega * fraction) / 2);
  const allpass = (tangent - fractionalTangent) / (tangent + fractionalTangent);
  const string = new Float64Array(length);
  const noise = new Float64Array(length);
  const pickPosition = 0.16 + (random() + 1) * 0.035;
  const pickDelay = Math.max(1, Math.round(length * pickPosition));
  for (let i = 0; i < length; i++) noise[i] = random();
  let mean = 0;
  for (let i = 0; i < length; i++) {
    const position = i / length;
    const displacement =
      position < pickPosition
        ? position / pickPosition
        : (1 - position) / (1 - pickPosition);
    // An asymmetric displacement supplies the pitched body; pick-position
    // filtered noise adds the initial string scrape and a less uniform attack.
    const pickNoise =
      noise[i] - noise[(i + length - (pickDelay % length)) % length];
    string[i] =
      0.75 * (2 * displacement - 1) + (0.14 + brightness * 0.23) * pickNoise;
    mean += string[i] / length;
  }
  let energy = 0;
  for (let i = 0; i < length; i++) {
    string[i] -= mean;
    energy += string[i] * string[i];
  }
  // Extremely high notes can have fewer than two delay cells. A small initial
  // impulse still excites their tuned loop without division by zero.
  if (energy < 1e-12) {
    string[0] = 0.3;
    energy = 0.09;
  }
  const level = 0.3 / Math.sqrt(energy / length);
  for (let i = 0; i < length; i++) string[i] *= level;

  const naturalDecay = Math.min(3, 1.6 * (196 / frequency) ** 0.25);
  const loss = Math.exp(-1 / (frequency * naturalDecay));
  const body = [
    [100, 1.1, 0.18],
    [210, 1.4, 0.22],
    [430, 1.0, 0.13],
    [920, 0.8, 0.07],
  ].map(([hz, q, gain]) => {
    const angle = (tau * Math.min(hz, rate * 0.35)) / rate;
    const damping = Math.sin(angle) / (2 * q);
    return {
      b0: damping / (1 + damping),
      a1: (-2 * Math.cos(angle)) / (1 + damping),
      a2: (1 - damping) / (1 + damping),
      gain,
      x1: 0,
      x2: 0,
      y1: 0,
      y2: 0,
    };
  });
  const samples = new Float32Array(count);
  const releaseFrames = Math.min(rate * 0.085, count * 0.25);
  let position = 0,
    filtered = 0,
    previousInput = 0,
    previousOutput = 0;
  let previousDry = 0,
    dcBlocked = 0;
  const dcPole = Math.exp((-tau * 8) / rate);
  for (let i = 0; i < count; i++) {
    const dry = string[position];
    filtered = alpha * dry + pole * filtered;
    const tuned = allpass * filtered + previousInput - allpass * previousOutput;
    previousInput = filtered;
    previousOutput = tuned;
    string[position] = tuned * loss;
    position = (position + 1) % length;

    dcBlocked = dry - previousDry + dcPole * dcBlocked;
    previousDry = dry;
    let output = dcBlocked * 0.82;
    for (const mode of body) {
      const value =
        mode.b0 * (dcBlocked - mode.x2) - mode.a1 * mode.y1 - mode.a2 * mode.y2;
      mode.x2 = mode.x1;
      mode.x1 = dcBlocked;
      mode.y2 = mode.y1;
      mode.y1 = value;
      output += value * mode.gain;
    }
    const attack = Math.min(1, i / Math.min(rate * 0.0015, count * 0.1));
    const tail = Math.min(1, (count - 1 - i) / releaseFrames);
    samples[i] = output * attack * (0.5 - 0.5 * Math.cos(Math.PI * tail));
  }
  return samples;
}
