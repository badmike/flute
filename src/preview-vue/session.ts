import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import { RESOURCES, motionDuration, type PreviewDefinition, type PreviewDefinitionInput, type SceneIssue } from "../core";

/** SOURCE OF TRUTH: Vue preview session (exported as usePreviewSession).
 * WHAT: one presentation cursor, source revision retention and playback lifecycle as a composable.
 * WHY: UI and capture seek the same canonical motion clock without remounting host UI.
 * WHERE: ScenePreview owns presentation; core/presentPreview validates source revisions.
 * A Vue port of preview/session.ts: same clamping, pause-on-invalid and retain-last-valid rules.
 * Returns refs; the requestAnimationFrame loop only runs while playing a valid, timed scene.
 */
export function useVuePreviewSession(input: MaybeRefOrGetter<PreviewDefinitionInput | undefined>, revision?: MaybeRefOrGetter<unknown>) {
  const result = computed(() => {
    const value = toValue(input);
    return value === undefined ? null : RESOURCES["present-preview"](value);
  });
  const accepted = shallowRef<PreviewDefinition | null>(result.value?.valid ? result.value.definition : null);
  const definition = computed<PreviewDefinition | null>(() =>
    result.value?.valid ? result.value.definition : toValue(input) === undefined ? null : accepted.value);
  const timeMs = ref(0);
  const playing = ref(false);
  const renderIssues = shallowRef<SceneIssue[]>([]);
  const durationMs = computed(() => definition.value?.motion ? motionDuration(definition.value.motion) : 0);
  const issues = computed(() => result.value && !result.value.valid ? result.value.issues : renderIssues.value);
  const valid = computed(() => !!definition.value && !!result.value?.valid && issues.value.length === 0);
  const pause = () => { playing.value = false; };
  const seek = (value: number) => {
    if (!Number.isFinite(value)) return;
    playing.value = false;
    timeMs.value = Math.max(0, Math.min(durationMs.value, value));
  };
  watch([result, () => toValue(input), () => toValue(revision), durationMs], () => {
    playing.value = false;
    if (result.value?.valid) accepted.value = result.value.definition;
    if (toValue(input) === undefined) { accepted.value = null; timeMs.value = 0; renderIssues.value = []; }
    else timeMs.value = Math.min(timeMs.value, durationMs.value);
  }, { immediate: true });
  watch(valid, value => { if (!value) pause(); }, { immediate: true });
  watch([playing, valid, durationMs], (_current, _previous, onCleanup) => {
    if (!playing.value || !valid.value || !durationMs.value) return;
    const duration = durationMs.value;
    const started = performance.now() - timeMs.value;
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(duration, now - started);
      timeMs.value = next;
      if (next < duration) frame = requestAnimationFrame(tick);
      else playing.value = false;
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  }, { immediate: true });
  let media: MediaQueryList | null = null;
  const changed = () => { if (media?.matches) pause(); };
  const visibility = () => { if (document.hidden) pause(); };
  onMounted(() => {
    media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    media?.addEventListener("change", changed);
    document.addEventListener("visibilitychange", visibility);
  });
  onBeforeUnmount(() => {
    media?.removeEventListener("change", changed);
    document.removeEventListener("visibilitychange", visibility);
  });
  const toggle = () => {
    if (!valid.value || !durationMs.value) return;
    if (timeMs.value >= durationMs.value) timeMs.value = 0;
    playing.value = !playing.value;
  };
  const onDiagnostics = (next: SceneIssue[]) => { renderIssues.value = next; };
  return { definition, timeMs, durationMs, playing, valid, issues, seek, pause, toggle, onDiagnostics };
}
