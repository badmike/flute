import { nextTick, onBeforeUnmount, onMounted, toValue, watch, type MaybeRefOrGetter } from "vue";
import { installCaptureBridge } from "../dom/capture";

/** SOURCE OF TRUTH: Vue useSceneCapture.
 * WHAT: expose a single explicitly registered live viewport to local frame capture.
 * WHY: exports seek the same controller/Scene clock; Vue applies state on the next tick,
 * so the bridge's seek returns a promise that settles after the DOM commit (Playwright awaits it).
 * WHERE: dom/capture owns validation; Node export services read window.__FLUTE_CAPTURE__.
 * No network listener, file access, or authentication lives in this browser adapter.
 */
export function useSceneCapture({ durationMs, seek, selector = '[data-flute-capture="scene"]' }:
  { durationMs: MaybeRefOrGetter<number>; seek: (elapsedMs: number) => void; selector?: string }) {
  let dispose: (() => void) | undefined;
  const install = () => {
    dispose?.();
    dispose = installCaptureBridge({
      durationMs: toValue(durationMs), selector,
      apply: async (elapsedMs) => { seek(elapsedMs); await nextTick(); },
    });
  };
  onMounted(install);
  watch(() => toValue(durationMs), () => { if (dispose) install(); });
  onBeforeUnmount(() => { dispose?.(); dispose = undefined; });
}
