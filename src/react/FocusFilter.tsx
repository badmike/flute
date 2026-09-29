import type { EvaluatedNode } from "../core";
import { DEPTH_TEXTURES, focusFilterModel } from "../dom/focus-filter";
/** SOURCE OF TRUTH: FocusFilter presentation.
 * WHAT: two cached linear depth textures and native SVG tables blend live Gaussian samples.
 * WHY: reuse cached raster ramps; never encode/decode image documents per frame.
 * WHERE: core/spatial supplies the canonical weights; dom/focus-filter computes the model; Surface filters visual leaves.
 * Uses native feImage sampling and feComponentTransfer table interpolation.
 */
export function FocusFilter({ id, node }: { id: string; node: EvaluatedNode }) {
  const { pad, width, height, mask, bands, extent, margin } = focusFilterModel(node);
  const DEPTH_X = DEPTH_TEXTURES.x, DEPTH_Y = DEPTH_TEXTURES.y;

  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        <filter
          id={id}
          filterUnits="userSpaceOnUse"
          primitiveUnits="userSpaceOnUse"
          x={-pad}
          y={-pad}
          width={width + 2 * pad}
          height={height + 2 * pad}
          colorInterpolationFilters="sRGB"
        >
          <feImage href={DEPTH_X} x={-pad} y={-pad} width={width+2*pad} height={height+2*pad} preserveAspectRatio="none" result="axisX" />
          <feComponentTransfer in="axisX" result="depthX"><feFuncA type="table" tableValues={mask.reverseX ? "1 0" : "0 1"} /></feComponentTransfer>
          <feImage href={DEPTH_Y} x={-pad} y={-pad} width={width+2*pad} height={height+2*pad} preserveAspectRatio="none" result="axisY" />
          <feComponentTransfer in="axisY" result="depthY"><feFuncA type="table" tableValues={mask.reverseY ? "1 0" : "0 1"} /></feComponentTransfer>
          <feComposite in="depthX" in2="depthY" operator="arithmetic" k2={mask.xWeight} k3={mask.yWeight} result="depth" />
          {bands.map(band => <FilterBand key={band.index} width={width} height={height} extent={extent} margin={margin} {...band} />)}
        </filter>
      </defs>
    </svg>
  );
}
function FilterBand({
  index: i,
  width,
  height,
  extent,
  margin,
  weights,
  previous,
  deviation,
}: {
  index: number;
  width: number;
  height: number;
  extent: number;
  margin: number;
  weights: number[];
  previous?: number;
  deviation: number;
}) {
  return (
    <>
      <feGaussianBlur in="SourceGraphic" stdDeviation={deviation} result={`blur${i}`} />
      <feComponentTransfer
        in="depth"
        x={margin}
        y={margin}
        width={width + extent}
        height={height + extent}
        result={`mask${i}`}
      >
        <feFuncA type="table" tableValues={weights.join(" ")} />
      </feComponentTransfer>
      <feComposite in={`blur${i}`} in2={`mask${i}`} operator="in" result={`part${i}`} />
      {previous === undefined ? (
        <feComposite in={`part${i}`} in2={`part${i}`} operator="arithmetic" k2={1} result={`sum${i}`} />
      ) : (
        <feComposite in={`sum${previous}`} in2={`part${i}`} operator="arithmetic" k2={1} k3={1} result={`sum${i}`} />
      )}
    </>
  );
}
