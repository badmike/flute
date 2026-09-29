import { computed, inject, type ComputedRef } from "vue";
import { SCENE_KEY } from "./context";

/** SOURCE OF TRUTH: useSceneTime.
 * WHAT: read the explicit Scene clock (motion-clamped elapsed milliseconds) as a computed ref.
 * WHY: opt-in component adapters follow the same time used by spatial tracks.
 * WHERE: Scene provides the value through inject; call inside a component under a Scene.
 */
export function useSceneTime(): ComputedRef<number> {
  const context = inject(SCENE_KEY, undefined);
  if (!context) throw new Error("useSceneTime requires a Flute Scene.");
  return computed(() => context.state.value.timeMs);
}
