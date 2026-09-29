// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, inject, nextTick, onMounted, provide, ref, type Component } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/dom";
import { CameraSchema, FLUTE_BRAND, cameraToCss, evaluateMotion, evaluateScene, type PreviewDefinitionInput } from "../../src/core";
import { ProjectPreview, SceneLibrary, ScenePreview, SceneModuleLibrary } from "../../src/preview-vue";
import { Surface } from "../../src/vue";
import type { CaptureBridge } from "../../src/core/export";

const flush = async () => { for (let i = 0; i < 4; i++) await nextTick(); };
let wrappers: VueWrapper[] = [];
const render = (component: Component, props: Record<string, unknown> = {}) => {
  const wrapper = mount(component, { props, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
};
let resize: () => void;
let width = 1000;
const definition: PreviewDefinitionInput = {
  width: 1000, height: 600,
  scene: { nodes: [{ id: "host" }] },
  motion: { durationMs: 4000, tracks: [
    { target: { kind: "camera" }, property: "x", keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 4000, value: 100 }] },
  ] },
};
const bridge = () => (window as typeof window & { __FLUTE_CAPTURE__: CaptureBridge }).__FLUTE_CAPTURE__;
const controls = () => screen.getByRole("contentinfo", { name: "Scene controls" });
beforeEach(() => {
  window.history.replaceState({}, "", "/app?flute-preview=1");
  width = 1000;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = () => callback([], this as unknown as ResizeObserver); }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
    return this.parentElement?.closest("[data-flute-stage]") ?? null;
  });
});
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount());
  wrappers = [];
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Vue ProjectPreview guard", () => {
  it.each([
    [false, "?flute-preview=1"],
    [true, ""],
    [true, "?flute-preview=0"],
    [true, "?flute-preview=true"],
  ])("returns only the original host when enabled=%s and query=%s", (enabled, query) => {
    window.history.replaceState({}, "", "/app" + query);
    const view = render(() => h(ProjectPreview, { projectId: "host", enabled }, { default: () => h("button", "Original") }));
    expect(view.html()).toBe("<button>Original</button>");
  });

  it("honors an explicit active flag instead of the query", () => {
    window.history.replaceState({}, "", "/app");
    render(() => h(ProjectPreview, { projectId: "host", enabled: true, active: true }, { default: () => "Host" }));
    expect(document.querySelector("[data-flute-project]")).not.toBeNull();
    wrappers.pop()!.unmount();
    window.history.replaceState({}, "", "/app?flute-preview=1");
    const off = render(() => h(ProjectPreview, { projectId: "host", enabled: true, active: false }, { default: () => h("b", "Host") }));
    expect(off.html()).toBe("<b>Host</b>");
  });

  it("uses canonical camera and progressive focus while preserving host context, events and identity", async () => {
    const requestData = vi.fn();
    const Host = defineComponent({
      setup() {
        const value = inject<string>("host", "missing");
        const count = ref(0);
        onMounted(() => requestData());
        return () => h("button", { onClick: () => { count.value++; } }, `${value}: ${count.value}`);
      },
    });
    const projectId = ref("host");
    const data = ref("API data");
    const App = defineComponent({ setup() { provide("host", "API data"); return () => h(Host); } });
    void App;
    const Provider = defineComponent({ setup(_, { slots }) { const key = "host"; provide(key, data.value); return () => slots.default?.(); } });
    void Provider;
    const injected = ref("API data");
    const Root = defineComponent({
      setup() {
        provide("host", injected);
        return () => h(ProjectPreview, { projectId: projectId.value, enabled: true }, { default: () => h(HostRef) });
      },
    });
    const HostRef = defineComponent({
      setup() {
        const value = inject("host", ref("missing"));
        const count = ref(0);
        onMounted(() => requestData());
        return () => h("button", { onClick: () => { count.value++; } }, `${value.value}: ${count.value}`);
      },
    });
    void Host;
    render(Root);
    await flush();
    const button = screen.getByRole("button", { name: /API data:/ });
    fireEvent.click(button);
    await flush();
    expect(button.textContent).toBe("API data: 1");
    expect(document.querySelectorAll("[data-flute-scene]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-flute-id]")).toHaveLength(1);
    const camera = { perspective: 1800, rotateX: 4, rotateY: -7 };
    const focus = { distance: 1800, fStop: 8, maxBlur: 6 };
    const expected = evaluateScene({ camera, focus, nodes: [{ id: "flute-application" }] }, {
      "flute-application": { width, height: 600, offsetX: 0, offsetY: 0 },
    });
    const stage = document.querySelector<HTMLElement>("[data-flute-stage]")!;
    const surface = document.querySelector<HTMLElement>("[data-flute-id]")!;
    expect(stage.style.transform).toBe(cameraToCss(camera));
    expect(stage.parentElement!.style.perspective).toBe("1800px");
    expect(Number(surface.dataset.fluteBlur)).toBe(expected.nodes[0].blur);
    expect(surface.querySelector<HTMLElement>("[data-flute-content]")!.style.filter).toMatch(/^url\(#flute-focus-/);
    expect(document.querySelector("feGaussianBlur")).not.toBeNull();
    expect(document.querySelector("filter")!.getAttribute("color-interpolation-filters")).toBe("sRGB");
    expect(screen.queryByRole("alert")).toBeNull();
    projectId.value = "renamed-host";
    injected.value = "Updated API data";
    width = 390;
    resize();
    await flush();
    expect(screen.getByRole("button", { name: /API data:/ })).toBe(button);
    expect(button.textContent).toBe("Updated API data: 1");
    expect(requestData).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-flute-project]")!.getAttribute("data-flute-project")).toBe("renamed-host");
    expect(document.querySelectorAll("[data-flute-id]")).toHaveLength(1);
  });

  it("removes only the preview parameter from the back destination", async () => {
    window.history.replaceState({}, "", "/nested/app?tag=a&flute-preview=1&tag=b&name=hello%20world&flute-preview=1#details");
    render(() => h(ProjectPreview, { projectId: "host", enabled: true }, { default: () => "App" }));
    await flush();
    const link = screen.getByRole("link", { name: "Back to app" }) as HTMLAnchorElement;
    const destination = new URL(link.href);
    expect(destination.pathname).toBe("/nested/app");
    expect(destination.searchParams.has("flute-preview")).toBe(false);
    expect(destination.searchParams.getAll("tag")).toEqual(["a", "b"]);
    expect(destination.searchParams.get("name")).toBe("hello world");
    expect(destination.hash).toBe("#details");
  });

  it("keeps page-entry query choice stable during host rerenders", async () => {
    const tick = ref(0);
    render(() => h(ProjectPreview, { projectId: "host", enabled: true }, { default: () => h("input", { value: "kept", "data-tick": tick.value }) }));
    await flush();
    const input = screen.getByRole("textbox");
    window.history.replaceState({}, "", "/app");
    tick.value++;
    await flush();
    expect(screen.getByRole("textbox")).toBe(input);
    expect(screen.getByText("Live preview")).toBeTruthy();
  });

  it("keeps back navigation available on render failure and uses canonical retry recovery", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    const Host = defineComponent({ render() { if (broken) throw new Error("Host failed"); return h("button", "Recovered host"); } });
    render(() => h(ProjectPreview, { projectId: "host", enabled: true }, { default: () => h(Host) }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("Host failed");
    expect(screen.getByRole("link", { name: "Back to app" })).toBeTruthy();
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry scene" }));
    await flush();
    expect(screen.getByRole("button", { name: "Recovered host" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Vue ScenePreview controls", () => {
  it("keeps every preview action in the bottom region and preserves host state, registration and capture across source recovery", async () => {
    const mounted = vi.fn();
    const Host = defineComponent({
      setup() {
        const context = inject<string>("host", "missing");
        const count = ref(0);
        onMounted(() => { mounted(); });
        return () => h("button", { onClick: () => { count.value++; } }, `${context}: ${count.value}`);
      },
    });
    const input = ref<PreviewDefinitionInput>(definition);
    const Root = defineComponent({
      setup() {
        provide("host", "Host data");
        return () => h(ScenePreview, { definition: input.value, title: "My scene", backHref: "/app" }, { default: () => h(Surface, { id: "host" }, { default: () => h(Host) }) });
      },
    });
    render(Root);
    await flush();
    const region = controls();
    expect(within(region).getByRole("heading", { name: "My scene" })).toBeTruthy();
    expect(within(region).getByRole("link", { name: "Back to app" }).getAttribute("href")).toBe("/app");
    expect(within(region).getByText("Export")).toBeTruthy();
    const host = screen.getByRole("button", { name: "Host data: 0" });
    fireEvent.click(host);
    await flush();
    const capture = document.querySelector(bridge().selector)!;
    expect(capture.contains(host)).toBe(true);
    expect(capture.contains(region)).toBe(false);
    const chrome = document.querySelectorAll("[data-flute-preview-chrome]");
    expect(chrome).toHaveLength(2);
    expect(Array.from(chrome).some(element => element === region)).toBe(true);
    expect(Array.from(chrome).every(element => !capture.contains(element))).toBe(true);
    const slider = within(region).getByRole("slider", { name: "Scene time" });
    fireEvent.input(slider, { target: { value: "2000" } });
    await flush();
    expect(within(region).getByTestId("scene-time").textContent).toBe("0:02 / 0:08");
    const stage = document.querySelector<HTMLElement>("[data-flute-stage]")!;
    const transform = stage.style.transform;
    input.value = { ...definition, width: -1 };
    await flush();
    expect(within(region).getByRole("alert").textContent).toContain("last valid");
    expect((within(region).getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
    await expect(Promise.resolve().then(() => bridge().seek(1000))).rejects.toThrow(/Correct/);
    expect(stage.style.transform).toBe(transform);
    input.value = definition;
    await flush();
    expect(within(region).queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Host data: 1" })).toBe(host);
    expect(document.querySelector(bridge().selector)).toBe(capture);
    expect(document.querySelectorAll("[data-flute-id]")).toHaveLength(1);
    expect(mounted).toHaveBeenCalledTimes(1);
    fireEvent.click(within(region).getByRole("button", { name: "Restart" }));
    await flush();
    expect((slider as HTMLInputElement).value).toBe("0");
    fireEvent.click(within(region).getByRole("button", { name: "Play" }));
    await flush();
    expect(within(region).getByRole("button", { name: "Pause" })).toBeTruthy();
    fireEvent.click(within(region).getByRole("button", { name: "Pause" }));
  });

  it("commits seeked scene time to the DOM before the capture promise settles", async () => {
    render(() => h(ScenePreview, { definition }, { default: () => h(Surface, { id: "host" }, { default: () => "Host" }) }));
    await flush();
    const stage = document.querySelector<HTMLElement>("[data-flute-stage]")!;
    const before = stage.style.transform;
    await bridge().seek(2000);
    // The core motion evaluator alone decides the camera pose at 2s; the DOM must already show it.
    const pose = evaluateMotion(definition.motion!, 2000).camera;
    expect(stage.style.transform).not.toBe(before);
    expect(stage.style.transform).toBe(cameraToCss(CameraSchema.parse({ ...pose })));
    await bridge().seek(0);
    expect(stage.style.transform).toBe(before);
  });

  it("renders the canonical error and retry outside capture in the controls region", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    const Host = defineComponent({ render() { if (broken) throw new Error("Host unavailable"); return h(Surface, { id: "host" }, { default: () => "Recovered" }); } });
    render(() => h(ScenePreview, { definition, backHref: "/app" }, { default: () => h(Host) }));
    await flush();
    const alert = within(controls()).getByRole("alert");
    expect(alert.textContent).toContain("Host unavailable");
    expect(document.querySelector(".flute-viewport")!.contains(alert)).toBe(false);
    expect(within(controls()).getByRole("link", { name: "Back to app" })).toBeTruthy();
    broken = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry scene" }));
    await flush();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(bridge().selector)!.textContent).toContain("Recovered");
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens export above the action row, supports frame rate and copy recovery, and restores keyboard focus on Escape", async () => {
    const copy = vi.fn().mockRejectedValueOnce(new Error("Clipboard unavailable")).mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    render(() => h(ScenePreview, { definition }, { default: () => h(Surface, { id: "host" }, { default: () => "Host" }) }));
    await flush();
    const summary = within(controls()).getByText("Export").closest("summary")!;
    fireEvent.click(summary);
    // jsdom does not toggle <details>; emulate the browser's open + toggle sequence.
    (summary.parentElement as HTMLDetailsElement).open = true;
    fireEvent(summary.parentElement!, new Event("toggle"));
    const panel = await within(controls()).findByRole("region", { name: "Export your scene" });
    const fps = within(panel).getByRole("combobox", { name: "Export frame rate" });
    await waitFor(() => expect(document.activeElement).toBe(fps));
    expect(panel.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector(bridge().selector)!.contains(panel)).toBe(false);
    fireEvent.change(fps, { target: { value: "30" } });
    await flush();
    expect(panel.textContent).toContain("--fps 30");
    fireEvent.click(within(panel).getByRole("button", { name: "Copy command" }));
    await waitFor(() => expect(within(panel).getByRole("status").textContent).toContain("Select and copy"));
    fireEvent.click(within(panel).getByRole("button", { name: "Copy command" }));
    await within(panel).findByRole("button", { name: "Copied" });
    expect(copy.mock.calls[1][0]).toContain("--fps 30");
    fireEvent.keyDown(fps, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Export your scene" })).toBeNull());
    expect(document.activeElement).toBe(summary);
  });

  it("uses the library callback for ordinary back clicks and retains native link destinations", async () => {
    const onBack = vi.fn();
    const hasBack = ref(true);
    render(() => h(ScenePreview, hasBack.value ? { onBack, backHref: "#scenes" } : { onBack }));
    await flush();
    const link = within(controls()).getByRole("link", { name: "Back to scenes" });
    expect(fireEvent.click(link)).toBe(false);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(link.getAttribute("href")).toBe("#scenes");
    fireEvent.click(link, { ctrlKey: true });
    expect(onBack).toHaveBeenCalledTimes(1);
    hasBack.value = false;
    await flush();
    fireEvent.click(within(controls()).getByRole("button", { name: "Back to scenes" }));
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(within(controls()).getByText("Get started")).toBeTruthy();
  });

  it("plays a timed scene through requestAnimationFrame and pauses on visibility loss", async () => {
    let queued: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { queued = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => { queued = undefined; });
    render(() => h(ScenePreview, { definition }, { default: () => h(Surface, { id: "host" }, { default: () => "Host" }) }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await flush();
    expect(queued).toBeDefined();
    queued!(performance.now() + 1500);
    await flush();
    expect(screen.getByTestId("scene-time").textContent).toMatch(/^0:0[12] \/ 0:08$/);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });
});

describe("Vue scene library", () => {
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPdwAAAAASUVORK5CYII=";
  const recipe = (id: string, snapshot?: { image: string; timeMs: number }) => ({
    version: 1, id, title: "Actual scene", definition: { width: 800, height: 600, scene: { nodes: [{ id: "card" }] }, motion: { durationMs: 2000, tracks: [] } }, snapshot,
  });

  it("uses inert cached images without mounting host scenes and recovers a failed image on replacement", async () => {
    vi.stubGlobal("ResizeObserver", function () { return { observe() {}, disconnect() {} }; });
    const Host = vi.fn(() => null);
    const bindings = { "src/flute/scenes/demo.vue": Host as unknown as Component };
    const sources = ref<Record<string, unknown>>({ "src/flute/scenes/demo.scene.json": recipe("demo", { image, timeMs: 0 }) });
    render(() => h(SceneLibrary, { sources: sources.value, bindings }));
    await flush();
    const link = screen.getByRole("link", { name: /Actual scene/ });
    const img = link.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(image);
    expect(Host).not.toHaveBeenCalled();
    fireEvent.error(img);
    await flush();
    expect(link.querySelector("img")).toBeNull();
    expect(link.textContent).toContain("01");
    sources.value = { "src/flute/scenes/demo.scene.json": recipe("demo", { image: image.replace("Pdw", "Pdx"), timeMs: 0 }) };
    await flush();
    expect(link.querySelector("img")).not.toBeNull();
    sources.value = { "src/flute/scenes/demo.scene.json": recipe("demo") };
    await flush();
    expect(link.querySelector("img")).toBeNull();
    expect(Host).not.toHaveBeenCalled();
  });

  it("loads .scene.json and .vue module pairs, opens a scene and returns with browser history", async () => {
    const Card = defineComponent({ render: () => h(Surface, { id: "card" }, { default: () => "Vue scene body" }) });
    const modules = {
      "/src/flute/scenes/demo.scene.json": async () => ({ default: recipe("demo") }),
      "/src/flute/scenes/demo.vue": async () => ({ default: Card }),
    };
    window.history.replaceState({}, "", "/?flute-preview=1");
    render(() => h(SceneModuleLibrary, { modules }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Actual scene/ })).toBeTruthy());
    expect(screen.getByText("1 perspectives")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /Actual scene/ }));
    await waitFor(() => expect(screen.getByText("Vue scene body")).toBeTruthy());
    expect(window.location.search).toContain("flute-scene=demo");
    expect(document.querySelector(bridge().selector)!.textContent).toContain("Vue scene body");
    fireEvent.click(screen.getByRole("link", { name: "Back to scenes" }));
    await waitFor(() => expect(document.querySelector("[data-flute-library]")).not.toBeNull());
    expect(window.location.search).not.toContain("flute-scene");
  });

  it("reports a missing .vue binding and an unopenable scene without crashing", async () => {
    const modules = { "/src/flute/scenes/demo.scene.json": async () => ({ default: recipe("demo") }) };
    window.history.replaceState({}, "", "/?flute-preview=1&flute-scene=demo");
    render(() => h(SceneModuleLibrary, { modules }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("cannot be opened"));
    expect(document.querySelector(".flute-library-issues")!.textContent).toContain("Missing local component");
  });

  it("reports a failing loader with a retry action", async () => {
    let fail = true;
    const modules = { "/src/flute/scenes/demo.scene.json": async () => { if (fail) throw new Error("Loader offline"); return { default: recipe("demo") }; } };
    render(() => h(SceneModuleLibrary, { modules }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Loader offline"));
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(/Loader offline/)).toBeNull());
  });

  it("gives ProjectPreview a scene library when sceneModules is supplied", async () => {
    render(() => h(ProjectPreview, { projectId: "host", enabled: true, sceneModules: {} }, { default: () => "App" }));
    await waitFor(() => expect(screen.getByText("A place for every perspective.")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Back to app" })).toBeTruthy();
  });
});

describe.each([["SceneLibrary", SceneLibrary, "Connect your first scene"], ["ScenePreview", ScenePreview, "Get started"]] as const)("Vue %s onboarding", (_name, Component, label) => {
  it("shares installed instructions and recovers clipboard failure in each empty entry", async () => {
    const copy = vi.fn().mockRejectedValueOnce(new Error("Denied")).mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    render(() => h(Component as Component));
    await flush();
    fireEvent.click(screen.getByText(label, { exact: true }));
    const content = document.querySelector<HTMLElement>(".flute-onboarding-content")!;
    expect(content.textContent).toContain("npx flute init");
    expect(content.textContent).toContain("npx flute guide");
    expect(content.textContent).toContain("FLUTE.md");
    expect(content.textContent).toContain(".vue");
    fireEvent.click(within(content).getByRole("button", { name: "Copy starter prompt" }));
    await waitFor(() => expect(within(content).getByRole("status").textContent).toContain("Select and copy"));
    expect(content.querySelector(".flute-prompt")!.textContent).toBe(copy.mock.calls[0][0]);
    fireEvent.click(within(content).getByRole("button", { name: "Copy starter prompt" }));
    await screen.findByRole("button", { name: "Prompt copied" });
    for (const link of screen.getAllByRole("link", { name: /Web Prodigies/ })) {
      expect(link.getAttribute("href")).toBe(FLUTE_BRAND.url);
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("target")).toBe("_blank");
    }
  });
});
