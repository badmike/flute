// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h, nextTick, type App } from "vue";
import { renderToString } from "vue/server-renderer";
import { Motion, Scene, Surface, useSceneTime } from "../../src/vue";

// SSR then hydrate: the server HTML is produced with every DOM global removed (a real server has none),
// then the client hydrates it in jsdom. Hydration must not warn about mismatches and must then behave live.
const Clock = defineComponent({ setup() { const time = useSceneTime(); return () => h("output", { "data-testid": "clock" }, String(time.value)); } });
const Page = defineComponent({
  render: () => h("section", { id: "host" }, [
    h(Scene, { style: { width: 800, height: 400, opacity: 0.9 }, timeMs: 300, camera: { z: 40 }, focus: { distance: 1400, focalLength: 50, fStop: 8, maxBlur: 0 } }, {
      default: () => h(Surface, { id: "page", transform: { z: 60 }, style: { position: "absolute", width: 300, height: 200 } }, {
        content: () => h("div", "backdrop"),
        default: () => h(Motion, { id: "card", style: { width: 100, zIndex: 2 } }, { default: () => h(Clock) }),
      }),
    }),
  ]),
});
async function serverHtml() {
  const names = ["window", "document", "ResizeObserver", "matchMedia", "requestAnimationFrame", "location"] as const;
  for (const name of names) vi.stubGlobal(name, undefined);
  try { return await renderToString(createSSRApp(Page)); }
  finally { vi.unstubAllGlobals(); installLayout(); }
}
function installLayout() {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-flute-stage") ? 800 : parseFloat(this.style.width) || 200;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-flute-stage") ? 400 : parseFloat(this.style.height) || 100;
  });
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
    return this.parentElement?.closest("[data-flute-id], [data-flute-stage]") ?? null;
  });
}
let app: App | undefined;
beforeEach(installLayout);
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Scene and Surface hydration", () => {
  it("hydrates server HTML without any mismatch warning, then becomes live", async () => {
    const html = await serverHtml();
    expect(html).toContain('data-flute-id="card"');
    expect(html).toContain("opacity:0.9");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const before = container.querySelector('[data-flute-id="page"]')!;
    app = createSSRApp(Page);
    app.mount(container);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(warn.mock.calls.flat().join("\n")).not.toMatch(/hydrat|mismatch/i);
    expect(error).not.toHaveBeenCalled();
    // Hydration adopts the server DOM (same node); the live registry then evaluates real depth (z 60 minus camera z 40).
    expect(container.querySelector('[data-flute-id="page"]')).toBe(before);
    expect(container.querySelector("[data-flute-scene]")!.getAttribute("data-flute-valid")).toBe("true");
    expect(container.querySelector('[data-flute-id="page"]')!.getAttribute("data-flute-depth")).toBe("20");
    expect(container.querySelector('[data-testid="clock"]')!.textContent).toBe("300");
    expect((container.querySelector("[data-flute-scene]") as HTMLElement).style.opacity).toBe("0.9");
    expect((container.querySelector('[data-flute-id="card"]') as HTMLElement).style.zIndex).toBe("2");
  });
});
