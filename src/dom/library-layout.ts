import { matrixFor, TransformSchema } from "../core";

/** SOURCE OF TRUTH: LIBRARY_ROW, LIBRARY_CAMERA, LIBRARY_FOCUS, visibleRows.
 * WHAT: the scene library's fixed lens and its projected row-visibility culling.
 * WHY: React and Vue libraries must place and retire rows identically; the math is DOM-free.
 * WHERE: preview/SceneLibrary and preview-vue/SceneLibrary render rows; core supplies the matrix.
 * Positive X tilt recedes at the top and approaches the viewer at the bottom.
 * The lens stays fixed at the viewport center while the entire list travels through it.
 */
export const LIBRARY_ROW = 150;
export const LIBRARY_CAMERA = { perspective: 1400, rotateX: 42 };
export const LIBRARY_FOCUS = { distance: 1400, fStop: 4, focalLength: 220, maxBlur: 7 };
const view = matrixFor(TransformSchema.parse({ rotateX: LIBRARY_CAMERA.rotateX }));
// Viewport culling consumes the canonical camera matrix, not flat scroll indices.
// Invert the projected vertical coordinate on this list's z=0 plane. Keep a full
// row plus the blur footprint beyond each edge; a visible horizon retains its tail.
export function visibleRows(scroll: number, height: number, count: number) {
  const localY = (screenY: number) => {
    const y = screenY - height / 2;
    const denominator = LIBRARY_CAMERA.perspective * view[5] + y * view[9];
    return denominator <= 0 ? -Infinity : height / 2 + y * LIBRARY_CAMERA.perspective / denominator;
  };
  const top = localY(-3 * LIBRARY_FOCUS.maxBlur);
  const bottom = localY(height + 3 * LIBRARY_FOCUS.maxBlur);
  return {
    start: Math.max(0, Math.floor((scroll + top - (height / 2 - LIBRARY_ROW / 2)) / LIBRARY_ROW) - 1),
    end: Math.min(count, Math.ceil((scroll + bottom - (height / 2 - LIBRARY_ROW / 2)) / LIBRARY_ROW) + 2),
  };
}
