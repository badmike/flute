import { installCaptureBridge } from "../dom/capture";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
/** SOURCE OF TRUTH: useSceneCapture.
 * WHAT: expose a single explicitly registered live viewport to local frame capture.
 * WHY: exports seek the same controller/Scene clock; no second animation evaluator.
 * WHERE: Node export services read this bridge; callers mark their capture viewport.
 * No network listener, file access, or authentication lives in this browser adapter.
 */
export function useSceneCapture({durationMs,seek,selector='[data-flute-capture="scene"]'}:
  {durationMs:number;seek:(elapsedMs:number)=>void;selector?:string}) {
  const current=useRef(seek);
  current.current=seek;
  useEffect(()=>installCaptureBridge({durationMs,selector,apply:elapsedMs=>{flushSync(()=>current.current(elapsedMs))}}),[durationMs,selector]);
}
