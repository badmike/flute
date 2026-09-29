import { defineComponent, h, onErrorCaptured, shallowRef, watch } from "vue";

/** SOURCE OF TRUTH: Vue scene render recovery.
 * WHAT: SceneErrorBoundary owns the scene fallback and resetKey adapter for Vue.
 * WHY: preserve the same recovery markup and Retry action as the React boundary.
 * WHERE: onErrorCaptured catches failures of descendant components; callers keep their existing API.
 * Emits error(error) when a failure is caught and reset() when retry or a changed resetKey recovers.
 */
export const SceneErrorBoundary = defineComponent({
  name: "FluteSceneErrorBoundary",
  props: { resetKey: { type: null, default: undefined } },
  emits: { error: (_error: unknown) => true, reset: () => true },
  setup(props, { slots, emit }) {
    const failure = shallowRef<{ error: unknown } | null>(null);
    const reset = () => { failure.value = null; emit("reset"); };
    onErrorCaptured((error) => {
      failure.value = { error };
      emit("error", error);
      return false;
    });
    watch(() => props.resetKey, () => { if (failure.value) reset(); });
    return () => {
      if (!failure.value) return slots.default?.();
      const error = failure.value.error;
      const message = error instanceof Error ? error.message : String(error);
      return h("div", { role: "alert", "data-flute-error": "" }, [
        h("strong", "Unable to render the Flute scene."),
        h("p", message),
        h("p", "Correct the component or scene configuration, then retry."),
        h("button", { type: "button", onClick: reset }, "Retry scene"),
      ]);
    };
  },
});
