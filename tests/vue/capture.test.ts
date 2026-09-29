// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useSceneCapture } from "../../src/vue/useSceneCapture";
import type { CaptureBridge } from "../../src/core/export";
import { Scene, Surface } from "../../src/vue";

const host = window as typeof window & { __FLUTE_CAPTURE__?: CaptureBridge };
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ""; });
const time = ref(0);
const Fixture = defineComponent({
  props: { durationMs: { type: Number, default: 2000 } },
  setup(props) {
    useSceneCapture({ durationMs: () => props.durationMs, seek: value => { time.value = value; } });
    return () => h("output", { "data-testid": "time" }, String(time.value));
  },
});
const view = (props = {}) => {
  const wrapper = mount(Fixture, { props, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
};

it("commits exact capture time before the returned promise settles and cleans up", async () => {
  time.value = 0;
  const wrapper = view();
  expect(host.__FLUTE_CAPTURE__?.durationMs).toBe(2000);
  expect(host.__FLUTE_CAPTURE__?.selector).toBe('[data-flute-capture="scene"]');
  const pending = host.__FLUTE_CAPTURE__!.seek(750);
  expect(pending).toBeInstanceOf(Promise);
  await pending;
  expect(document.querySelector('[data-testid="time"]')!.textContent).toBe("750");
  expect(() => host.__FLUTE_CAPTURE__!.seek(2001)).toThrow("outside");
  expect(() => host.__FLUTE_CAPTURE__!.seek(NaN)).toThrow("outside");
  expect(() => host.__FLUTE_CAPTURE__!.seek(-1)).toThrow("outside");
  wrapper.unmount(); wrappers.length = 0;
  expect(host.__FLUTE_CAPTURE__).toBeUndefined();
});

it("updates the manifest without losing host component state", async () => {
  time.value = 0;
  const wrapper = view();
  await host.__FLUTE_CAPTURE__!.seek(500);
  await wrapper.setProps({ durationMs: 4000 });
  expect(host.__FLUTE_CAPTURE__?.durationMs).toBe(4000);
  expect(document.querySelector('[data-testid="time"]')!.textContent).toBe("500");
  await host.__FLUTE_CAPTURE__!.seek(3500);
  expect(document.querySelector('[data-testid="time"]')!.textContent).toBe("3500");
});

it("refuses capture when a scene reports unfiltered or invalid content", async () => {
  const wrapper = view();
  const invalid = document.createElement("div");
  invalid.setAttribute("data-flute-capture", "scene");
  invalid.innerHTML = '<div data-flute-valid="false"></div>';
  document.body.append(invalid);
  await expect(host.__FLUTE_CAPTURE__!.seek(500)).rejects.toThrow("Correct scene diagnostics");
  invalid.remove();
  await expect(host.__FLUTE_CAPTURE__!.seek(500)).resolves.toBeUndefined();
  wrapper.unmount(); wrappers.length = 0;
});

it("allows only one capture viewport per page", async () => {
  view();
  expect(() => mount(Fixture, { attachTo: document.body })).toThrow("Only one capture viewport");
});

// The validity check runs after apply() settles. These tests make the Scene's validity depend on the
// seek time, so they only pass when the bridge waits for Vue's DOM update before reading [data-flute-valid].
// Mutation check: making useSceneCapture's apply synchronous (dropping `await nextTick()`) fails them.
const timeline = ref(0);
const focusDistanceAt = (t: number, invalidAt: (t: number) => boolean) => (invalidAt(t) ? 10 : 1400);
function sceneHost(invalidAt: (t: number) => boolean) {
  return defineComponent({
    setup() {
      useSceneCapture({ durationMs: 2000, seek: value => { timeline.value = value; } });
      return () => h("div", { "data-flute-capture": "scene" }, [
        h("output", { "data-testid": "time" }, String(timeline.value)),
        h(Scene, { style: { width: 800, height: 400 }, focus: { distance: focusDistanceAt(timeline.value, invalidAt), focalLength: 50, fStop: 8, maxBlur: 0 } }, {
          default: () => h(Surface, { id: "probe", transform: { z: timeline.value / 10 }, style: { position: "absolute", width: 100, height: 100 } }, { default: () => "probe" }),
        }),
      ]);
    },
  });
}
const mountScene = (invalidAt: (t: number) => boolean) => {
  const wrapper = mount(sceneHost(invalidAt), { attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
};
const depth = () => document.querySelector('[data-flute-id="probe"]')!.getAttribute("data-flute-depth");
const validity = () => document.querySelector("[data-flute-scene]")!.getAttribute("data-flute-valid");
beforeEach(() => {
  timeline.value = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no layout: give the stage and surfaces a measurable box.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-flute-stage") ? 800 : parseFloat(this.style.width) || 200;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-flute-stage") ? 400 : parseFloat(this.style.height) || 100;
  });
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
    return this.parentElement?.closest("[data-flute-id], [data-flute-stage]") ?? null;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("rejects a seek whose state change makes the Scene invalid, judged after Vue's DOM update", async () => {
  mountScene(t => t >= 1000);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(validity()).toBe("true");
  await expect(host.__FLUTE_CAPTURE__!.seek(500)).resolves.toBeUndefined();
  expect(depth()).toBe("50");
  await expect(host.__FLUTE_CAPTURE__!.seek(1500)).rejects.toThrow(/Correct scene diagnostics/);
  expect(validity()).toBe("false");
});

it("resolves a seek whose state change makes an invalid Scene valid, judged after Vue's DOM update", async () => {
  mountScene(t => t < 1000);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(validity()).toBe("false");
  await expect(host.__FLUTE_CAPTURE__!.seek(1500)).resolves.toBeUndefined();
  expect(validity()).toBe("true");
  await expect(host.__FLUTE_CAPTURE__!.seek(200)).rejects.toThrow(/Correct scene diagnostics/);
});

it("has committed the sought time to the DOM when the promise resolves", async () => {
  mountScene(() => false);
  for (const t of [250, 1250, 2000]) {
    await host.__FLUTE_CAPTURE__!.seek(t);
    expect(document.querySelector('[data-testid="time"]')!.textContent).toBe(String(t));
    expect(depth()).toBe(String(t / 10));
  }
});
