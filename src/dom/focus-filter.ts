import { FOCUS_BANDS, focusMask, type EvaluatedNode } from "../core";
import DEPTH_X from "./depth-x.png";
import DEPTH_Y from "./depth-y.png";

/** SOURCE OF TRUTH: focusFilterModel, DEPTH_TEXTURES.
 * WHAT: the numeric SVG filter description (padding, active blur bands, depth textures) for one node.
 * WHY: React and Vue render the same non-uniform depth blur from one calculation of core's weights.
 * WHERE: core/spatial supplies focusMask; react/FocusFilter and vue/FocusFilter only draw markup.
 * Zero-weight kernels contribute no pixels, so only active bands are kept.
 */
export const DEPTH_TEXTURES = { x: DEPTH_X, y: DEPTH_Y };
export function focusFilterModel(node: EvaluatedNode) {
  const { focus: f, width, height } = node;
  const pad = (3 * f.maxBlur) / f.scale;
  const masks = Array.from({ length: FOCUS_BANDS + 1 }, (_, i) => focusMask(f, width, height, i));
  const bands = masks.map((mask, index) => ({ mask, index }))
    .filter(({ mask }) => mask.stops.some(weight => weight > 0))
    .map(({ mask, index }, position, all) => ({
      index,
      weights: mask.stops,
      previous: position ? all[position - 1].index : undefined,
      deviation: (f.maxBlur * index) / FOCUS_BANDS / f.scale,
    }));
  return {
    pad, width, height, mask: masks[0], bands,
    // The transfer region for each band mask spans the blur footprint on every side.
    extent: (6 * f.maxBlur) / f.scale,
    margin: (-3 * f.maxBlur) / f.scale,
  };
}
export type FocusFilterModel = ReturnType<typeof focusFilterModel>;
