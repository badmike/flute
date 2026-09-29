import { describe, expect, it } from "vitest";
import { withPixelUnits } from "../../src/dom/style-units";

describe("withPixelUnits", () => {
  it("appends px to finite numbers, including negative and fractional values", () => {
    expect(withPixelUnits({ width: 400, marginLeft: -12, top: 0.5, fontSize: 16 })).toEqual({
      width: "400px", marginLeft: "-12px", top: "0.5px", fontSize: "16px",
    });
  });
  it("leaves unitless properties as numbers", () => {
    const unitless = {
      opacity: 0.5, zIndex: 2, flex: 1, flexGrow: 2, flexShrink: 0.5, order: 3, lineHeight: 1.4, fontWeight: 600,
      zoom: 2, aspectRatio: 1.5, gridRowStart: 2, gridColumnEnd: 4, gridArea: 1, columnCount: 3, columns: 2, orphans: 2,
      widows: 2, tabSize: 4, animationIterationCount: 3, borderImageSlice: 1, boxFlex: 1, fillOpacity: 0.3,
      floodOpacity: 0.3, stopOpacity: 0.3, strokeOpacity: 0.3, strokeWidth: 2, strokeDasharray: 4, strokeDashoffset: 2,
      strokeMiterlimit: 4, scale: 1.2, lineClamp: 3,
    };
    expect(withPixelUnits(unitless)).toEqual(unitless);
  });
  it("handles kebab-case and vendor-prefixed keys", () => {
    expect(withPixelUnits({ "z-index": 2, "line-height": 1.2, "flex-grow": 1, "font-size": 14, "max-width": 300, "-webkit-line-clamp": 2, WebkitLineClamp: 2, WebkitMarginStart: 4 }))
      .toEqual({ "z-index": 2, "line-height": 1.2, "flex-grow": 1, "font-size": "14px", "max-width": "300px", "-webkit-line-clamp": 2, WebkitLineClamp: 2, WebkitMarginStart: "4px" });
  });
  it("leaves custom properties, zero, strings, non-finite numbers and other types untouched", () => {
    const style = { "--gap": 8, "--Width": 4, width: 0, height: "50%", left: "12px", top: Number.NaN, right: Infinity, bottom: -Infinity, color: undefined, margin: null };
    expect(withPixelUnits(style)).toEqual(style);
  });
  it("does not mutate its input", () => {
    const style = { width: 10 };
    withPixelUnits(style);
    expect(style).toEqual({ width: 10 });
  });
});
