import {
  computed, defineComponent, h, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component, type PropType,
} from "vue";
import { FLUTE_BRAND, RESOURCES, motionDuration } from "../core";
import { libraryTheme } from "../dom/library-theme";
import { LIBRARY_CAMERA, LIBRARY_FOCUS, LIBRARY_ROW, visibleRows } from "../dom/library-layout";
import { Scene, SceneErrorBoundary, Surface } from "../vue";
import { BrandAttribution } from "./BrandAttribution";
import type { PreviewHot } from "./connection";
import { GettingStarted } from "./GettingStarted";
import { VueScenePreview } from "./ScenePreview";

/** SOURCE OF TRUTH: Vue SceneLibrary.
 * WHAT: list and navigate the host's validated source recipes through one catalog.
 * Projected row visibility and centered scroll endpoints belong to this list layout.
 * WHY: discovered files, deep links and CLI reopening share load-scene validation.
 * WHERE: ProjectPreview supplies Vite modules; ScenePreview owns selected playback.
 * The catalog, layout math and DOM classes are shared with the React library; only rendering is Vue.
 */
export type SceneLibraryProps = { sources?: Record<string, unknown>; bindings?: Record<string, Component>; hot?: PreviewHot; backHref?: string };
const EMPTY_SOURCES: Record<string, unknown> = {};
const EMPTY_BINDINGS: Record<string, Component> = {};
const ROW = LIBRARY_ROW;
// Image failures are local to the thumbnail; a replacement source retries naturally.
const SnapshotImage = defineComponent({
  name: "FluteSnapshotImage",
  props: { src: { type: String, required: true } },
  setup(props) {
    const failed = ref<string>();
    return () => failed.value === props.src ? null
      : h("img", { src: props.src, alt: "", loading: "lazy", decoding: "async", onError: () => { failed.value = props.src; } });
  },
});
function selection() { return typeof location === "undefined" ? undefined : new URL(location.href).searchParams.get("flute-scene") ?? undefined; }
export const VueSceneLibrary = defineComponent({
  name: "FluteSceneLibrary",
  props: {
    sources: { type: Object as PropType<Record<string, unknown>>, default: () => EMPTY_SOURCES },
    bindings: { type: Object as PropType<Record<string, Component>>, default: () => EMPTY_BINDINGS },
    hot: { type: Object as PropType<PreviewHot> },
    backHref: { type: String },
  },
  setup(props) {
    const sceneId = ref<string | undefined>(selection());
    const scroll = ref(0);
    const size = ref({ width: 1200, height: 1000 });
    const scroller = shallowRef<HTMLDivElement | null>(null);
    let savedScroll = 0;
    const catalog = computed(() => RESOURCES["resolve-recipes"]({
      sources: Object.entries(props.sources).map(([path, document]) => ({ path, document })),
      bindingPaths: Object.keys(props.bindings),
      ...(sceneId.value ? { sceneId: sceneId.value } : {}),
    }));
    const pop = () => { sceneId.value = selection(); };
    onMounted(() => window.addEventListener("popstate", pop));
    onBeforeUnmount(() => window.removeEventListener("popstate", pop));
    let observer: ResizeObserver | undefined;
    const active = computed(() => {
      const selected = catalog.value.selected;
      const component = selected ? props.bindings[selected.binding] : undefined;
      return selected && component ? { id: selected.id, component } : undefined;
    });
    // Track the list scroller only while the library (not a selected scene) is showing.
    watch([scroller, () => active.value?.id], ([element]) => {
      observer?.disconnect();
      observer = undefined;
      if (!element || active.value) return;
      const measure = () => { size.value = { width: element.clientWidth, height: element.clientHeight }; };
      observer = new ResizeObserver(measure);
      observer.observe(element);
      measure();
      element.scrollTop = savedScroll;
    }, { flush: "post" });
    onBeforeUnmount(() => observer?.disconnect());
    const destination = (id?: string) => {
      // Server renders (no location) get a query-only link; the client recomputes it from the real URL.
      if (typeof location === "undefined") return id ? `?flute-scene=${encodeURIComponent(id)}` : "?";
      const url = new URL(location.href);
      if (id) url.searchParams.set("flute-scene", id); else url.searchParams.delete("flute-scene");
      return url.pathname + url.search + url.hash;
    };
    const navigate = (event: MouseEvent, id?: string) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState({}, "", destination(id));
      sceneId.value = id;
    };
    return () => {
      const { scenes, selected, issues } = catalog.value;
      if (selected && active.value) {
        const component = markRaw(active.value.component as object) as Component;
        return h(VueScenePreview, {
          key: selected.id, definition: selected.definition, title: selected.title, backHref: destination(),
          onBack: () => { history.pushState({}, "", destination()); sceneId.value = undefined; }, hot: props.hot,
        }, { default: () => h(component) });
      }
      const { width, height } = size.value;
      const planeWidth = Math.min(940, Math.max(320, width - 64));
      const { start, end } = visibleRows(scroll.value, height, scenes.length);
      const empty = scenes.length === 0;
      return h("main", { "data-flute-library": "" }, [
        h("style", libraryTheme),
        h("div", { class: "flute-library-top" }, [
          h("div", { class: "flute-library-identity" }, [
            h("a", { href: destination(), onClick: (event: MouseEvent) => navigate(event), class: "flute-library-brand" }, FLUTE_BRAND.name.toLowerCase()),
            h(BrandAttribution, { showName: false }),
          ]),
          props.backHref ? h("a", { href: props.backHref }, "Back to app") : null,
        ]),
        sceneId.value ? h("div", { class: "flute-library-notice", role: "alert" }, [
          "This scene cannot be opened. Correct its source or ",
          h("a", { href: destination(), onClick: (event: MouseEvent) => navigate(event) }, "return to scenes"), ".",
        ]) : null,
        issues.length > 0 ? h("details", { class: "flute-library-issues" }, [
          h("summary", `Some scene sources need attention (${issues.length})`),
          h("ul", issues.map((issue, index) => h("li", { key: index }, `${issue.path}: ${issue.message}`))),
        ]) : null,
        empty ? h("section", { class: "flute-library-empty" }, [h("div", [
          h("span", "YOUR SCENE LIBRARY"),
          h("h1", "A place for every perspective."),
          h("p", "Your app’s scenes appear here as your coding agent creates them."),
          h(GettingStarted, { label: "Connect your first scene" }),
        ])]) : h("div", {
          ref: scroller, class: "flute-library-scroll", role: "region", "aria-label": "Scenes", tabindex: 0,
          onScroll: (event: Event) => { savedScroll = (event.currentTarget as HTMLElement).scrollTop; scroll.value = savedScroll; },
        }, [
          h("div", { style: { height: `calc(100svh + ${Math.max(0, (scenes.length - 1) * ROW)}px)` } }, [
            h("div", { class: "flute-library-stage" }, [
              h(SceneErrorBoundary, null, { default: () => h(Scene, { camera: LIBRARY_CAMERA, focus: LIBRARY_FOCUS, style: { width: "100%", height: "100%" } }, {
                default: () => h(Surface, {
                  id: "scene-list", transform: { y: -scroll.value },
                  style: { position: "absolute", left: `${(width - planeWidth) / 2}px`, top: `${height / 2 - 110 - ROW / 2}px`, width: `${planeWidth}px`, height: "1px" },
                }, {
                  default: () => [
                    h(Surface, { id: "scene-list-heading", style: { position: "absolute", top: "0px", width: `${planeWidth}px`, height: "110px" } }, {
                      default: () => h("header", { class: "flute-library-heading" }, [h("h1", "Your scenes"), h("span", `${scenes.length} perspectives`)]),
                    }),
                    ...scenes.slice(start, end).map((scene, index) => {
                      const number = start + index;
                      return h(Surface, { key: scene.id, id: `scene-row-${scene.id}`, style: { position: "absolute", top: `${110 + number * ROW}px`, width: `${planeWidth}px`, height: `${ROW}px` } }, {
                        default: () => h("a", {
                          class: "flute-scene-row", "data-scene-id": scene.id, href: destination(scene.id),
                          onFocus: (event: FocusEvent) => {
                            const target = event.currentTarget as HTMLElement;
                            if (target.matches(":focus-visible") && scroller.value) scroller.value.scrollTop = Math.max(0, number * ROW);
                          },
                          onClick: (event: MouseEvent) => navigate(event, scene.id),
                        }, [
                          h("span", { class: "flute-scene-number" }, [String(number + 1).padStart(2, "0"), scene.snapshot ? h(SnapshotImage, { src: scene.snapshot.image }) : null]),
                          h("span", { class: "flute-scene-copy" }, [h("strong", scene.title), h("span", scene.description || "A new perspective on your product")]),
                          h("span", { class: "flute-scene-duration" }, [`${Math.round((scene.definition.motion ? motionDuration(scene.definition.motion) : 0) / 1000)}s `, h("span", { "aria-hidden": "true" }, "↗")]),
                        ]),
                      });
                    }),
                  ],
                }),
              }) }),
            ]),
          ]),
        ]),
        scenes.length > 0 ? h("p", { class: "flute-library-hint" }, "Scroll to explore · Select a scene to watch") : null,
      ]);
    };
  },
});
