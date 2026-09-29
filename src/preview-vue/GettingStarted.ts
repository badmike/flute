import { defineComponent, h, ref } from "vue";
import { FIRST_SCENE_PROMPT } from "../dom/onboarding";
import { BrandAttribution } from "./BrandAttribution";

/** SOURCE OF TRUTH: Vue GettingStarted.
 * WHAT: installed setup instructions and a copyable external-agent handoff for Vue hosts.
 * WHY: empty library and standalone preview share the same honest authoring path.
 * WHERE: SceneLibrary and ScenePreview; CLI guide / generated FLUTE.md own authoring rules.
 */
export const GettingStarted = defineComponent({
  name: "FluteGettingStarted",
  props: { label: { type: String, default: "Get started" } },
  setup(props) {
    const copyState = ref<"idle" | "copying" | "copied" | "failed">("idle");
    const copy = async () => {
      copyState.value = "copying";
      try { await navigator.clipboard.writeText(FIRST_SCENE_PROMPT); copyState.value = "copied"; }
      catch { copyState.value = "failed"; }
    };
    return () => h("details", { class: "flute-onboarding" }, [
      h("summary", { class: "flute-control" }, props.label),
      h("div", { class: "flute-onboarding-content" }, [
        h("ol", [
          h("li", ["In your app’s terminal, run ", h("code", "npx flute init"), " once to set up Flute."]),
          h("li", ["Keep your app’s dev server running. Give your coding agent the generated ", h("code", "FLUTE.md"), " and ", h("code", "npx flute guide"), "."]),
          h("li", ["Ask your agent to create a scene from your existing UI. Save each recipe in ", h("code", "src/flute/scenes/"), " with its matching ", h("code", ".vue"), " component. Flute discovers the files automatically."]),
        ]),
        h("p", { class: "flute-prompt-label" }, "Start in your coding agent"),
        h("p", { class: "flute-prompt" }, FIRST_SCENE_PROMPT),
        h("button", { class: "flute-control", disabled: copyState.value === "copying", onClick: copy },
          copyState.value === "copied" ? "Prompt copied" : copyState.value === "copying" ? "Copying…" : "Copy starter prompt"),
        h("p", { class: "flute-copy-status", role: "status" },
          copyState.value === "failed" ? "Clipboard unavailable. Select and copy the prompt above."
            : copyState.value === "copied" ? "Paste it into your coding agent to begin."
              : "Your agent edits the source. Return here to preview and refine."),
        h(BrandAttribution),
      ]),
    ]);
  },
});
