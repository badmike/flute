import { defineComponent, h, type PropType } from "vue";
import type { EvaluatedNode } from "../core";
import { DEPTH_TEXTURES, focusFilterModel } from "../dom/focus-filter";

/** SOURCE OF TRUTH: Vue FocusFilter presentation.
 * WHAT: the same SVG depth-blur filter graph as the React adapter, as a render function.
 * WHY: identical native feImage/feComponentTransfer output; never encode image documents per frame.
 * WHERE: dom/focus-filter computes the model from core's weights; Surface mounts this beside its leaf.
 * Vue does not camel-case SVG attributes, so the two hyphenated names are written explicitly.
 */
export const FocusFilter = defineComponent({
  name: "FluteFocusFilter",
  props: {
    id: { type: String, required: true },
    node: { type: Object as PropType<EvaluatedNode>, required: true },
  },
  setup(props) {
    return () => {
      const { pad, width, height, mask, bands, extent, margin } = focusFilterModel(props.node);
      const box = { x: -pad, y: -pad, width: width + 2 * pad, height: height + 2 * pad };
      const axis = (name: "X" | "Y", href: string, reverse: boolean) => [
        h("feImage", { href, ...box, preserveAspectRatio: "none", result: "axis" + name }),
        h("feComponentTransfer", { in: "axis" + name, result: "depth" + name }, [
          h("feFuncA", { type: "table", tableValues: reverse ? "1 0" : "0 1" }),
        ]),
      ];
      return h("svg", { "aria-hidden": "true", width: "0", height: "0", style: { position: "absolute", pointerEvents: "none" } }, [
        h("defs", [
          h("filter", {
            id: props.id, filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", ...box,
            "color-interpolation-filters": "sRGB",
          }, [
            ...axis("X", DEPTH_TEXTURES.x, mask.reverseX),
            ...axis("Y", DEPTH_TEXTURES.y, mask.reverseY),
            h("feComposite", { in: "depthX", in2: "depthY", operator: "arithmetic", k2: mask.xWeight, k3: mask.yWeight, result: "depth" }),
            ...bands.flatMap(({ index: i, weights, previous, deviation }) => [
              h("feGaussianBlur", { in: "SourceGraphic", stdDeviation: deviation, result: `blur${i}` }),
              h("feComponentTransfer", { in: "depth", x: margin, y: margin, width: width + extent, height: height + extent, result: `mask${i}` }, [
                h("feFuncA", { type: "table", tableValues: weights.join(" ") }),
              ]),
              h("feComposite", { in: `blur${i}`, in2: `mask${i}`, operator: "in", result: `part${i}` }),
              previous === undefined
                ? h("feComposite", { in: `part${i}`, in2: `part${i}`, operator: "arithmetic", k2: 1, result: `sum${i}` })
                : h("feComposite", { in: `sum${previous}`, in2: `part${i}`, operator: "arithmetic", k2: 1, k3: 1, result: `sum${i}` }),
            ]),
          ]),
        ]),
      ]);
    };
  },
});
