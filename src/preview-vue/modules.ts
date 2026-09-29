import { defineComponent, h, markRaw, shallowRef, watch, type Component, type PropType } from "vue";
import { usePreviewConnection, type PreviewHot } from "./connection";
import { VueSceneLibrary } from "./SceneLibrary";

/** SOURCE OF TRUTH: Vue SceneModules adapter.
 * WHAT: load explicitly supplied host source modules only for the development library.
 * WHY: normal app entry and production never import authored scene modules.
 * WHERE: the host passes lazy import.meta.glob loaders; core load-scene validates metadata.
 * Bindings are .vue single-file components (or Vue JSX modules); recipes are .scene.json.
 */
export type SceneModules = Record<string, () => Promise<unknown>>;
const pause = () => {};
type Loaded = { sources: Record<string, unknown>; bindings: Record<string, Component>; error?: string };
export const VueSceneModuleLibrary = defineComponent({
  name: "FluteSceneModuleLibrary",
  props: {
    modules: { type: Object as PropType<SceneModules>, required: true },
    hot: { type: Object as PropType<PreviewHot> },
    backHref: { type: String },
  },
  setup(props) {
    const connection = usePreviewConnection(() => props.hot, pause);
    const retry = shallowRef(0);
    const state = shallowRef<Loaded | null>(null);
    watch([() => props.modules, retry, () => connection.generation], (_current, _previous, onCleanup) => {
      let active = true;
      onCleanup(() => { active = false; });
      const load = async () => {
        const sources: Record<string, unknown> = {};
        const bindings: Record<string, Component> = {};
        try {
          const entries = Object.entries(props.modules);
          if (entries.length > 256) throw new Error("Keep this library at or below 128 scene/component pairs.");
          const results = await Promise.allSettled(entries.map(async ([path, loader]) => {
            const value = await loader();
            const item = value && typeof value === "object" && "default" in value ? value.default : undefined;
            const normalized = path.replace(/^\//, "");
            if (path.endsWith(".scene.json")) sources[normalized] = item;
            else if (/\.(?:[jt]sx|vue)$/.test(path) && (typeof item === "function" || (typeof item === "object" && item !== null)))
              bindings[normalized] = markRaw(item as object) as Component;
          }));
          const failed = results.find(result => result.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
          if (active) state.value = { sources, bindings };
        } catch (error) {
          if (active) state.value = { sources, bindings, error: error instanceof Error ? error.message : "Scene source could not be loaded." };
        }
      };
      void load();
    }, { immediate: true });
    return () => {
      const loaded = state.value;
      if (!loaded) return h("div", { role: "status", style: { padding: "40px", color: "#eee", background: "#000" } }, "Loading your scenes…");
      return [
        h(VueSceneLibrary, { sources: loaded.sources, bindings: loaded.bindings, hot: props.hot, backHref: props.backHref }),
        loaded.error ? h("aside", { role: "alert", style: { position: "fixed", zIndex: 20, bottom: "60px", left: "24px", right: "24px", padding: "24px", borderRadius: "20px", background: "#252529", color: "#fff" } }, [
          `Correct the scene source: ${loaded.error} `,
          h("button", { onClick: () => { retry.value++; } }, "Retry"),
        ]) : null,
      ];
    };
  },
});
