// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, inject, nextTick, onMounted, provide, ref, type Component, type VNodeChild } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { evaluateScene, transformToCss } from "../../src/core";
import { Motion, Scene, SceneErrorBoundary, Surface, useSceneTime } from "../../src/vue";

function createObserver(callback: ResizeObserverCallback) {
  const targets = new Set<Element>();
  const observer = {
    targets,
    observe: (element: Element) => { targets.add(element); },
    unobserve: (element: Element) => { targets.delete(element); },
    disconnect: () => { targets.clear(); },
    flush: () => { callback([], observer as unknown as ResizeObserver); },
  };
  return observer;
}
let observerInstances: ReturnType<typeof createObserver>[] = [];
function Observer(callback: ResizeObserverCallback) {
  const observer = createObserver(callback);
  observerInstances.push(observer);
  return observer;
}
const node = (id: string) => document.querySelector<HTMLDivElement>(`[data-flute-id="${id}"]`)!;
const alert = () => document.querySelector<HTMLElement>('[role="alert"]');
const flush = async () => { await nextTick(); await nextTick(); };
const flushObservers = async () => { observerInstances.forEach((observer) => observer.flush()); await flush(); };
let mounted: VueWrapper[] = [];
const render = (component: Component, props: Record<string, unknown> = {}) => {
  const wrapper = mount(component, { props, attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
};
beforeEach(() => {
  observerInstances = [];
  vi.stubGlobal("ResizeObserver", Observer);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-flute-stage") ? 800 : parseFloat(this.style.width) || 200;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-flute-stage") ? 400 : parseFloat(this.style.height) || 100;
  });
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    return parseFloat(this.style.left) || 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    return parseFloat(this.style.top) || 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
    return this.parentElement?.closest("[data-flute-id], [data-flute-stage]") ?? null;
  });
});
afterEach(() => {
  mounted.forEach((wrapper) => wrapper.unmount());
  mounted = [];
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("live Vue spatial adapter", () => {
  it("preserves provide/inject data, events, DOM identity and component state across focus and transform changes", async () => {
    let mounts = 0;
    const ExistingComponent = defineComponent({
      setup() {
        const data = inject<string>("host", "missing");
        const count = ref(0);
        onMounted(() => { mounts++; });
        return () => h("button", { onClick: () => { count.value++; } }, `${data}: ${count.value}`);
      },
    });
    const App = defineComponent({
      props: { focus: { type: String, required: true }, z: { type: Number, required: true } },
      setup(props) {
        provide("host", "API result");
        return () => h(Scene, { focus: { distance: props.focus === "front" ? 1200 : 1500 } }, {
          default: () => [
            h(Surface, { id: "back", transform: { z: props.z } }, { default: () => h(ExistingComponent) }),
            h(Surface, { id: "front", transform: { z: 200 } }, { default: () => "Front" }),
          ],
        });
      },
    });
    const view = render(App, { focus: "back", z: -100 });
    const button = document.querySelector("button")!;
    await button.click();
    await flush();
    expect(button.textContent).toBe("API result: 1");
    await view.setProps({ focus: "front", z: -150 });
    await flush();
    expect(document.querySelector("button")).toBe(button);
    expect(button.textContent).toBe("API result: 1");
    expect(mounts).toBe(1);
    expect(Number(node("back").dataset.fluteBlur)).toBeGreaterThan(0);
    expect(node("front").dataset.fluteBlur).toBe("0");
    expect(node("back").style.transform).toBe(transformToCss({ z: -150 }));
  });

  it("uses core transform order, camera rotation and measured parent-relative centers", async () => {
    const camera = { rotateX: 10, rotateY: 35, rotateZ: 5, perspective: 1500 };
    const transform = { z: 80, rotateY: 25, rotateZ: 12 };
    const projected = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    render(() => h(Scene, { camera }, {
      default: () => h(Surface, { id: "group", transform, style: { position: "absolute", left: "100px", top: "80px", width: "400px", height: "200px" } }, {
        default: () => h(Motion, { id: "child", transform: { z: 40 }, style: { position: "absolute", left: "250px", top: "20px", width: "100px", height: "50px" } }, { default: () => "Live" }),
      }),
    }));
    await flush();
    const stage = document.querySelector<HTMLElement>("[data-flute-stage]")!;
    const expected = evaluateScene(
      { camera, nodes: [{ id: "group", transform }, { id: "child", parentId: "group", transform: { z: 40 } }] },
      {
        group: { width: 400, height: 200, offsetX: 100 + 200 - stage.offsetWidth / 2, offsetY: 80 + 100 - stage.offsetHeight / 2 },
        child: { width: 100, height: 50, offsetX: 100, offsetY: -55 },
      },
    );
    expect(Number(node("child").dataset.fluteDepth)).toBeCloseTo(expected.nodes[1].worldPosition.z);
    expect(node("group").style.transform).toBe(transformToCss(transform));
    expect(stage.style.transform).toBe(transformToCss({ rotateX: 10, rotateY: 35, rotateZ: 5 }));
    expect(document.querySelector<HTMLElement>("[data-flute-scene]")!.style.perspective).toBe("1500px");
    expect(projected).not.toHaveBeenCalled();
  });

  it("emits the React adapter's exact DOM contract", async () => {
    render(() => h(Scene, { class: "host-scene", style: { width: "640px", position: "absolute" } }, {
      default: () => h(Surface, { id: "a", class: "host-surface" }, { default: () => "A" }),
    }));
    await flush();
    const scene = document.querySelector<HTMLElement>("[data-flute-scene]")!;
    expect(scene.getAttribute("data-flute-scene")).toBe("");
    expect(scene.getAttribute("data-flute-valid")).toBe("true");
    expect(scene.className).toBe("host-scene");
    expect(scene.style.width).toBe("640px");
    expect(scene.style.position).toBe("absolute");
    expect(scene.style.pointerEvents).toBe("none");
    expect(scene.style.perspective).toBe("1400px");
    expect(scene.style.perspectiveOrigin).toBe("50% 50%");
    expect(scene.style.transformStyle).toBe("flat");
    const stage = scene.querySelector<HTMLElement>("[data-flute-stage]")!;
    expect(stage.parentElement).toBe(scene);
    expect(stage.style.transformStyle).toBe("preserve-3d");
    expect(stage.style.pointerEvents).toBe("none");
    const surface = node("a");
    expect(surface.parentElement).toBe(stage);
    expect(surface.className).toBe("host-surface");
    expect(surface.getAttribute("data-flute-blur")).toBe("0");
    expect(surface.getAttribute("data-flute-depth")).toBe("0");
    expect(surface.style.pointerEvents).toBe("none");
    expect(surface.style.overflow).toBe("visible");
    expect(surface.style.transformStyle).toBe("preserve-3d");
    // A plain leaf marks its inner wrapper as the visual content and receives events.
    const leaf = surface.querySelector<HTMLElement>("[data-flute-content]")!;
    expect(leaf.style.pointerEvents).toBe("auto");
    expect(leaf.textContent).toBe("A");
  });

  it("blurs plain leaves and optional content while preserving nested 3D groups", async () => {
    const Nested = defineComponent({ render: () => h(Surface, { id: "child", transform: { z: 100 } }, { default: () => "Nested" }) });
    render(() => h(Scene, { focus: { distance: 1400, fStop: 0.7, focalLength: 300, maxBlur: 6 } }, {
      default: () => [
        h(Surface, { id: "group", transform: { z: -100 } }, { content: () => h("span", "Backdrop"), default: () => h(Nested) }),
        h(Surface, { id: "implicit-group", transform: { z: 100 } }, { default: () => h(Motion, { id: "motion" }, { default: () => "Motion" }) }),
        h(Surface, { id: "leaf", transform: { z: 100 } }, { default: () => "Leaf" }),
      ],
    }));
    await flush();
    expect(node("group").style.filter).toBe("none");
    expect(node("group").querySelector("[data-flute-content]")?.getAttribute("style")).toContain("blur(6px)");
    expect(node("child").closest("[data-flute-content]")).toBeNull();
    expect(node("implicit-group").style.filter).toBe("none");
    expect(node("motion").parentElement?.style.filter).toBe("none");
    expect(node("leaf").querySelector<HTMLElement>("[data-flute-content]")?.style.filter).toBe("blur(6px)");
  });

  it("updates local geometry on ResizeObserver and releases measurements on unmount", async () => {
    const view = render(() => h(Scene, { camera: { rotateY: 90 } }, {
      default: () => h(Surface, { id: "a", style: { width: "100px", height: "50px", left: "10px" } }, { default: () => "A" }),
    }));
    await flush();
    const before = Number(node("a").dataset.fluteDepth);
    // Vue re-applies declarative styles on patch, so drive the measured layout like real external resizes.
    Object.defineProperty(node("a"), "offsetWidth", { configurable: true, value: 200 });
    await flushObservers();
    expect(Number(node("a").dataset.fluteDepth)).toBeCloseTo(before - 50);
    const observers = observerInstances;
    view.unmount();
    mounted = [];
    expect(observers.every((observer) => observer.targets.size === 0)).toBe(true);
  });

  it("scopes IDs to each Scene and cleans registrations without duplicates", async () => {
    const show = ref(true);
    render(() => [
      h(Scene, null, { default: () => h(Surface, { id: "same" }, { default: () => "First" }) }),
      show.value ? h(Scene, null, { default: () => h(Surface, { id: "same" }, { default: () => "Second" }) }) : null,
    ]);
    await flush();
    expect(alert()).toBeNull();
    expect(document.querySelectorAll('[data-flute-id="same"]')).toHaveLength(2);
    show.value = false;
    await flush();
    expect(alert()).toBeNull();
    expect(document.querySelectorAll('[data-flute-id="same"]')).toHaveLength(1);
  });

  it("reports duplicate IDs visibly and recovers without remounting the live subtree", async () => {
    const second = ref("a");
    render(() => h(Scene, null, {
      default: () => [
        h(Surface, { id: "a" }, { default: () => h("input", { value: "host state" }) }),
        h(Surface, { id: second.value }, { default: () => "Second" }),
      ],
    }));
    await flush();
    const input = document.querySelector("input")!;
    expect(alert()!.textContent).toContain("Duplicate surface ID: a");
    second.value = "b";
    await flush();
    expect(alert()).toBeNull();
    expect(document.querySelector("input")).toBe(input);
  });

  it("reports invalid independent focus and recovers without replacing the host", async () => {
    const radius = ref(100);
    render(() => h(Scene, { focus: { distance: radius.value } }, {
      default: () => h(Surface, { id: "a" }, { default: () => h("input", { value: "kept" }) }),
    }));
    await flush();
    const input = document.querySelector("input")!;
    radius.value = -1;
    await flush();
    expect(alert()!.textContent).toContain("focus.distance");
    radius.value = 100;
    await flush();
    expect(alert()).toBeNull();
    expect(document.querySelector("input")).toBe(input);
  });

  it("emits diagnostics only when the issue set changes, without looping", async () => {
    const calls: number[] = [];
    const target = ref("missing");
    const count = ref(-1);
    render(() => h("div", [
      h("output", count.value),
      h(Scene, {
        focus: { distance: target.value === "missing" ? -1 : 100 },
        onDiagnostics: (issues: unknown[]) => { calls.push(issues.length); count.value = issues.length; },
      }, { default: () => h(Surface, { id: "a" }, { default: () => "A" }) }),
    ]));
    await flush();
    expect(document.querySelector("output")!.textContent).toBe("1");
    target.value = "a";
    await flush();
    expect(document.querySelector("output")!.textContent).toBe("0");
    expect(calls).toEqual([1, 0]);
  });

  it.each([
    { camera: { perspective: 0 } },
    { focus: { fStop: 0 } },
    { transform: { scale: 0 } },
    { transform: { z: Infinity } },
  ])("validates runtime config through core and recovers: %j", async (config) => {
    const valid = ref(false);
    render(() => valid.value
      ? h(Scene, null, { default: () => h(Surface, { id: "a" }, { default: () => "A" }) })
      : h(Scene, { camera: (config as any).camera, focus: (config as any).focus }, {
        default: () => h(Surface, { id: "a", transform: (config as any).transform }, { default: () => "A" }),
      }));
    await flush();
    expect(alert()!.textContent).toContain("Correct the scene props");
    expect(node("a").style.transform).not.toContain("Infinity");
    valid.value = true;
    await flush();
    expect(alert()).toBeNull();
  });

  it("diagnoses zero-area measurements and recovers on resize", async () => {
    render(() => h(Scene, null, { default: () => h(Surface, { id: "a" }, { default: () => "A" }) }));
    await flush();
    Object.defineProperty(node("a"), "offsetWidth", { configurable: true, value: 0 });
    await flushObservers();
    expect(alert()!.textContent).toContain("no measurable area");
    Object.defineProperty(node("a"), "offsetWidth", { configurable: true, value: 200 });
    await flushObservers();
    expect(alert()).toBeNull();
  });

  it("tracks in-place edits of a reactive transform", async () => {
    const transform = ref({ z: 0 });
    render(() => h(Scene, null, { default: () => h(Surface, { id: "a", transform: transform.value }, { default: () => "A" }) }));
    await flush();
    transform.value.z = 120;
    await flush();
    expect(node("a").style.transform).toBe(transformToCss({ z: 120 }));
  });

  it("exposes the scene clock through useSceneTime", async () => {
    const Clock = defineComponent({ setup() { const time = useSceneTime(); return () => h("output", String(time.value)); } });
    const motion = { durationMs: 1000, speed: 1, tracks: [] };
    const timeMs = ref(250);
    render(() => h(Scene, { motion, timeMs: timeMs.value }, { default: () => [h(Surface, { id: "a" }, { default: () => "A" }), h(Clock)] }));
    await flush();
    expect(document.querySelector("output")!.textContent).toBe("250");
    timeMs.value = 5000;
    await flush();
    expect(document.querySelector("output")!.textContent).toBe("1000");
  });
});

describe("Vue SceneErrorBoundary", () => {
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
  const boundary = (key: () => number, Host: Component) => () => h(SceneErrorBoundary, { resetKey: key() }, { default: () => h(Host) });

  it("catches host render errors and supports retry and resetKey correction", async () => {
    quiet();
    let broken = true;
    const renders = ref(0);
    const Host = defineComponent({ render() { void renders.value; if (broken) throw new Error("Host API view failed"); return h("button", "Recovered"); } });
    const key = ref(0);
    const resets: number[] = [];
    render(() => h(SceneErrorBoundary, { resetKey: key.value, onReset: () => resets.push(key.value) }, { default: () => h(Host) }));
    await flush();
    expect(alert()!.textContent).toContain("Host API view failed");
    broken = false;
    (document.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await flush();
    expect(document.body.textContent).toContain("Recovered");
    expect(alert()).toBeNull();
    broken = true;
    renders.value++;
    await flush();
    expect(document.body.textContent).not.toContain("Recovered");
    expect(alert()).not.toBeNull();
    broken = false;
    key.value = 6;
    await flush();
    expect(alert()).toBeNull();
    expect(document.body.textContent).toContain("Recovered");
    expect(resets).toEqual([0, 6]);
  });

  it.each(["failed", null, undefined])("recovers a non-Error thrown value: %s", async (failure) => {
    quiet();
    let broken = true;
    const Host = defineComponent({ render() { if (broken) throw failure; return h("span", "Restored host"); } });
    render(() => h(SceneErrorBoundary, { resetKey: 0 }, { default: () => h(Host) }));
    await flush();
    expect(alert()!.textContent).toContain(String(failure));
    broken = false;
    (document.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await flush();
    expect(document.body.textContent).toContain("Restored host");
  });

  it("reports the caught error through the error event", async () => {
    quiet();
    const seen: unknown[] = [];
    const Host = defineComponent({ render() { throw new Error("boom"); } });
    render(() => h(SceneErrorBoundary, { onError: (error: unknown) => seen.push(error) }, { default: () => h(Host) }));
    await flush();
    expect((seen[0] as Error).message).toBe("boom");
    expect(document.querySelector("[data-flute-error]")).not.toBeNull();
  });

  it("keeps healthy host state and DOM when resetKey changes", async () => {
    const Host = defineComponent({ setup() { const count = ref(0); return () => h("button", { onClick: () => { count.value++; } }, `Count ${count.value}`); } });
    const key = ref(0);
    render(boundary(() => key.value, Host));
    await flush();
    const button = document.querySelector("button")!;
    button.click();
    await flush();
    key.value = 1;
    await flush();
    expect(document.querySelector("button")).toBe(button);
    expect(button.textContent).toBe("Count 1");
  });

  it("makes out-of-scene usage actionable", async () => {
    quiet();
    render(() => h(SceneErrorBoundary, null, { default: () => h(Surface, { id: "outside" }, { default: () => "Outside" }) }));
    await flush();
    expect(alert()!.textContent).toContain("inside a Flute Scene");
  });
});

describe("Vue deterministic motion and coverage diagnostics", () => {
  it("applies deterministic camera, focus and surface tracks without replacing live UI; recovers missing targets", async () => {
    const motion = {
      durationMs: 1000, speed: 1,
      tracks: [
        { target: { kind: "surface" as const, id: "a" }, property: "x" as const, keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 1000, value: 100 }] },
        { target: { kind: "surface" as const, id: "a" }, property: "opacity" as const, keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 1000, value: 1 }] },
        { target: { kind: "camera" as const }, property: "x" as const, keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 1000, value: 40 }] },
        { target: { kind: "focus" as const }, property: "distance" as const, keyframes: [{ timeMs: 0, value: 10 }, { timeMs: 1000, value: 100 }] },
      ],
    };
    const time = ref(0);
    const show = ref(true);
    render(() => h(Scene, { motion, timeMs: time.value }, {
      default: () => show.value ? h(Surface, { id: "a" }, { default: () => h("input", { value: "existing" }) }) : null,
    }));
    await flush();
    const input = document.querySelector("input")!;
    time.value = 500;
    await flush();
    expect(document.querySelector("input")).toBe(input);
    expect(node("a").style.transform).toContain("translate3d(50px");
    expect(document.querySelector<HTMLElement>("[data-flute-stage]")!.style.transform).toContain("translate3d(-20px");
    expect(node("a").querySelector<HTMLElement>("[data-flute-content]")!.style.opacity).toBe("0.5");
    expect(node("a").style.opacity).toBe("1");
    show.value = false;
    await flush();
    expect(alert()!.textContent).toContain("Motion target is not registered: a");
    show.value = true;
    await flush();
    expect(alert()).toBeNull();
  });

  it("keeps the scene void black without recoloring the live UI", async () => {
    render(() => h(Scene, { style: { background: "pink", backgroundImage: "linear-gradient(red, blue)" } }, {
      default: () => h(Surface, { id: "host" }, { default: () => h("button", { style: { backgroundColor: "white", color: "black" } }, "Original host") }),
    }));
    await flush();
    const scene = document.querySelector("[data-flute-scene]") as HTMLElement;
    expect(scene.style.backgroundColor).toBe("rgb(0, 0, 0)");
    expect(scene.style.backgroundImage).toBe("none");
    expect(document.querySelector("button")!.style.backgroundColor).toBe("white");
  });

  it("diagnoses mixed group content and recovers when each region has a focus owner", async () => {
    const covered = ref(false);
    render(() => h(Scene, null, {
      default: () => h(Surface, { id: "group" }, {
        default: () => h("div", [covered.value ? h(Surface, { id: "label" }, { default: () => "Background label" }) : h("span", "Background label"), h(Surface, { id: "front" }, { default: () => "Foreground" })]),
      }),
    }));
    await flush();
    expect(alert()!.textContent).toContain("Unfiltered content");
    covered.value = true;
    await flush();
    expect(alert()).toBeNull();
    expect(node("label").querySelector("[data-flute-content]")).not.toBeNull();
  });

  it("diagnoses scene content outside any focus owner", async () => {
    const covered = ref(false);
    render(() => h(Scene, null, {
      default: (): VNodeChild => [covered.value ? h(Surface, { id: "back" }, { default: () => "Background" }) : h("span", "Background"), h(Surface, { id: "front" }, { default: () => "Foreground" })],
    }));
    await flush();
    expect(alert()!.textContent).toContain("Unfiltered scene content");
    covered.value = true;
    await flush();
    expect(alert()).toBeNull();
  });
});
