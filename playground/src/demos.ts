import type { AppPreset } from "../../src/index.ts";

const icon = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const check = icon('<path d="m5 12 4 4 10-10"/>');
const edit = (key: AppPreset) =>
  `<button class="demo-edit" data-preset="${key}" aria-label="Edit ${key} recipe">Edit recipe</button>`;
const demo = (title: string, control: string) =>
  `<div class="demo" role="group" aria-label="${title} demo"><div class="demo-heading"><h3>${title}</h3></div><div class="demo-control">${control}</div></div>`;
const button = (key: AppPreset) =>
  `<button class="demo-button" data-demo="${key}">Click me</button>`;

export function mountDemos(root: HTMLElement, play: (key: AppPreset) => void) {
  root.innerHTML = [
    demo("Tap", button("tap")),
    demo(
      "Type",
      '<input id="demo-type" class="demo-input" aria-label="Type demo" placeholder="Write something" autocomplete="off" />',
    ),
    `<div class="demo demo-navigation" role="group" aria-label="Back and Forward demo"><div class="demo-heading"><h3>Back & Forward</h3></div><div class="demo-control"><div class="demo-nav-buttons"><button class="demo-button" data-demo="back" aria-label="Back">${icon('<path d="m14 6-6 6 6 6"/>')}</button><button class="demo-button" data-demo="forward" aria-label="Forward">${icon('<path d="m10 6 6 6-6 6"/>')}</button></div></div></div>`,
    demo(
      "Confirmation",
      `${button("confirmation")}<span class="sr-only" id="confirmation-status" role="status"></span>`,
    ),
    demo("Error", button("error")),
    demo("Success", button("success")),
    demo("Notification", button("notification")),
  ].join("");

  root
    .querySelectorAll<HTMLElement>("[data-demo], #demo-type")
    .forEach((control) => {
      const key = (control.dataset.demo ?? "type") as AppPreset;
      const wrapper = document.createElement("span");
      wrapper.className = `demo-tooltip-wrap${key === "type" ? " demo-tooltip-input" : ""}`;
      control.replaceWith(wrapper);
      wrapper.append(control);
      wrapper.insertAdjacentHTML("beforeend", edit(key));
      wrapper.addEventListener("pointerenter", () =>
        wrapper.classList.remove("tooltip-dismissed"),
      );
      wrapper.addEventListener("focusin", () =>
        wrapper.classList.remove("tooltip-dismissed"),
      );
      wrapper.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (document.activeElement !== control)
          control.focus({ preventScroll: true });
        wrapper.classList.add("tooltip-dismissed");
        event.stopPropagation();
      });
    });

  const toasts = document.createElement("div");
  toasts.className = "demo-toasts";
  toasts.setAttribute("role", "region");
  toasts.setAttribute("aria-label", "Demo notifications");
  document.body.append(toasts);
  const activeToasts = new Map<string, () => void>();
  let confirmationTimer: ReturnType<typeof setTimeout>;

  function toast(
    key: "error" | "success" | "notification",
    trigger: HTMLButtonElement,
  ) {
    activeToasts.get(key)?.();
    const message = {
      error: "Something went wrong",
      success: "Success",
      notification: "You got a message",
    }[key];
    const element = document.createElement("div");
    element.className = `demo-toast demo-toast-${key}`;
    element.setAttribute("role", key === "error" ? "alert" : "status");
    element.innerHTML = `<span class="toast-symbol">${key === "success" ? check : key === "error" ? icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>') : icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>')}</span><span>${message}</span><button aria-label="Dismiss ${key} notification">${icon('<path d="m6 6 12 12M6 18 18 6"/>')}</button>`;
    const dismiss = () => {
      clearTimeout(timer);
      if (element.contains(document.activeElement))
        trigger.focus({ preventScroll: true });
      element.remove();
      activeToasts.delete(key);
    };
    const timer = setTimeout(dismiss, 5000);
    element.querySelector("button")!.onclick = dismiss;
    activeToasts.set(key, dismiss);
    toasts.append(element);
  }

  root.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach((trigger) => {
    trigger.onclick = () => {
      const key = trigger.dataset.demo as AppPreset;
      play(key);
      if (key === "confirmation") {
        clearTimeout(confirmationTimer);
        trigger.classList.add("is-confirmed");
        trigger.innerHTML = check;
        trigger.setAttribute("aria-label", "Confirmed");
        root.querySelector("#confirmation-status")!.textContent = "Confirmed";
        confirmationTimer = setTimeout(() => {
          trigger.classList.remove("is-confirmed");
          trigger.textContent = "Click me";
          trigger.removeAttribute("aria-label");
          root.querySelector("#confirmation-status")!.textContent = "";
        }, 3000);
      } else if (
        key === "error" ||
        key === "success" ||
        key === "notification"
      ) {
        toast(key, trigger);
      }
    };
  });

  const input = root.querySelector<HTMLInputElement>("#demo-type")!;
  let lastValue = "";
  const typed = () => {
    if (input.value === lastValue) return;
    lastValue = input.value;
    play("type");
  };
  input.addEventListener("input", (event) => {
    if (!(event as InputEvent).isComposing) typed();
  });
  input.addEventListener("compositionend", typed);
}
