import { render, type Recipe } from "../../src/index.ts";

self.onmessage = ({ data }: MessageEvent<{ id: number; recipe: Recipe }>) => {
  try {
    const sound = render(data.recipe);
    self.postMessage(
      { id: data.id, sound },
      { transfer: [sound.samples.buffer] },
    );
  } catch (error) {
    self.postMessage({
      id: data.id,
      error:
        error instanceof Error
          ? error.message
          : "Could not render this recipe.",
    });
  }
};
