import { createApp, defineComponent, h, ref } from "vue";
import { Scene, Surface } from "../../src/vue";

// Vue twin of tests/fixtures/focus.tsx: identical definitions, so parity tests can diff both DOMs.
const stripes = "repeating-linear-gradient(90deg,#fff 0px,#fff 4px,#000 4px,#000 8px)";
const Probe = defineComponent({
  setup() {
    const x = ref(0), pan = ref(0), focus = ref(1400), tilt = ref(45);
    return () => [
      h("div", { style: { position: "absolute", zIndex: 10 } }, [
        h("button", { onClick: () => { x.value = 96; } }, "Move surface"),
        h("button", { onClick: () => { pan.value = 96; } }, "Pan camera"),
        h("button", { onClick: () => { focus.value = 1250; } }, "Move focus"),
        h("button", { onClick: () => { tilt.value = 0; } }, "Tilt surface"),
      ]),
      h(Scene, { style: { width: 800, height: 400 }, camera: { x: pan.value }, focus: { distance: focus.value, fStop: 1.4, focalLength: 150, maxBlur: 6 } }, {
        default: () => h(Surface, {
          id: "probe", transform: { x: x.value, rotateY: tilt.value },
          style: { position: "absolute", left: 100, top: 50, width: 600, height: 300 },
        }, { default: () => h("div", { style: { height: 300, background: stripes } }) }),
      }),
    ];
  },
});
const planes = [{ id: "left", x: 80, z: 0 }, { id: "right", x: 310, z: 0 }, { id: "background", x: 580, z: -500 }];
const Planes = defineComponent({
  render: () => h(Scene, { style: { width: 800, height: 400 }, focus: { distance: 1400, fStop: 1.4, focalLength: 150, maxBlur: 6 } }, {
    default: () => h(Surface, { id: "group", style: { height: 400 } }, {
      default: () => planes.map(p => h(Surface, {
        key: p.id, id: p.id, transform: { z: p.z }, style: { position: "absolute", left: p.x, top: 140, width: 100, height: 100 },
      }, { default: () => h("div", { "data-testid": p.id, style: { height: 100, background: stripes } }) })),
    }),
  }),
});
// Numeric styles with unitless properties: React and Vue must serialize the same pixels and bare numbers.
const Units = defineComponent({
  render: () => h(Scene, { style: { width: 800, height: 400, opacity: 0.75, zIndex: 3 }, focus: { distance: 1400, fStop: 1.4, focalLength: 150, maxBlur: 0 } }, {
    default: () => h(Surface, {
      id: "unit", style: { position: "absolute", left: 40, top: 20, width: 200, height: 100, zIndex: 2, lineHeight: 1.5, flexGrow: 1, marginLeft: -8, paddingTop: 0 },
    }, { default: () => h("div", { style: { height: 100, opacity: 0.5, fontWeight: 600, background: stripes } }) }),
  }),
});
const search = location.search;
createApp(search.includes("planes") ? Planes : search.includes("units") ? Units : Probe).mount("#root");
