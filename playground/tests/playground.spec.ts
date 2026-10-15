import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { appPresets } from "../../src/index.ts";

const ready = async (page: import("@playwright/test").Page) => {
  await expect(page.locator("#render-status")).toHaveText("Ready to play");
};

test("plays, loops, changes timbre, and exports real audio and recipes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await ready(page);
  await page.getByLabel("Auto-preview").uncheck();
  await page.getByRole("button", { name: "glass", exact: true }).click();
  await ready(page);
  await page.getByLabel("Loop", { exact: true }).check();
  await page.getByRole("button", { name: "Play sound" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Play sound" })).toBeVisible();
  const wavEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export WAV" }).click();
  const wav = await wavEvent;
  expect(wav.suggestedFilename()).toBe("dingr-glass.wav");
  const bytes = await readFile((await wav.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.length).toBeGreaterThan(10000);
  const jsonEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export recipe .json" }).click();
  const json = await jsonEvent;
  const recipe = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(recipe.voices[0].family).toBe("glass");
  expect(errors).toEqual([]);
});

test("composes with keys, rejects invalid sequences, and recovers", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Sequence", exact: true }).click();
  await ready(page);
  await page.getByLabel("YOUR SEQUENCE").fill("C4 - G4");
  await ready(page);
  await page.getByRole("button", { name: "Play C5", exact: true }).click();
  await expect(page.getByLabel("YOUR SEQUENCE")).toHaveValue("C4 - G4 C5");
  await ready(page);
  await page
    .getByRole("button", { name: "Remove step 2: -", exact: true })
    .click();
  await expect(page.getByLabel("YOUR SEQUENCE")).toHaveValue("C4 G4 C5");
  await page.getByLabel("YOUR SEQUENCE").fill("not-a-note");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export WAV" })).toBeDisabled();
  await page.getByLabel("YOUR SEQUENCE").fill("C4 E4 G4");
  await ready(page);
  await expect(page.getByRole("alert")).toBeHidden();
  await expect(page.getByRole("button", { name: "Export WAV" })).toBeEnabled();
});

test("offers piano with its original recipe ID", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByLabel("Auto-preview").uncheck();
  await expect(
    page.getByRole("button", { name: "grand piano", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "electronic piano", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "piano", exact: true }).click();
  await ready(page);
  await expect(page.locator("#sound-name")).toHaveText("piano");
  await expect(page.locator("#duration")).toHaveValue("0.45");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export recipe .json" }).click();
  const download = await downloadEvent;
  const recipe = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(recipe.voices[0].family).toBe("piano");
});

test("loads layered presets and validates recipe edits", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(page.locator("[data-preset]:visible")).toHaveCount(0);
  await page.locator('[data-demo="success"]').hover();
  await page
    .getByRole("button", { name: "Edit success recipe", exact: true })
    .click();
  await ready(page);
  const editor = page.getByRole("textbox", { name: "Recipe JSON" });
  const recipe = JSON.parse(await editor.inputValue());
  expect(recipe.name).toBe("success");
  expect(recipe.voices).toHaveLength(3);
  await editor.fill("{invalid");
  await page.getByRole("button", { name: "Apply & render" }).click();
  await expect(page.getByRole("alert")).toContainText("This JSON is not valid");
  recipe.seed = 999;
  await editor.fill(JSON.stringify(recipe));
  await page.getByRole("button", { name: "Apply & render" }).click();
  await ready(page);
  await expect(page.getByRole("alert")).toBeHidden();
  await page.getByRole("button", { name: "Reset" }).click();
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Single sound", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("recipe tooltips support hover, keyboard access, and dismissal", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await ready(page);
  const input = page.getByRole("textbox", { name: "Type demo", exact: true });
  const editType = page.getByRole("button", {
    name: "Edit type recipe",
    exact: true,
  });
  await input.focus();
  await expect(editType).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editType).toBeHidden();
  await input.blur();
  await input.focus();
  await page.keyboard.press("Tab");
  await expect(editType).toBeFocused();
  await page.keyboard.press("Enter");
  await ready(page);
  expect(
    JSON.parse(
      await page.getByRole("textbox", { name: "Recipe JSON" }).inputValue(),
    ).name,
  ).toBe("type");
  for (const key of ["back", "forward"]) {
    await page.locator(`[data-demo="${key}"]`).hover();
    await page
      .getByRole("button", { name: `Edit ${key} recipe`, exact: true })
      .click();
    await ready(page);
    expect(
      JSON.parse(
        await page.getByRole("textbox", { name: "Recipe JSON" }).inputValue(),
      ).name,
    ).toBe(key);
  }
  await page.locator('[data-demo="tap"]').focus();
  await page.locator('[data-demo="tap"]').hover();
  await page
    .locator("#presets")
    .screenshot({ path: testInfo.outputPath("tooltip-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await input.focus();
  await expect(editType).toBeVisible();
  await page
    .locator("#presets")
    .screenshot({ path: testInfo.outputPath("tooltip-mobile.png") });
});

test("demo controls play their own cues without changing the composition", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const played: number[] = [];
    Object.assign(window, { demoAudioLengths: played });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      played.push(this.buffer?.length ?? 0);
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  await ready(page);
  await page.getByLabel("Auto-preview").uncheck();
  await page.getByLabel("Loop", { exact: true }).check();
  const keys = [
    "tap",
    "back",
    "forward",
    "confirmation",
    "error",
    "success",
    "notification",
  ] as const;
  for (const key of keys) {
    await page.locator(`[data-demo="${key}"]`).click();
  }
  const input = page.getByRole("textbox", { name: "Type demo", exact: true });
  await expect(input).toHaveAttribute("placeholder", "Write something");
  await input.pressSequentially("test");
  await input.press("Backspace");
  await expect(input).toHaveValue("tes");
  const expected = [
    ...keys.map((key) => appPresets[key]),
    ...Array(5).fill(appPresets.type),
  ].map((recipe) => Math.ceil(recipe.duration * recipe.sampleRate));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { demoAudioLengths: number[] })
            .demoAudioLengths,
      ),
    )
    .toEqual(expected);
  await expect(page.locator("#sound-name")).toHaveText("kalimba");
  await expect(
    page.getByRole("button", { name: "Single sound", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Play sound" })).toBeVisible();
});

test("confirmation resets and toasts dismiss or expire with refreshed timers", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await ready(page);
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  const confirmation = page.getByRole("group", {
    name: "Confirmation demo",
    exact: true,
  });
  await confirmation
    .getByRole("button", { name: "Click me", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    confirmation.getByRole("button", { name: "Confirmed", exact: true }),
  ).toHaveClass(/is-confirmed/);
  await page.clock.fastForward(2999);
  await expect(
    confirmation.getByRole("button", { name: "Confirmed", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(1);
  await expect(
    confirmation.getByRole("button", { name: "Click me", exact: true }),
  ).toBeFocused();

  for (const [key, message] of [
    ["error", "Something went wrong"],
    ["success", "Success"],
    ["notification", "You got a message"],
  ]) {
    const trigger = page.locator(`[data-demo="${key}"]`);
    const toast = page.locator(`.demo-toast-${key}`);
    await trigger.click();
    await expect(toast).toContainText(message);
    await toast
      .getByRole("button", { name: `Dismiss ${key} notification` })
      .click();
    await expect(toast).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.clock.fastForward(4000);
    await expect(toast).toBeVisible();
    await trigger.click();
    await expect(toast).toHaveCount(1);
    await page.clock.fastForward(4000);
    await expect(toast).toBeVisible();
    await page.clock.fastForward(1000);
    await expect(toast).toHaveCount(0);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const key of ["confirmation", "error", "success", "notification"]) {
    await page.locator(`[data-demo="${key}"]`).click();
  }
  await page.screenshot({
    path: testInfo.outputPath("demo-feedback-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#presets").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("demo-feedback-mobile.png"),
    fullPage: true,
  });
});

test("plays guitar, exports audio, and respects custom durations", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.getByLabel("Auto-preview").uncheck();
  await page.getByRole("button", { name: "guitar", exact: true }).click();
  await ready(page);
  await expect(page.locator("#duration")).toHaveValue("1.2");
  await page.getByRole("button", { name: "Play sound" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export WAV" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("dingr-guitar.wav");
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.length).toBe(44 + 48000 * 1.2 * 2);
  await page.locator("#duration").focus();
  await page.locator("#duration").press("ArrowRight");
  await ready(page);
  const customDuration = await page.locator("#duration").inputValue();
  await page.getByRole("button", { name: "piano", exact: true }).click();
  await ready(page);
  await expect(page.locator("#duration")).toHaveValue(customDuration);
  await page.getByRole("button", { name: "guitar", exact: true }).click();
  await ready(page);
  await expect(page.locator("#duration")).toHaveValue(customDuration);
});

test("fits a mobile viewport and renders desktop and mobile snapshots", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await ready(page);
  const brand = page.getByRole("link", { name: "Dingr playground home" });
  await expect(brand).toHaveText("dingr");
  await expect(brand.locator("img")).toBeVisible();
  await expect.poll(() => brand.locator("img").evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
  )).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Make a little noise." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sequence", exact: true }).click();
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
