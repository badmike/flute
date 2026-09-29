import { computed, createApp, defineComponent, h, inject, onMounted, provide, ref, type Ref } from "vue";
import { Surface, type PreviewDefinitionInput } from "../../src/vue";
import { SceneLibrary, ScenePreview } from "../../src/preview-vue";

// Vue twin of tests/preview/fixture.tsx: same definition, host UI and catalog.
const rack = new URLSearchParams(location.search).get("mode") === "focus";
const definition: PreviewDefinitionInput = { width: 1400, height: 980,
  scene: { camera: { perspective: 1800, rotateX: 12, rotateY: -18 }, focus: { distance: 1800, fStop: 2.8, maxBlur: 6 }, nodes: [{ id: "host" }] },
  motion: { durationMs: 4000, tracks: [rack
    ? { target: { kind: "focus" }, property: "distance", keyframes: [{ timeMs: 0, value: 1800 }, { timeMs: 4000, value: 1560 }] }
    : { target: { kind: "camera" }, property: "x", keyframes: [{ timeMs: 0, value: -100 }, { timeMs: 4000, value: 100 }] }] },
};
const Host = defineComponent({
  setup() {
    const context = inject<Ref<string>>("context")!;
    const count = ref(0);
    return () => h("article", { "data-testid": "host", style: { background: "#ecebea", color: "#28262e", fontFamily: "Arial", padding: "40px", height: "800px" } }, [
      h("h2", context.value),
      h("button", { onClick: () => { count.value++; } }, `Count ${count.value}`),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "20px", marginTop: "30px" } },
        Array.from({ length: 30 }, (_, index) => h("div", { key: index, style: { padding: "18px", background: "#fff" } }, [`Region ${index + 1}`, h("p", "Live text")]))),
    ]);
  },
});
const Fixture = defineComponent({
  setup() {
    const invalid = ref(false);
    const data = ref("Loading");
    provide("context", data);
    onMounted(() => { fetch("/data.json").then(response => response.json()).then(value => { data.value = value.title; }); });
    const input = computed(() => invalid.value ? { ...definition, scene: { ...definition.scene, focus: { distance: -1 } } } : definition);
    return () => [
      h("button", { "data-test-only": "", onClick: () => { invalid.value = !invalid.value; } }, invalid.value ? "Correct source" : "Invalid source"),
      h(ScenePreview, { definition: input.value, title: "Host project", hot: (import.meta as any).hot }, {
        default: () => h(Surface, { id: "host", style: { width: "1100px", height: "880px", left: "150px", top: "50px" } }, { default: () => h(Host) }),
      }),
    ];
  },
});
const CatalogHost = defineComponent({
  setup() { provide("context", ref("Provider content")); return () => h(Surface, { id: "host", style: { width: "1100px", height: "880px", left: "150px", top: "50px" } }, { default: () => h(Host) }); },
});
const snapshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPdwAAAAASUVORK5CYII=";
const recipes = Array.from({ length: 30 }, (_, index) => {
  const id = "scene-" + String(index + 1).padStart(2, "0");
  return { id, version: 1, title: "Scene " + String(index + 1).padStart(2, "0"), description: "Existing host components", definition,
    ...(index === 0 ? { snapshot: { image: snapshot, timeMs: 0 } } : index === 1 ? { snapshot: { image: "data:image/png;base64,iVBORw0KGgoAAAA", timeMs: 0 } } : {}) };
});
const sources = Object.fromEntries(recipes.map(recipe => ["src/flute/scenes/" + recipe.id + ".scene.json", recipe]));
const bindings = Object.fromEntries(recipes.map(recipe => ["src/flute/scenes/" + recipe.id + ".vue", CatalogHost]));
createApp(new URLSearchParams(location.search).get("mode") === "library"
  ? { render: () => h(SceneLibrary, { sources, bindings, backHref: "/" }) } : Fixture).mount("#root");
