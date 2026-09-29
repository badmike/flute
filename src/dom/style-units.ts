/** SOURCE OF TRUTH: numeric style units for Flute's Vue components.
 * WHAT: append "px" to finite numeric style values, except for unitless properties.
 * WHY: React writes `width: 400`; Vue writes numbers verbatim, which silently drops the declaration.
 *      Flute's Vue components accept the React spelling so a numeric style means pixels in both.
 * WHERE: only Flute's own components call this; arbitrary host elements are never patched.
 * The unitless list mirrors React DOM's isUnitlessNumber table. CSS custom properties, `0`, strings
 * and non-finite numbers pass through unchanged. camelCase and kebab-case keys are both handled.
 */
const UNITLESS = new Set([
  "animationIterationCount", "aspectRatio", "borderImageOutset", "borderImageSlice", "borderImageWidth",
  "boxFlex", "boxFlexGroup", "boxOrdinalGroup", "columnCount", "columns", "flex", "flexGrow",
  "flexPositive", "flexShrink", "flexNegative", "flexOrder", "gridArea", "gridRow", "gridRowEnd",
  "gridRowSpan", "gridRowStart", "gridColumn", "gridColumnEnd", "gridColumnSpan", "gridColumnStart",
  "fontWeight", "lineClamp", "lineHeight", "opacity", "order", "orphans", "scale", "tabSize", "widows",
  "zIndex", "zoom", "fillOpacity", "floodOpacity", "stopOpacity", "strokeDasharray", "strokeDashoffset",
  "strokeMiterlimit", "strokeOpacity", "strokeWidth",
]);
const VENDOR = /^(?:webkit|moz|ms|o)(?=[A-Z])/;

function isUnitless(property: string): boolean {
  // "-webkit-line-clamp" / "WebkitLineClamp" / "webkitLineClamp" -> "lineClamp"
  const camel = property.replace(/^-/, "").replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const bare = camel.charAt(0).toLowerCase() + camel.slice(1);
  const unprefixed = bare.replace(VENDOR, "");
  return UNITLESS.has(unprefixed.charAt(0).toLowerCase() + unprefixed.slice(1));
}

export function withPixelUnits<T extends Record<string, unknown>>(style: T): T {
  const result: Record<string, unknown> = {};
  for (const [property, value] of Object.entries(style)) {
    result[property] = typeof value === "number" && Number.isFinite(value) && value !== 0
      && !property.startsWith("--") && !isUnitless(property)
      ? `${value}px`
      : value;
  }
  return result as T;
}
