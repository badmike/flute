import { defineComponent, h, type PropType } from "vue";
import { Surface } from "../vue";
import type { PreviewDefinitionInput } from "../core";
import type { PreviewHot } from "./connection";
import { VueSceneModuleLibrary, type SceneModules } from "./modules";
import { VueScenePreview } from "./ScenePreview";
export { VueSceneLibrary as SceneLibrary } from "./SceneLibrary";
export type { SceneLibraryProps } from "./SceneLibrary";
export { VueScenePreview as ScenePreview } from "./ScenePreview";
export { VueSceneModuleLibrary as SceneModuleLibrary } from "./modules";
export { useVuePreviewSession as usePreviewSession } from "./session";
export { usePreviewConnection } from "./connection";
export type { SceneModules } from "./modules";
export type { PreviewHot } from "./connection";

/** SOURCE OF TRUTH: Vue ProjectPreview installed application adapter.
 * WHAT: retain the explicit development/query guard around original host slot content.
 * WHY: the real product shell frames live UI without copying data or changing normal routes.
 * WHERE: the generated src/flute/ProjectPreview.vue injects this adapter; ScenePreview owns all playback and chrome.
 * Props: projectId, enabled, active (defaults to ?flute-preview=1), hot and sceneModules.
 * The location is read once at mount. Disabled or inactive previews render the default slot untouched.
 */
const initialDefinition: PreviewDefinitionInput = {
  scene: { camera: { perspective: 1800, rotateX: 4, rotateY: -7 }, focus: { distance: 1800, fStop: 8, maxBlur: 6 }, nodes: [{ id: "flute-application" }] },
};
export const ProjectPreview = defineComponent({
  name: "FluteProjectPreview",
  inheritAttrs: false,
  props: {
    projectId: { type: String, required: true },
    enabled: { type: Boolean, required: true },
    active: { type: Boolean, default: undefined },
    hot: { type: Object as PropType<PreviewHot> },
    sceneModules: { type: Object as PropType<SceneModules> },
  },
  setup(props, { slots }) {
    const location = typeof window === "undefined" ? "" : window.location.href;
    const entry = (() => {
      if (!location) return null;
      const url = new URL(location);
      const requested = url.searchParams.get("flute-preview") === "1";
      url.searchParams.delete("flute-preview");
      url.searchParams.delete("flute-scene");
      return { requested, back: url.pathname + url.search + url.hash };
    })();
    return () => {
      if (!props.enabled || !(props.active ?? entry?.requested)) return slots.default?.();
      if (props.sceneModules) return h("div", { "data-flute-project": props.projectId }, [
        h(VueSceneModuleLibrary, { modules: props.sceneModules, hot: props.hot, backHref: entry?.back }),
      ]);
      return h("div", { "data-flute-project": props.projectId }, [
        h(VueScenePreview, { title: "Your application", definition: initialDefinition, backHref: entry?.back, hot: props.hot }, {
          default: () => h(Surface, { id: "flute-application", style: { width: "100%", minHeight: "980px" } }, { default: () => slots.default?.() }),
        }),
      ]);
    };
  },
});
