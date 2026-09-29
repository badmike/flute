import {
  computed, defineComponent, h, markRaw, normalizeStyle, onBeforeUnmount, onMounted, onUpdated,
  provide, shallowRef, type PropType,
} from "vue";
import {
  RESOURCES,
  SCENE_BACKGROUND,
  cameraToCss,
  motionTime,
  type CameraInput,
  type FocusInput,
  type Measurements,
  type SceneIssue,
} from "../core";
import type { MotionInput } from "../core/motion";
import { createRegistry } from "../dom/registry";
import { PARENT_KEY, SCENE_KEY, type SceneContextValue, type SceneState } from "./context";

/** SOURCE OF TRUTH: Vue Scene live DOM adapter.
 * WHAT: bind existing Vue subtrees to the canonical core spatial operation.
 * WHY: provide/inject, events and reactive state stay in the original Vue tree during focus
 * and transform edits. Core alone validates configuration and computes focal depth.
 * WHERE: dom/registry owns DOM layout; ../core owns schema and transform order; the React
 * Scene is the behavioral reference and both emit the same data-flute-* DOM.
 * Composition rules match the React adapter: content is an isolated visual leaf, spatial
 * containers ignore pointer hits, and clipping/opacity/decoration belong on content leaves.
 * The registry is markRaw and never enters reactive state; a shallowRef revision bridges it.
 * Vue does not add units to numeric style values, so pixel lengths are written explicitly.
 */
export const Scene = defineComponent({
  name: "FluteScene",
  inheritAttrs: false,
  props: {
    motion: { type: Object as PropType<MotionInput> },
    timeMs: { type: Number, default: 0 },
    camera: { type: Object as PropType<CameraInput> },
    focus: { type: Object as PropType<FocusInput> },
  },
  emits: { diagnostics: (_issues: SceneIssue[]) => true },
  setup(props, { slots, attrs, emit }) {
    const registry = markRaw(createRegistry());
    const revision = shallowRef(registry.snapshot());
    const unsubscribe = registry.subscribe(() => { revision.value = registry.snapshot(); });
    const stage = shallowRef<HTMLDivElement | null>(null);
    let unmount: (() => void) | undefined;
    const result = computed(() => {
      void revision.value;
      const { motion, camera, focus, timeMs } = props;
      const bindings = Array.from(registry.entries.values());
      const state = motion
        ? RESOURCES["evaluate-motion"](motion, timeMs)
        : { surfaces: {}, camera: {}, focus: {}, issues: [] };
      const input = {
        camera: { ...camera, ...state.camera },
        focus: { ...focus, ...state.focus },
        nodes: bindings.map((binding) => ({
          id: binding.id,
          parentId: binding.parent ? registry.entries.get(binding.parent)?.id : undefined,
          transform: {
            ...binding.transform,
            ...Object.fromEntries(
              Object.entries(state.surfaces[binding.id] ?? {}).filter(([key]) => key !== "opacity"),
            ),
          },
        })),
      };
      const validated = RESOURCES["validate-definition"](input);
      const measurements: Measurements = Object.fromEntries(
        bindings.flatMap((binding) => {
          const measurement = registry.measurements.get(binding.token);
          return measurement ? [[binding.id, measurement] as const] : [];
        }),
      );
      const evaluation = RESOURCES["evaluate-spatial"](input, measurements);
      const ids = new Set(bindings.map((b) => b.id));
      evaluation.issues.push(
        ...state.issues,
        ...(validated.success && validated.data.focus.maxBlur > 0 ? registry.coverageIssues : []),
        ...Object.keys(state.surfaces)
          .filter((id) => !ids.has(id))
          .map((id) => ({ path: "motion." + id, message: "Motion target is not registered: " + id })),
      );
      if (!Number.isFinite(timeMs))
        evaluation.issues.push({ path: "timeMs", message: "Scene time must be finite." });
      return { evaluation, validated, state };
    });
    const state = computed<SceneState>(() => {
      const { evaluation, validated, state: motionState } = result.value;
      const { motion, timeMs } = props;
      return {
        timeMs: motion ? motionTime(motion, timeMs) : Number.isFinite(timeMs) ? timeMs : 0,
        opacities: new Map(Object.entries(motionState.surfaces).map(([id, s]) => [id, s.opacity ?? 1])),
        nodes: new Map(evaluation.nodes.map((node) => [node.id, node])),
        transforms: new Map(validated.success ? validated.data.nodes.map((node) => [node.id, node.transform]) : []),
      };
    });
    const context: SceneContextValue = { registry, revision, state };
    provide(SCENE_KEY, context);
    provide(PARENT_KEY, undefined);
    // Only issue changes notify the host, including a single empty report after correction.
    const issueKey = computed(() => JSON.stringify(result.value.evaluation.issues));
    let lastReported: string | undefined;
    const report = () => {
      if (lastReported !== issueKey.value) {
        lastReported = issueKey.value;
        emit("diagnostics", JSON.parse(lastReported) as SceneIssue[]);
      }
    };
    // Children mount first; mount() observes their entries and refresh() publishes measurements.
    onMounted(() => {
      unmount = registry.mount(stage.value!);
      registry.refresh();
      report();
    });
    onUpdated(() => { registry.refresh(); report(); });
    onBeforeUnmount(() => { unmount?.(); unmount = undefined; unsubscribe(); });
    return () => {
      const { evaluation, validated } = result.value;
      const camera = validated.success ? validated.data.camera : undefined;
      const { class: className, style: rawStyle, ...rest } = attrs;
      const style = (normalizeStyle(rawStyle) ?? {}) as Record<string, string | number>;
      const issues = evaluation.issues;
      return [
        h("div", {
          ...rest,
          class: className,
          "data-flute-scene": "",
          "data-flute-valid": issues.length === 0 ? "true" : "false",
          style: {
            ...style,
            background: SCENE_BACKGROUND,
            backgroundColor: SCENE_BACKGROUND,
            backgroundImage: "none",
            position: style.position ?? "relative",
            pointerEvents: "none",
            perspective: `${camera?.perspective ?? 1400}px`,
            perspectiveOrigin: "50% 50%",
            // Keep the backdrop outside the 3D sorting context so negative-z UI stays visible.
            // The inner camera stage preserves depth among all surfaces.
            transformStyle: "flat",
          },
        }, [
          h("div", {
            ref: stage,
            "data-flute-stage": "",
            style: {
              position: "relative",
              pointerEvents: "none",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
              transformOrigin: "50% 50%",
              transform: cameraToCss(camera),
            },
          }, slots.default?.()),
        ]),
        issues.length > 0
          ? h("div", { role: "alert", "data-flute-diagnostics": "" }, [
            h("strong", "Flute scene needs a correction."),
            h("ul", issues.map((issue, index) => h("li", { key: index }, `${issue.path}: ${issue.message}`))),
            h("p", "Correct the scene props or registered IDs; the scene updates automatically."),
          ])
          : null,
      ];
    };
  },
});
