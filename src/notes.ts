/** Scientific pitch notation; C4 is middle C, A4 is 440 Hz. */
export function noteToMidi(note: string): number {
  if (typeof note !== "string") throw new Error("A note must be a string.");
  const match = /^([a-g])([#b♯♭]?)([0-8])$/i.exec(note.trim());
  if (!match) throw new Error(`Invalid note: ${note}. Use C4, F#3, or Bb2 (octaves 0–8).`);
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2] === "#" || match[2] === "♯" ? 1 : match[2] ? -1 : 0;
  const midi = (Number(match[3]) + 1) * 12 + natural[match[1].toUpperCase()] + accidental;
  if (midi < 12 || midi > 119) throw new Error("Notes must be between C0 and B8.");
  return midi;
}

export function noteToFrequency(note: string): number {
  return 440 * 2 ** ((noteToMidi(note) - 69) / 12);
}

/** Commas or whitespace separate notes; '-' represents one silent step. */
export function parseNotes(input: string): (string | null)[] {
  if (typeof input !== "string" || input.length > 1024) throw new Error("Enter up to 32 notes.");
  const tokens = input.trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length || tokens.length > 32) throw new Error("Enter between 1 and 32 notes.");
  return tokens.map((token) => {
    if (token === "-") return null;
    noteToMidi(token);
    return token[0].toUpperCase() + token.slice(1).replace("♯", "#").replace(/[♭B]/g, "b");
  });
}
