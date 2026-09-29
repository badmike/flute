import { defineComponent, h } from "vue";
import { FLUTE_BRAND } from "../core";

/** SOURCE OF TRUTH: Vue BrandAttribution.
 * WHAT: accessible creator attribution for Vue studio chrome.
 * WHY: every visible creator name links to the canonical FLUTE_BRAND destination.
 * WHERE: SceneLibrary, GettingStarted and ScenePreview; never inside scene capture.
 */
export const BrandAttribution = defineComponent({
  name: "FluteBrandAttribution",
  props: { showName: { type: Boolean, default: true } },
  setup(props) {
    return () => h("span", { class: "flute-attribution" }, [
      props.showName ? `${FLUTE_BRAND.name} ` : null,
      "by ",
      h("a", {
        href: FLUTE_BRAND.url, target: "_blank", rel: "noopener noreferrer",
        "aria-label": FLUTE_BRAND.creator + " on YouTube (opens in a new tab)",
      }, FLUTE_BRAND.creator),
    ]);
  },
});
