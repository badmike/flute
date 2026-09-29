import { CaptureManifestSchema, type CaptureBridge } from "../core/export";

/** SOURCE OF TRUTH: installCaptureBridge.
 * WHAT: register the single window.__FLUTE_CAPTURE__ bridge and validate every seek.
 * WHY: React and Vue exports must apply identical time, diagnostics and one-viewport rules.
 * WHERE: framework hooks supply the synchronous or promise-returning apply step; Node export
 * services read the bridge. Sync appliers are checked immediately; async appliers after they settle.
 */
export function installCaptureBridge({ durationMs, selector = '[data-flute-capture="scene"]', apply }:
  { durationMs: number; selector?: string; apply: (elapsedMs: number) => void | Promise<void> }): () => void {
  const host = window as typeof window & { __FLUTE_CAPTURE__?: unknown };
  if (host.__FLUTE_CAPTURE__) throw new Error("Only one capture viewport can be registered per page.");
  const check = () => {
    const viewport = document.querySelector(selector);
    if (viewport?.matches('[data-flute-valid="false"]') || viewport?.querySelector('[data-flute-valid="false"]'))
      throw new Error("Correct scene diagnostics before exporting; some content may bypass depth of field.");
  };
  const bridge: CaptureBridge = { ...CaptureManifestSchema.parse({ version: 1, durationMs, selector }), seek: (elapsedMs: number) => {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > durationMs) throw new Error("Capture time is outside the scene.");
    const applied = apply(elapsedMs);
    return applied ? applied.then(check) : check();
  } };
  host.__FLUTE_CAPTURE__ = bridge;
  return () => { if (host.__FLUTE_CAPTURE__ === bridge) delete host.__FLUTE_CAPTURE__; };
}
