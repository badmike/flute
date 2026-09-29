// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useSceneCapture } from "../../src/vue/useSceneCapture";
import type { CaptureBridge } from "../../src/core/export";

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
