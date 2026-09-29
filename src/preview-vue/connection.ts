import { reactive, toValue, watch, type MaybeRefOrGetter } from "vue";
import { bindPreviewConnection, type PreviewHot } from "../dom/connection";

/** SOURCE OF TRUTH: Vue preview connection adapter.
 * WHAT: expose the shared Vite HMR connection state machine as a Vue composable.
 * WHY: an installed production bundle cannot capture the host's import.meta.hot.
 * WHERE: callers explicitly pass their hot context; dom/connection owns the transitions.
 * The returned object is reactive: connected, updating, error and a generation counter.
 */
export type { PreviewHot };
export function usePreviewConnection(hot: MaybeRefOrGetter<PreviewHot | undefined>, pause: () => void) {
  const state = reactive({ connected: true, updating: false, error: "", generation: 0 });
  watch(() => toValue(hot), (context, _previous, onCleanup) => {
    if (!context) return;
    onCleanup(bindPreviewConnection(context, pause,
      next => { state.connected = next.connected; state.updating = next.updating; state.error = next.error; },
      () => { state.generation++; }));
  }, { immediate: true });
  return state;
}
