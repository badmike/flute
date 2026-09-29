// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

// Server rendering (Nuxt, or any SSR host): no window, document, ResizeObserver or matchMedia exists here,
// so importing and rendering Flute's Vue entries must not touch them at module scope or in setup.
const render = (component: ReturnType<typeof defineComponent>) => renderToString(createSSRApp(component));

describe("Vue entries in a server render (no DOM globals)", () => {
  it("runs in a real DOM-less environment", () => {
    for (const name of ["window", "document", "ResizeObserver", "matchMedia", "requestAnimationFrame", "location"])
      expect((globalThis as Record<string, unknown>)[name], name).toBeUndefined();
  });

  it("imports @webprodigies/flute/vue and /vue/preview without reading browser globals", async () => {
    const runtime = await import("../../src/vue");
    const preview = await import("../../src/preview-vue");
    for (const name of ["Scene", "Surface", "Motion", "useSceneTime", "useSceneCapture", "SceneErrorBoundary"]) expect(runtime, name).toHaveProperty(name);
    for (const name of ["ProjectPreview", "ScenePreview", "SceneLibrary"]) expect(preview, name).toHaveProperty(name);
  });

  it("server-renders Scene, Surface, Motion, a content slot and useSceneTime", async () => {
    const { Scene, Surface, Motion, useSceneTime, SceneErrorBoundary } = await import("../../src/vue");
    const Clock = defineComponent({ setup() { const time = useSceneTime(); return () => h("output", String(time.value)); } });
    const html = await render(defineComponent({
      render: () => h(SceneErrorBoundary, null, { default: () => h(Scene, { style: { width: 800, height: 400 }, timeMs: 250, focus: { distance: 1400, focalLength: 50, fStop: 8, maxBlur: 6 } }, {
        default: () => [
          h(Surface, { id: "page", transform: { z: 40 }, style: { position: "absolute", width: 300, height: 200 } }, {
            content: () => h("div", "backdrop"),
            default: () => h(Motion, { id: "card", style: { width: 100 } }, { default: () => h(Clock) }),
          }),
        ],
      }) }),
    }));
    expect(html).toContain("data-flute-scene");
    expect(html).toContain('data-flute-id="page"');
    expect(html).toContain('data-flute-id="card"');
    expect(html).toContain("backdrop");
    expect(html).toContain("width:800px");
    expect(html).toContain("<output>250</output>");
    expect(html).not.toContain("data-flute-error");
  });

  it("server-renders the Vue project preview: disabled renders the slot, enabled renders the studio shell", async () => {
    const { ProjectPreview } = await import("../../src/preview-vue");
    const id = "00000000-0000-4000-8000-000000000000";
    const app = (props: { enabled: boolean; active?: boolean; sceneModules?: Record<string, () => Promise<unknown>> }) => defineComponent({ render: () => h(ProjectPreview, { projectId: id, ...props }, { default: () => h("main", "host app") }) });
    expect(await render(app({ enabled: false }))).toContain("host app");
    expect(await render(app({ enabled: true }))).toContain("host app");
    const studio = await render(app({ enabled: true, active: true, sceneModules: {} }));
    expect(studio).toContain(`data-flute-project="${id}"`);
    expect(studio).not.toContain("host app");
  });

  it("server-renders ScenePreview and SceneLibrary", async () => {
    const { ScenePreview, SceneLibrary } = await import("../../src/preview-vue");
    const preview = await render(defineComponent({ render: () => h(ScenePreview, { title: "Server", definition: { scene: { nodes: [{ id: "a" }] } } }) }));
    expect(preview).toContain("Server");
    expect(await render(defineComponent({ render: () => h(SceneLibrary, { sources: {}, bindings: {} }) }))).toContain("data-flute");
  });
});
