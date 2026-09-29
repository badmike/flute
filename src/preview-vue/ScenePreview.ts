import {
  Teleport, computed, defineComponent, h, onBeforeUnmount, ref, shallowRef, useId, watch, type PropType, type VNode,
} from "vue";
import { ExportFrameRateSchema, SUPPORTED_EXPORT_FPS, type PreviewDefinitionInput } from "../core";
import { previewTheme } from "../dom/theme";
import { Scene, SceneErrorBoundary, useSceneCapture } from "../vue";
import { BrandAttribution } from "./BrandAttribution";
import { usePreviewConnection, type PreviewHot } from "./connection";
import { GettingStarted } from "./GettingStarted";
import { useVuePreviewSession } from "./session";

/** SOURCE OF TRUTH: Vue ScenePreview.
 * WHAT: the Vue studio viewport, playback, source recovery and export entry.
 * WHY: Vue hosts get the same controls, DOM markers and capture rules as the React preview.
 * WHERE: session owns lifecycle; core validates/evaluates; Scene renders the original default slot.
 * Teleports place the canvas inside the viewport and canonical recovery outside capture.
 * data-flute-preview-chrome marks overlay pixels for the export service to hide in its page.
 * Pass onBack as a prop (@back) to intercept ordinary back navigation; modified clicks keep backHref.
 * No clone, snapshot or host CSS reset.
 */
const timeLabel = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const svg = (children: VNode[]) => h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "aria-hidden": "true" }, children);
const glyph = (kind: "play" | "pause" | "restart" | "export") => svg([
  kind === "play" ? h("path", { d: "m9 5 11 7-11 7Z", fill: "currentColor", stroke: "none" })
    : kind === "pause" ? h("path", { d: "M8 5v14M16 5v14", "stroke-width": "4" })
      : kind === "restart" ? h("path", { d: "M5 9a8 8 0 1 1 0 7M5 3v6h6" })
        : h("path", { d: "M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" }),
]);
const Capture = defineComponent({
  name: "FluteCapture",
  props: { durationMs: { type: Number, required: true }, seek: { type: Function as PropType<(ms: number) => void>, required: true } },
  setup(props) {
    useSceneCapture({ durationMs: () => props.durationMs, seek: ms => props.seek(ms) });
    return () => null;
  },
});
const ExportMenu = defineComponent({
  name: "FluteExportMenu",
  props: { disabled: { type: Boolean, required: true }, panelHost: { type: Object as PropType<HTMLDivElement | null>, default: null } },
  setup(props) {
    const open = ref(false);
    const panelId = useId();
    const details = shallowRef<HTMLDetailsElement | null>(null);
    const fps = ref(60);
    const copied = ref(false);
    const copyError = ref(false);
    watch([() => props.disabled, open, () => props.panelHost], () => {
      if (props.disabled) open.value = false;
      else if (open.value) props.panelHost?.querySelector("select")?.focus();
    }, { flush: "post" });
    // Shell quoting is presentation only; the CLI owns request validation and file effects.
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    return () => {
      if (props.disabled) return h("button", { class: "flute-control", disabled: true }, [glyph("export"), "Export"]);
      const command = `npx flute export --url ${quote(typeof location === "undefined" ? "http://localhost:5173" : location.href)} --output scene-${fps.value}.mp4 --fps ${fps.value}`;
      const panel = open.value && props.panelHost ? h(Teleport, { to: props.panelHost }, [
        h("div", {
          id: panelId, role: "region", "aria-label": "Export your scene", class: "flute-export-panel flute-chrome",
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === "Escape" && details.value) {
              details.value.open = false;
              open.value = false;
              details.value.querySelector("summary")?.focus();
            }
          },
        }, [
          h("strong", "Export your scene"),
          h("p", "Run this in your project to save an MP4. Use a new filename for each export."),
          h("label", ["Frame rate", h("select", {
            "aria-label": "Export frame rate", value: fps.value,
            onChange: (event: Event) => { fps.value = ExportFrameRateSchema.parse(Number((event.target as HTMLSelectElement).value)); copied.value = false; },
          }, SUPPORTED_EXPORT_FPS.map(value => h("option", { key: value, value }, `${value} fps`)))]),
          h("code", command),
          h("button", {
            class: "flute-control flute-primary",
            onClick: async () => {
              try { await navigator.clipboard.writeText(command); copied.value = true; copyError.value = false; }
              catch { copyError.value = true; }
            },
          }, copied.value ? "Copied" : "Copy command"),
          h("p", { role: "status" }, copyError.value ? "Select and copy the command above." : "Requires Chromium and FFmpeg on your machine."),
        ]),
      ]) : null;
      return h("details", { class: "flute-export", ref: details, onToggle: (event: Event) => { open.value = (event.currentTarget as HTMLDetailsElement).open; } }, [
        h("summary", { class: "flute-control flute-primary", "aria-controls": panelId }, [glyph("export"), "Export"]),
        panel,
      ]);
    };
  },
});

export const VueScenePreview = defineComponent({
  name: "FluteScenePreview",
  props: {
    definition: { type: Object as PropType<PreviewDefinitionInput> },
    title: { type: String, default: "Untitled scene" },
    backHref: { type: String },
    onBack: { type: Function as PropType<() => void> },
    revision: { type: null, default: undefined },
    hot: { type: Object as PropType<PreviewHot> },
  },
  setup(props, { slots }) {
    const session = useVuePreviewSession(() => props.definition, () => props.revision);
    const connection = usePreviewConnection(() => props.hot, session.pause);
    const renderError = ref("");
    const size = ref({ width: 0, height: 0 });
    const viewport = shallowRef<HTMLDivElement | null>(null);
    const exportPanel = shallowRef<HTMLDivElement | null>(null);
    const resetKey = computed(() => ({ revision: props.revision, input: props.definition, generation: connection.generation }));
    const failure = (error: unknown) => { session.pause(); renderError.value = error instanceof Error ? error.message : String(error); };
    let observer: ResizeObserver | null = null;
    watch(viewport, element => {
      observer?.disconnect();
      observer = null;
      if (!element) return;
      const measure = () => { size.value = { width: element.clientWidth, height: element.clientHeight }; };
      observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
      observer?.observe(element);
      measure();
    });
    onBeforeUnmount(() => observer?.disconnect());
    const blocked = computed(() => !session.valid.value || !connection.connected || !!connection.error || !!renderError.value);
    const captureSeek = (ms: number) => {
      if (blocked.value) throw new Error("Correct the scene before exporting.");
      session.seek(ms);
    };
    return () => {
      const definition = session.definition.value;
      const scale = definition && size.value.width && size.value.height
        ? Math.max(size.value.width / definition.width, size.value.height / definition.height) : 1;
      const issues = session.issues.value;
      const stateText = !connection.connected ? "Reconnecting to your app…" : connection.error ? "Source needs a correction"
        : connection.updating ? "Updating scene…" : renderError.value || issues.length ? "Scene needs a correction"
          : !definition ? "Waiting for a scene" : session.playing.value ? "Playing" : "Live preview";
      const durationMs = session.durationMs.value;
      const timeMs = session.timeMs.value;
      const canvas = definition && viewport.value ? h(Teleport, { to: viewport.value }, [
        h("div", { class: "flute-canvas", "data-flute-capture": "scene", "data-flute-valid": blocked.value ? "false" : "true", style: { width: "100%", height: "100%" } }, [
          // One aspect-preserving cover frame fills preview and capture; overflow is cropped, never stretched.
          h("div", { style: { position: "absolute", left: "50%", top: "50%", width: `${definition.width}px`, height: `${definition.height}px`, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" } }, [
            h(Scene, {
              camera: definition.scene.camera, focus: definition.scene.focus, motion: definition.motion, timeMs,
              onDiagnostics: session.onDiagnostics, style: { width: `${definition.width}px`, height: `${definition.height}px` },
            }, { default: () => slots.default?.() }),
          ]),
          h(Capture, { durationMs, seek: captureSeek }),
        ]),
      ]) : null;
      const back = props.backHref
        ? h("a", {
          class: "flute-control", href: props.backHref,
          onClick: (event: MouseEvent) => {
            if (props.onBack && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault(); props.onBack();
            }
          },
        }, props.onBack ? "Back to scenes" : "Back to app")
        : props.onBack ? h("button", { class: "flute-control", onClick: () => props.onBack!() }, "Back to scenes") : null;
      const label = session.playing.value ? "Pause" : timeMs >= durationMs && durationMs ? "Replay" : "Play";
      return h("main", { "data-flute-preview": "", "data-flute-state": blocked.value ? "unavailable" : "ready" }, [
        h("style", previewTheme),
        h("div", { class: "flute-viewport", ref: viewport, "aria-label": "Scene preview" }, [
          !definition ? h("div", { class: "flute-empty flute-chrome" }, [
            h("span", { class: "flute-empty-symbol", "aria-hidden": "true" }, "↗"),
            h("h1", ["A new perspective", h("br"), "on your product."]),
            h("p", "Your live scene will appear here. Open Flute inside your app, then ask your coding agent to compose its first scene."),
          ]) : null,
        ]),
        h("div", { class: "flute-bottom-blur", "data-flute-preview-chrome": "", "aria-hidden": "true" }, [h("i"), h("i"), h("i")]),
        h("footer", { class: "flute-footer flute-chrome", "data-flute-preview-chrome": "", "aria-label": "Scene controls" }, [
          h("div", { class: "flute-controls" }, [
            h("div", { class: "flute-export-slot", ref: exportPanel }),
            issues.length > 0 || connection.error || !connection.connected ? h("section", { class: "flute-message flute-chrome", role: "alert" }, [
              h("strong", stateText),
              issues.length > 0 ? [
                h("p", "Your last valid scene settings are retained. Correct the source to continue."),
                h("ul", issues.map((issue, index) => h("li", { key: index }, `${issue.path}: ${issue.message}`))),
              ] : null,
              connection.error ? h("p", connection.error) : null,
              !connection.connected ? h("p", "Keep your development server running. The preview reconnects automatically.") : null,
            ]) : null,
            // Recovery stays in the controls; only live scene content enters the capture viewport.
            h(SceneErrorBoundary, { resetKey: resetKey.value, onError: failure, onReset: () => { renderError.value = ""; } }, { default: () => canvas }),
            h("div", { class: "flute-header" }, [
              h("div", { class: "flute-heading" }, [back, h("h1", { class: "flute-title" }, props.title)]),
              h(ExportMenu, { disabled: blocked.value || !durationMs, panelHost: exportPanel.value }),
            ]),
            !definition ? h(GettingStarted) : null,
            h("div", { class: "flute-dock" }, [
              h("button", { class: "flute-control flute-primary flute-icon", disabled: blocked.value || !durationMs, "aria-label": label, onClick: session.toggle }, [glyph(session.playing.value ? "pause" : "play")]),
              h("button", { class: "flute-control flute-icon", "aria-label": "Restart", disabled: !definition, onClick: () => session.seek(0) }, [glyph("restart")]),
              h("input", {
                class: "flute-timeline", "aria-label": "Scene time", "aria-valuetext": timeLabel(timeMs), type: "range",
                min: 0, max: durationMs || 1, step: 10, value: timeMs, disabled: blocked.value || !durationMs,
                onInput: (event: Event) => session.seek(Number((event.target as HTMLInputElement).value)),
              }),
              h("output", { class: "flute-time", "data-testid": "scene-time" }, `${timeLabel(timeMs)} / ${timeLabel(durationMs)}`),
            ]),
            h("div", { class: "flute-preview-meta" }, [
              h("span", { class: "flute-status", role: "status" }, [h("span", { class: "flute-status-dot" }), stateText]),
              h(BrandAttribution),
            ]),
          ]),
        ]),
      ]);
    };
  },
});
