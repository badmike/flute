import {
  computed, defineComponent, h, inject, normalizeStyle, onBeforeUnmount, onMounted, onUpdated,
  provide, shallowRef, toRaw, useId, type PropType,
} from "vue";
import { transformToCss, uniformFocusBlur, type TransformInput } from "../core";
import { withPixelUnits } from "../dom/style-units";
import { PARENT_KEY, SCENE_KEY } from "./context";
import { FocusFilter } from "./FocusFilter";

/** SOURCE OF TRUTH: Vue Surface / Motion registration and leaf rendering.
 * WHAT: one DOM binding per Surface instance, keyed by a private Symbol token, not by its public ID.
 * WHY: duplicate IDs must reach core validation, and unmount must remove only its own binding.
 * WHERE: Scene.ts supplies evaluated nodes through inject; dom/registry measures the untransformed layout.
 * Default slot = children (nested spatial groups); named slot "content" = the isolated visual leaf,
 * matching the React children/content props. Registration runs on mount and every update, exactly
 * like React layout effects; unchanged registrations do not publish, so updates cannot loop.
 * The transform prop is passed to the registry as a raw object so identity checks stay valid.
 */
export const Surface = defineComponent({
  name: "FluteSurface",
  inheritAttrs: false,
  props: {
    id: { type: String, required: true },
    transform: { type: Object as PropType<TransformInput> },
  },
  setup(props, { slots, attrs }) {
    const context = inject(SCENE_KEY, undefined);
    if (!context) throw new Error("Surface and Motion must be rendered inside a Flute Scene.");
    const parent = inject(PARENT_KEY, undefined);
    const token = Symbol("flute-binding");
    const filterId = "flute-focus-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const element = shallowRef<HTMLDivElement | null>(null);
    const { registry } = context;
    const register = () => registry.upsert({
      token, id: props.id, parent, element: element.value!,
      transform: props.transform && toRaw(props.transform),
    });
    onMounted(register);
    onUpdated(register);
    onBeforeUnmount(() => registry.remove(token));
    provide(PARENT_KEY, token);
    const scene = computed(() => context.state.value);
    return () => {
      const { nodes, transforms, opacities } = scene.value;
      void context.revision.value;
      // Reading every key tracks in-place edits of a reactive transform object.
      if (props.transform) void { ...props.transform };
      const { class: className, style: rawStyle, ...rest } = attrs;
      const style = withPixelUnits((normalizeStyle(rawStyle) ?? {}) as Record<string, string | number>);
      const id = props.id;
      const node = nodes.get(id);
      const hasContent = slots.content !== undefined;
      const grouped = Array.from(registry.entries.values()).some((binding) => binding.parent === token);
      const blur = node?.blur ?? 0;
      const filtering = node && node.width > 0 && node.height > 0 && node.focus.maxBlur > 0 && (hasContent || !grouped);
      const uniformBlur = filtering ? uniformFocusBlur(node.focus, node.width, node.height) : 0;
      const leafStyle = {
        pointerEvents: style.pointerEvents ?? "auto",
        opacity: opacities.get(id) ?? 1,
        filter: !filtering || uniformBlur === 0 ? "none"
          : uniformBlur !== undefined ? `blur(${uniformBlur}px)` : `url(#${filterId})`,
      };
      const leaf = !hasContent && !grouped;
      return [
        filtering && uniformBlur === undefined ? h(FocusFilter, { id: filterId, node }) : null,
        h("div", {
          ...rest,
          ref: element,
          class: className,
          "data-flute-id": id,
          "data-flute-blur": blur,
          "data-flute-depth": node?.worldPosition.z ?? 0,
          style: {
            ...style,
            position: style.position ?? "relative",
            transform: transformToCss(transforms.get(id)),
            transformOrigin: "50% 50%",
            transformStyle: "preserve-3d",
            filter: "none",
            opacity: 1,
            overflow: "visible",
            pointerEvents: "none",
          },
        }, [
          hasContent ? h("div", { "data-flute-content": "", style: leafStyle }, slots.content!()) : null,
          h("div", {
            "data-flute-content": leaf ? "" : undefined,
            style: {
              transformStyle: "preserve-3d",
              ...(leaf ? leafStyle : { filter: "none", pointerEvents: "none" }),
            },
          }, slots.default?.()),
        ]),
      ];
    };
  },
});
/** Motion shares Surface registration; Scene supplies canonical evaluated tracks. */
export const Motion = Surface;
